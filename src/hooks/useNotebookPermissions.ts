import { useNotebookMembers } from '@/hooks/useCollaborationApi';
import { useAuth } from '@/contexts/AuthContext';

export interface NotebookPermissions {
  role: 'admin' | 'owner' | 'editor' | 'viewer' | null;
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canChat: boolean;
  canView: boolean;
  isOwner: boolean;
  isMember: boolean;
  isLoading: boolean;
}

export function useNotebookPermissions(notebookId: string | undefined, notebookOwnerId?: string): NotebookPermissions {
  const { user } = useAuth();
  const { data: members, isLoading } = useNotebookMembers(notebookId);

  const isAdmin = user?.user_metadata?.role === 'admin';
  const isNotebookOwner = notebookOwnerId === user?.id;
  const memberRecord = members?.find(m => m.user_id === user?.id && m.status === 'accepted');
  const memberRole = memberRecord?.role as 'editor' | 'viewer' | undefined;

  const role = isAdmin ? 'admin' : isNotebookOwner ? 'owner' : memberRole ?? null;
  
  const canEdit = role === 'owner' || role === 'editor' || role === 'admin';
  const canDelete = role === 'owner' || role === 'admin';
  const canInvite = role === 'owner' || role === 'admin';
  const canChat = role !== null;
  const canView = role !== null;
  const isOwner = role === 'owner' || (isNotebookOwner && role !== 'admin');
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
