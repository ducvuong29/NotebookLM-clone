import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Globe, Video, Mic } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotebooks } from '@/hooks/useNotebooks';
const EmptyDashboard = () => {
  const navigate = useNavigate();
  const {
    createNotebook,
    isCreating
  } = useNotebooks();
  const handleCreateNotebook = () => {


    createNotebook({
      title: 'Notebook chưa đặt tên',
      description: ''
    }, {
      onSuccess: data => {

        navigate(`/notebook/${data.id}`);
      },
      onError: error => {

      }
    });
  };
  return <div className="text-center py-16">
      <div className="mb-12">
        <h2 className="text-3xl font-medium text-foreground mb-4">Tạo notebook đầu tiên</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">InsightsLM là trợ lý nghiên cứu và viết lách hỗ trợ bởi AI, hoạt động tốt nhất với các nguồn tài liệu bạn tải lên</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Tài liệu PDF</h3>
          <p className="text-muted-foreground">Tải lên tài liệu nghiên cứu, báo cáo và văn bản</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Globe className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Trang web</h3>
          <p className="text-muted-foreground">Thêm trang web và bài viết trực tuyến làm nguồn</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <div className="w-12 h-12 bg-purple-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Video className="h-6 w-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Âm thanh</h3>
          <p className="text-muted-foreground">Thêm nội dung đa phương tiện vào nghiên cứu</p>
        </div>
      </div>

      <Button onClick={handleCreateNotebook} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={isCreating}>
        <Upload className="h-5 w-5 mr-2" />
        {isCreating ? 'Đang tạo...' : 'Tạo notebook'}
      </Button>
    </div>;
};
export default EmptyDashboard;