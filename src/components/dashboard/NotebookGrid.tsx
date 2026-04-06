
import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import NotebookSection from './NotebookSection';
import type { FormattedNotebook } from './NotebookSection';
import { useNotebooks } from '@/hooks/useNotebooks';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const NotebookGrid = () => {
  const {
    notebooks,
    myMemberships,
    isLoading,
    createNotebook,
    isCreating
  } = useNotebooks();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Derive formatted + split notebooks during render (rerender-derived-state-no-effect)
  // Single pass: format + partition into public/private/shared
  const { publicNotebooks, privateNotebooks, sharedNotebooks } = useMemo(() => {
    if (!notebooks) return { publicNotebooks: [], privateNotebooks: [], sharedNotebooks: [] };

    const publicList: FormattedNotebook[] = [];
    const privateList: FormattedNotebook[] = [];
    const sharedList: FormattedNotebook[] = [];

    for (const notebook of notebooks) {
      const formatted: FormattedNotebook = {
        id: notebook.id,
        title: notebook.title,
        date: new Date(notebook.updated_at).toLocaleDateString('vi-VN', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        updatedAt: notebook.updated_at,
        sources: notebook.sources?.[0]?.count || 0,
        icon: notebook.icon || '📝',
        color: notebook.color || 'bg-gray-100',
        visibility: (notebook.visibility as 'public' | 'private') || 'private',
        canDelete: notebook.user_id === user?.id,
      };

      // Public section = all notebooks with visibility 'public'
      if (notebook.visibility === 'public') {
        publicList.push(formatted);
      } else if (notebook.user_id !== user?.id && myMemberships?.has(notebook.id)) {
        // Shared section = private notebooks where user is a member
        sharedList.push(formatted);
      } else if (notebook.user_id === user?.id) {
        // Private section = private notebooks owned by the current user
        privateList.push(formatted);
      }
    }

    return { publicNotebooks: publicList, privateNotebooks: privateList, sharedNotebooks: sharedList };
  }, [notebooks, myMemberships, user?.id]);

  const handleCreateNotebook = () => {
    createNotebook({
      title: 'Untitled notebook',
      description: ''
    }, {
      onSuccess: data => {
        navigate(`/notebook/${data.id}`);
      },
      onError: error => {
        console.error('Failed to create notebook:', error);
      }
    });
  };

  const handleNotebookClick = (notebookId: string, e: React.MouseEvent) => {
    // Check if the click is coming from a delete action or other interactive element
    const target = e.target as HTMLElement;
    const isDeleteAction = target.closest('[data-delete-action="true"]') || target.closest('.delete-button') || target.closest('[role="dialog"]');
    if (isDeleteAction) {
      return;
    }
    navigate(`/notebook/${notebookId}`);
  };

  if (isLoading) {
    return <div className="text-center py-16">
        <p className="text-gray-600">Loading notebooks...</p>
      </div>;
  }

  return <div>
      {/* Create button — always at top */}
      <div className="flex items-center justify-between mb-8">
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6" onClick={handleCreateNotebook} disabled={isCreating}>
          {isCreating ? 'Đang tạo...' : '+ Tạo mới'}
        </Button>
      </div>

      {/* Public Notebooks Section */}
      <NotebookSection
        title="Notebook Công khai"
        notebooks={publicNotebooks}
        emptyMessage="Chưa có notebook công khai nào"
        onNotebookClick={handleNotebookClick}
        variant="public"
      />

      {/* Shared Notebooks Section */}
      {sharedNotebooks.length > 0 && (
        <NotebookSection
          title="Được chia sẻ với tôi"
          notebooks={sharedNotebooks}
          emptyMessage="Chưa có notebook nào được chia sẻ với bạn"
          onNotebookClick={handleNotebookClick}
          variant="shared"
        />
      )}

      {/* Private Notebooks Section */}
      <NotebookSection
        title="Notebook của tôi"
        notebooks={privateNotebooks}
        emptyMessage="Bạn chưa có notebook nào"
        onNotebookClick={handleNotebookClick}
        variant="private"
      />
    </div>;
};

export default NotebookGrid;
