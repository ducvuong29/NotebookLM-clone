import React, { useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, LogOut, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotebookUpdate } from '@/hooks/useNotebookUpdate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/services/authService';
import Logo from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import PermissionBadge from './PermissionBadge';
import { Users } from 'lucide-react';
import CollaborationErrorBoundary from './CollaborationErrorBoundary';
import { useNotebookMembers } from '@/hooks/useCollaborationApi';

const MemberPanel = React.lazy(() => import('./MemberPanel'));


interface NotebookHeaderProps {
  title: string;
  notebookId?: string;
  notebookOwnerId?: string;
  // Permission props — derived from useNotebookPermissions in Notebook.tsx
  role?: string | null;
  canEdit?: boolean;
  canInvite?: boolean;
  isMember?: boolean;
}

const NotebookHeader = ({
  title,
  notebookId,
  notebookOwnerId,
  role = null,
  canEdit = true,
  canInvite = false,
  isMember = false,
}: NotebookHeaderProps) => {
  const navigate = useNavigate();
  const { logout } = useLogout();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const { updateNotebook, isUpdating } = useNotebookUpdate();
  const [isMemberPanelOpen, setIsMemberPanelOpen] = useState(false);
  
  // Member count — uses TanStack Query dedup (same key as Notebook.tsx's useNotebookPermissions)
  const { data: members } = useNotebookMembers(notebookId);
  const memberCount = members?.length ?? 0;

  const handleTitleClick = () => {
    if (notebookId && canEdit) {
      setIsEditing(true);
      setEditedTitle(title);
    }
  };

  const handleTitleSubmit = () => {
    if (notebookId && editedTitle.trim() && editedTitle !== title) {
      updateNotebook({
        id: notebookId,
        updates: { title: editedTitle.trim() }
      });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditedTitle(title);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleTitleSubmit();
  };

  const handleIconClick = () => {
    navigate('/');
  };

  return (
    <header className="bg-background border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button 
              aria-label="Về trang trước"
              onClick={() => navigate(-1)}
              className="hover:bg-muted rounded transition-colors p-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button 
              aria-label="Về trang chủ"
              onClick={handleIconClick}
              className="hover:bg-muted rounded transition-colors p-1"
            >
              <Logo />
            </button>
            {isEditing ? (
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="text-lg font-medium text-foreground border-none shadow-none p-0 h-auto focus-visible:ring-0 min-w-[300px] w-auto"
                autoFocus
                disabled={isUpdating}
              />
            ) : (
              <div className="flex items-center space-x-3">
                <span 
                  className={`text-lg font-medium text-foreground ${canEdit ? 'cursor-pointer hover:bg-muted' : 'cursor-default'} rounded px-2 py-1 transition-colors`}
                  onClick={handleTitleClick}
                >
                  {title}
                </span>
                <PermissionBadge role={role} />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {/* Allow all members to see the MemberPanel to view the list of members */}
            {isMember && notebookId && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsMemberPanelOpen(true)}
                className="hidden md:flex"
              >
                <Users className="h-4 w-4 mr-2" />
                Thành viên
                {/* AC #7: Member count badge next to Share button */}
                {memberCount > 1 && (
                  <span className="ml-1.5 bg-primary/10 text-primary text-xs font-medium rounded-full px-1.5 min-w-[20px] text-center">
                    {memberCount}
                  </span>
                )}
              </Button>
            )}
            {isMemberPanelOpen && notebookId && (
              <CollaborationErrorBoundary>
                <Suspense fallback={null}>
                  <MemberPanel 
                    notebookId={notebookId}
                    notebookOwnerId={notebookOwnerId}
                    isOpen={isMemberPanelOpen}
                    onOpenChange={setIsMemberPanelOpen}
                  />
                </Suspense>
              </CollaborationErrorBoundary>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Menu người dùng" variant="ghost" size="sm" className="p-0">
                  <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-purple-600 transition-colors">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={logout} className="cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NotebookHeader;
