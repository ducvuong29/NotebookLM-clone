import { useNotebookMembers } from '@/hooks/useCollaborationApi';
import { useAuth } from '@/contexts/AuthContext';

export interface NotebookPermissions {
  role: 'owner' | 'editor' | 'viewer' | null;
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canChat: boolean;
  canView: boolean;
  isOwner: boolean;
  isMember: boolean;
  isLoading: boolean;
}

export function useNotebookPermissions(
  notebookId: string | undefined,
  notebookOwnerId?: string,
  notebookVisibility?: string
): NotebookPermissions {
  const { user } = useAuth();
  const { data: members, isLoading } = useNotebookMembers(notebookId);

  const isNotebookOwner = notebookOwnerId === user?.id;
  const memberRecord = members?.find(m => m.user_id === user?.id);
  const memberRole = memberRecord?.role as 'editor' | 'viewer' | undefined;

  const role = isNotebookOwner ? 'owner' : memberRole ?? null;
  const isPublic = notebookVisibility === 'public';
  
  const canEdit = role === 'owner' || role === 'editor';
  const canDelete = role === 'owner' || role === 'editor'; // Allow editors to delete sources and notes
  const canInvite = role === 'owner';
  // Public notebook visitors (logged-in but no role) can chat and view
  const canChat = role !== null || isPublic;
  const canView = role !== null || isPublic;
  const isOwner = role === 'owner';
  const isMember = role !== null;

  return {
    role,
    canEdit,
    canDelete,
    canInvite,
    canChat,
    canView,
    isOwner,
    isMember,
    isLoading,
  };
}
