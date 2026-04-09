import React, { Suspense, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ArrowLeft, LogOut, User, Users, Workflow } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/services/authService';
import { useNotebookUpdate } from '@/hooks/useNotebookUpdate';
import { useNotebookMembers } from '@/hooks/useCollaborationApi';
import Logo from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import PermissionBadge from './PermissionBadge';
import CollaborationErrorBoundary from './CollaborationErrorBoundary';

// [perf] Shared lazy instance from registry
import { LazyMemberPanel } from './lazy-components';

interface NotebookHeaderProps {
  title: string;
  notebookId?: string;
  notebookOwnerId?: string;
  role?: string | null;
  canEdit?: boolean;
  canInvite?: boolean;
  isMember?: boolean;
  showFlowchartToggle?: boolean;
  isFlowchartActive?: boolean;
  onToggleFlowchart?: () => void;
  onNavigateHome?: () => void;
  onNavigateBack?: () => void;
}

const NotebookHeader = ({
  title,
  notebookId,
  notebookOwnerId,
  role = null,
  canEdit = true,
  canInvite = false,
  isMember = false,
  showFlowchartToggle = false,
  isFlowchartActive = false,
  onToggleFlowchart,
  onNavigateHome,
  onNavigateBack,
}: NotebookHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useLogout();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isMemberPanelOpen, setIsMemberPanelOpen] = useState(false);
  const { updateNotebook, isUpdating } = useNotebookUpdate();

  const fromSearch = (location.state as { fromSearch?: string })?.fromSearch;
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
        updates: { title: editedTitle.trim() },
      });
    }

    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleTitleSubmit();
    } else if (event.key === 'Escape') {
      setEditedTitle(title);
      setIsEditing(false);
    }
  };

  const handleBackClick = () => {
    if (onNavigateBack) {
      onNavigateBack();
      return;
    }
    if (fromSearch) {
      navigate(`/?q=${encodeURIComponent(fromSearch)}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="border-b border-border bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            {fromSearch ? (
              <button
                aria-label="Quay lại Dashboard"
                onClick={handleBackClick}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Quay lại Dashboard</span>
              </button>
            ) : (
              <button
                aria-label="Về trang trước"
                onClick={handleBackClick}
                className="rounded p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}

            <button
              aria-label="Về trang chủ"
              onClick={() => onNavigateHome ? onNavigateHome() : navigate('/')}
              className="rounded p-1 transition-colors hover:bg-muted"
            >
              <Logo />
            </button>

            {isEditing ? (
              <Input
                value={editedTitle}
                onChange={(event) => setEditedTitle(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleTitleSubmit}
                className="h-auto min-w-[300px] w-auto border-none p-0 text-lg font-medium text-foreground shadow-none focus-visible:ring-0"
                autoFocus
                disabled={isUpdating}
              />
            ) : (
              <div className="flex items-center space-x-3">
                <span
                  className={`rounded px-2 py-1 text-lg font-medium text-foreground transition-colors ${
                    canEdit ? 'cursor-pointer hover:bg-muted' : 'cursor-default'
                  }`}
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
            {isMember && notebookId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMemberPanelOpen(true)}
                className="hidden md:flex"
              >
                <Users className="mr-2 h-4 w-4" />
                Thành viên
                {memberCount > 1 && (
                  <span className="ml-1.5 min-w-[20px] rounded-full bg-primary/10 px-1.5 text-center text-xs font-medium text-primary">
                    {memberCount}
                  </span>
                )}
              </Button>
            )}

            {isMemberPanelOpen && notebookId && (
              <CollaborationErrorBoundary>
                {/* [perf] fallback renders a centred spinner so the panel open
                    feels instant rather than silently broken during chunk load */}
                <Suspense fallback={
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                }>
                  <LazyMemberPanel
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500 transition-colors hover:bg-purple-600">
                    <User className="h-4 w-4 text-white" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={logout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
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
