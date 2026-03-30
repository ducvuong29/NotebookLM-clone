
import React, { useState, useCallback } from 'react';
import { UserPlus, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInvitations, type PendingInvitation } from '@/hooks/useInvitations';
import { useRealtimeInvitations } from '@/hooks/useRealtimeInvitations';
import { useRespondInvitation } from '@/hooks/useCollaborationApi';
import { cn } from '@/lib/utils';

// ============================================================================
// InvitationCard — Individual invitation display
// Extracted to avoid inline component anti-pattern (rerender-no-inline-components)
// ============================================================================

interface InvitationCardProps {
  invitation: PendingInvitation;
  onRespond: (memberId: string, response: 'accepted' | 'declined') => void;
  isResponding: boolean;
  index: number;
}

const InvitationCard = ({ invitation, onRespond, isResponding, index }: InvitationCardProps) => {

  return (
    <div
      className={cn(
        'group relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-300',
        'bg-card/80 backdrop-blur-sm border-border/60',
        'hover:shadow-md hover:border-amber-300/50 dark:hover:border-amber-600/40',
        'animate-in slide-in-from-top-2 fade-in',
        isResponding && 'opacity-50 scale-[0.98]',
      )}
      style={{ animationDelay: `${index * 80}ms`, animationFillMode: 'both' }}
    >
      {/* Accent gradient bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 dark:from-amber-500 dark:via-amber-600 dark:to-orange-600" />

      {/* Notebook icon */}
      <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center ml-2">
        <span className="text-xl">{invitation.notebook_icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">
          Bạn được mời tham gia notebook{' '}
          <span className="font-semibold text-foreground">
            &ldquo;{invitation.notebook_title}&rdquo;
          </span>
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge
            variant="secondary"
            className={cn(
              'text-xs font-medium',
              invitation.role === 'editor'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-700/50'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50'
            )}
          >
            {invitation.role_label}
          </Badge>
          {invitation.inviter_name ? (
            <span className="text-xs text-muted-foreground truncate">
              Được mời bởi {invitation.inviter_name}
            </span>
          ) : null}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => onRespond(invitation.id, 'accepted')}
          disabled={isResponding}
          className={cn(
            'h-9 px-4 gap-1.5 rounded-lg font-medium transition-all',
            'bg-emerald-600 hover:bg-emerald-700 text-white',
            'dark:bg-emerald-600 dark:hover:bg-emerald-500',
            'shadow-sm hover:shadow-md active:scale-95',
          )}
        >
          {isResponding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Chấp nhận</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(invitation.id, 'declined')}
          disabled={isResponding}
          className={cn(
            'h-9 px-3 gap-1.5 rounded-lg transition-all',
            'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            'active:scale-95',
          )}
        >
          {isResponding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Từ chối</span>
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// InvitationBanner — Section wrapper for all pending invitations
// Renders above notebooks grid on Dashboard
// Returns null when no invitations (js-early-exit — zero DOM waste)
// ============================================================================

const InvitationBanner = () => {
  const { data: invitations = [], isLoading } = useInvitations();
  const respondMutation = useRespondInvitation();
  const [respondingIds, setRespondingIds] = useState<Record<string, boolean>>({});

  // Subscribe to Realtime changes
  useRealtimeInvitations();

  // Stable callback via useCallback (rerender-functional-setstate)
  const handleRespond = useCallback(
    (memberId: string, response: 'accepted' | 'declined') => {
      setRespondingIds((prev) => ({ ...prev, [memberId]: true }));
      respondMutation.mutate(
        { member_id: memberId, response },
        {
          onSettled: () => {
            setRespondingIds((prev) => {
              const next = { ...prev };
              delete next[memberId];
              return next;
            });
          },
        }
      );
    },
    [respondMutation]
  );

  // Early exit: nothing to show (js-early-exit)
  if (isLoading || invitations.length === 0) return null;

  return (
    <section
      id="invitation-banner"
      className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500"
    >
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight font-heading">
          Lời mời cộng tác
        </h2>
        <Badge
          variant="secondary"
          className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700/50"
        >
          {invitations.length}
        </Badge>
      </div>

      {/* Invitation cards */}
      <div className="flex flex-col gap-3">
        {invitations.map((invitation, index) => (
          <InvitationCard
            key={invitation.id}
            invitation={invitation}
            onRespond={handleRespond}
            isResponding={!!respondingIds[invitation.id]}
            index={index}
          />
        ))}
      </div>
    </section>
  );
};

export default InvitationBanner;
