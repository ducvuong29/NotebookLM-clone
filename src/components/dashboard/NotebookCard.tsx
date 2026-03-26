import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useNotebookDelete } from '@/hooks/useNotebookDelete';

interface NotebookCardProps {
  notebook: {
    id: string;
    title: string;
    date: string;
    sources: number;
    icon: string;
    color: string;
    hasCollaborators?: boolean;
  };
}

const NotebookCard = ({
  notebook
}: NotebookCardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const {
    deleteNotebook,
    isDeleting
  } = useNotebookDelete();

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    deleteNotebook(notebook.id);
    setShowDeleteDialog(false);
  };

  // Map color names to Tailwind utility classes explicitly to prevent purge
  const colorName = notebook.color || 'gray';
  
  const colorMap: Record<string, { bg: string, border: string }> = {
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800/40' },
    green: { bg: 'bg-green-100 dark:bg-green-900/30', border: 'border-green-200 dark:border-green-800/40' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-800/40' },
    rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-800/40' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-800/40' },
    gray: { bg: 'bg-gray-100 dark:bg-gray-800/40', border: 'border-gray-200 dark:border-gray-700/50' },
    indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-200 dark:border-indigo-800/40' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', border: 'border-pink-200 dark:border-pink-800/40' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', border: 'border-teal-200 dark:border-teal-800/40' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800/40' },
  };

  const themeColors = colorMap[colorName] || colorMap.gray;
  const backgroundClass = themeColors.bg;
  const borderClass = themeColors.border;

  return <div 
      className={`rounded-lg border ${borderClass} ${backgroundClass} p-4 hover:shadow-md transition-shadow cursor-pointer relative h-48 flex flex-col`}
    >
      <div className="absolute top-3 right-3" data-delete-action="true">
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogTrigger asChild>
            <button aria-label={`Xóa notebook ${notebook.title}`} onClick={handleDeleteClick} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-1 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-muted-foreground hover:text-red-500 transition-colors delete-button" disabled={isDeleting} data-delete-action="true">
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa notebook này?</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn sắp xóa notebook này và toàn bộ nội dung bên trong. Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete} className="bg-blue-600 hover:bg-blue-700" disabled={isDeleting}>
                {isDeleting ? 'Đang xóa...' : 'Xóa'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4">
        <span className="text-3xl">{notebook.icon}</span>
      </div>
      
      <h3 className="text-foreground mb-2 pr-6 line-clamp-2 text-2xl font-normal flex-grow">
        {notebook.title}
      </h3>
      
      <div className="flex items-center justify-between text-sm text-muted-foreground mt-auto">
        <span>{notebook.date} • {notebook.sources} nguồn</span>
      </div>
    </div>;
};

export default NotebookCard;
