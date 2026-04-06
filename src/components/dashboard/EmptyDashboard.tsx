import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotebooks } from '@/hooks/useNotebooks';
import { Upload, FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { EMPTY_STATE } from '@/lib/empty-state-content';

const EmptyDashboard = () => {
  const navigate = useNavigate();
  const {
    createNotebook,
    isCreating
  } = useNotebooks();
  const handleCreateNotebook = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    createNotebook({
      title: 'Notebook chưa đặt tên',
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
  return (
    <div className="py-16">
      <EmptyState
        icon={<FileText className="h-10 w-10 text-muted-foreground/50" />}
        title={EMPTY_STATE.notebooks.title}
        description={EMPTY_STATE.notebooks.description}
        action={{
          label: isCreating ? 'Đang tạo...' : 'Tạo notebook',
          onClick: handleCreateNotebook,
          icon: <Upload className="h-4 w-4" />
        }}
      />
    </div>
  );
};
export default EmptyDashboard;