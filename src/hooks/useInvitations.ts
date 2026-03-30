
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ============================================================================
// Types
// ============================================================================

export interface PendingInvitation {
  id: string;
  notebook_id: string;
  notebook_title: string;
  notebook_icon: string;
  role: string;
  role_label: string;
  inviter_name: string | null;
  invited_by: string | null;
  created_at: string;
}

// Raw row shape from notebook_members
interface NotebookMemberRow {
  id: string;
  notebook_id: string;
  role: string;
  status: string;
  invited_by: string | null;
  created_at: string;
}

// ============================================================================
// Constants
// ============================================================================

const INVITATION_EXPIRY_DAYS = 14;

// Vietnamese role labels — derived during render (rerender-derived-state-no-effect)
const ROLE_LABELS: Record<string, string> = {
  editor: 'Biên tập viên',
  viewer: 'Người xem',
};

// ============================================================================
// useInvitations — Fetches pending invitations for the current user
// Query key: ['invitations'] (per architecture doc FA-1)
// ============================================================================

export function useInvitations() {
  const { user, isAuthenticated } = useAuth();

  return useQuery<PendingInvitation[]>({
    queryKey: ['invitations'],
    queryFn: async (): Promise<PendingInvitation[]> => {
      if (!user) return [];

      // Select only needed columns (data-select-columns.md)
      // Uses partial index notebook_members_pending_idx: (user_id) WHERE status = 'pending'
      // notebook_members not in generated types — use raw fetch via postgrest
      const { data: rawMembers, error: membersError } = await (supabase as any)
        .from('notebook_members')
        .select('id, notebook_id, role, status, invited_by, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (membersError) {
        console.error('[useInvitations] fetch error:', membersError);
        throw membersError;
      }

      const members = (rawMembers ?? []) as unknown as NotebookMemberRow[];
      if (members.length === 0) return [];

      // Lazy expiration check: filter out invitations older than 14 days
      const now = Date.now();
      const expiryMs = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const validMembers: NotebookMemberRow[] = [];
      const expiredIds: string[] = [];

      // Single pass: partition valid vs expired (js-combine-iterations)
      for (const m of members) {
        const age = now - new Date(m.created_at).getTime();
        if (age > expiryMs) {
          expiredIds.push(m.id);
        } else {
          validMembers.push(m);
        }
      }

      // Lazily expire old invitations via Edge Function (non-blocking)
      // Chunk into batches of 50 to respect backend BATCH_TOO_LARGE limit
      if (expiredIds.length > 0) {
        console.log('[useInvitations] Expiring', expiredIds.length, 'old invitations');
        const BATCH_SIZE = 50;
        for (let i = 0; i < expiredIds.length; i += BATCH_SIZE) {
          const chunk = expiredIds.slice(i, i + BATCH_SIZE);
          // Fire-and-forget: don't await (js-request-idle-callback principle)
          supabase.functions.invoke('collaboration-api', {
            body: { action: 'expire_invitations', member_ids: chunk } as Record<string, unknown>,
          }).catch((err: unknown) => {
            console.error('[useInvitations] expire_invitations error:', err);
          });
        }
      }

      if (validMembers.length === 0) return [];

      // Batch-load notebook titles (data-n-plus-one.md)
      // Deduplicate IDs to avoid redundant query data
      const notebookIds = [...new Set(validMembers.map(m => m.notebook_id))];
      const { data: notebooks } = await supabase
        .from('notebooks')
        .select('id, title, icon')
        .in('id', notebookIds);

      const notebookMap = new Map(
        (notebooks ?? []).map((n: { id: string; title: string; icon: string | null }) => [n.id, n])
      );

      // Batch-load inviter profiles (data-n-plus-one.md)
      const inviterIds = validMembers
        .map(m => m.invited_by)
        .filter((id): id is string => id !== null);

      let profileMap = new Map<string, { full_name: string | null }>();

      if (inviterIds.length > 0) {
        const uniqueInviterIds = [...new Set(inviterIds)];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uniqueInviterIds);

        profileMap = new Map(
          (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p])
        );
      }

      // Map to PendingInvitation[] — derive labels during render (rerender-derived-state-no-effect)
      return validMembers.map((m): PendingInvitation => {
        const notebook = notebookMap.get(m.notebook_id);
        const inviterProfile = m.invited_by ? profileMap.get(m.invited_by) : null;

        return {
          id: m.id,
          notebook_id: m.notebook_id,
          notebook_title: notebook?.title ?? 'Notebook',
          notebook_icon: (notebook as any)?.icon ?? '📝',
          role: m.role,
          role_label: ROLE_LABELS[m.role] ?? m.role,
          inviter_name: inviterProfile?.full_name ?? null,
          invited_by: m.invited_by,
          created_at: m.created_at,
        };
      });
    },
    enabled: isAuthenticated && !!user,
    staleTime: 30_000, // 30s — matches existing hooks
  });
}
