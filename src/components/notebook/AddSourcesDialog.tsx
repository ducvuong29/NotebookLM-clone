import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Link, Copy } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import MultipleWebsiteUrlsDialog from './MultipleWebsiteUrlsDialog';
import CopiedTextDialog from './CopiedTextDialog';
import { useSources } from '@/hooks/useSources';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useDocumentProcessing } from '@/hooks/useDocumentProcessing';
import { useNotebookGeneration } from '@/hooks/useNotebookGeneration';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AddSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookId?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

const AddSourcesDialog = ({
  open,
  onOpenChange,
  notebookId
}: AddSourcesDialogProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [showCopiedTextDialog, setShowCopiedTextDialog] = useState(false);
  const [showMultipleWebsiteDialog, setShowMultipleWebsiteDialog] = useState(false);
  const [isLocallyProcessing, setIsLocallyProcessing] = useState(false);

  const {
    addSourceAsync,
    updateSource,
    isAdding
  } = useSources(notebookId);

  const {
    uploadFile,
    isUploading,
    uploadProgress,
    uploadStatus,
    resetProgress,
  } = useFileUpload();

  const {
    processDocumentAsync,
    isProcessing
  } = useDocumentProcessing();

  const {
    generateNotebookContentAsync,
    isGenerating
  } = useNotebookGeneration();

  const {
    toast
  } = useToast();

  // Reset local processing state and upload progress when dialog opens
  useEffect(() => {
    if (open) {
      setIsLocallyProcessing(false);
      resetProgress();
    }
  }, [open, resetProgress]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      handleFileUpload(files);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      handleFileUpload(files);
    }
  }, []);

  const handleFileUpload = async (files: File[]) => {
    if (!notebookId) {
      toast({
        title: "Lỗi",
        description: "Chưa chọn notebook",
        variant: "destructive"
      });
      return;
    }

    // Validate file sizes — reject files > 25MB
    const oversizedFiles = files.filter(f => f.size > MAX_FILE_SIZE);
    const validFiles = files.filter(f => f.size <= MAX_FILE_SIZE);

    oversizedFiles.forEach(f => {
      toast({
        title: "File quá lớn",
        description: `"${f.name}" vượt quá giới hạn 25MB (${(f.size / 1024 / 1024).toFixed(1)}MB). Vui lòng chọn file nhỏ hơn.`,
        variant: "destructive",
      });
    });

    if (validFiles.length === 0) return;

    files = validFiles;
    setIsLocallyProcessing(true);

    try {
      // Step 1: Create the first source immediately
      const firstFile = files[0];
      const firstFileType = firstFile.type.includes('pdf') ? 'pdf' : firstFile.type.includes('audio') ? 'audio' : 'text';
      const firstSourceData = {
        notebookId,
        title: firstFile.name,
        type: firstFileType as 'pdf' | 'text' | 'website' | 'youtube' | 'audio',
        file_size: firstFile.size,
        processing_status: 'pending',
        metadata: { fileName: firstFile.name, fileType: firstFile.type }
      };
      
      const firstSource = await addSourceAsync(firstSourceData);
      
      let remainingSources = [];
      
      // Step 2: Create remaining sources
      if (files.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
        
        remainingSources = await Promise.all(files.slice(1).map(async (file) => {
          const fileType = file.type.includes('pdf') ? 'pdf' : file.type.includes('audio') ? 'audio' : 'text';
          const sourceData = {
            notebookId,
            title: file.name,
            type: fileType as 'pdf' | 'text' | 'website' | 'youtube' | 'audio',
            file_size: file.size,
            processing_status: 'pending',
            metadata: { fileName: file.name, fileType: file.type }
          };
          return await addSourceAsync(sourceData);
        }));
      }

      const allCreatedSources = [firstSource, ...remainingSources];

      // Step 3: Upload all files concurrently
      const uploadPromises = files.map((file, index) => {
        const sourceId = allCreatedSources[index].id;
        updateSource({ sourceId, updates: { processing_status: 'uploading' } });
        return uploadFile(file, notebookId, sourceId).then(filePath => {
          if (!filePath) throw new Error('File upload failed - no file path returned');
          return { file, sourceId, filePath };
        }).catch(err => {
          updateSource({ sourceId, updates: { processing_status: 'failed' } });
          throw err;
        });
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Wait 1s to let users see the 100% success progress bar before closing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 4: Close dialog immediately after upload completes
      setIsLocallyProcessing(false);
      onOpenChange(false);

      toast({
        title: "Đã thêm file",
        description: `${files.length} file đã tải lên và đang được xử lý`
      });

      // Step 5: Process files in background
      const processingPromises = uploadResults.map(({ file, sourceId, filePath }) => {
        const fileType = file.type.includes('pdf') ? 'pdf' : file.type.includes('audio') ? 'audio' : 'text';
        
        updateSource({
          sourceId,
          updates: { file_path: filePath, processing_status: 'processing' }
        });

        return processDocumentAsync({ sourceId, filePath, sourceType: fileType })
          .then(() => generateNotebookContentAsync({ notebookId, filePath, sourceType: fileType }))
          .catch(processingError => {
            updateSource({ sourceId, updates: { processing_status: 'completed' } });
            throw processingError;
          });
      });

      Promise.allSettled(processingPromises).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          toast({
            title: "Lỗi xử lý",
            description: `${failed} file gặp sự cố khi xử lý. Kiểm tra danh sách nguồn để biết chi tiết.`,
            variant: "destructive"
          });
        }
      });
    } catch (error) {
      setIsLocallyProcessing(false);
      toast({
        title: "Lỗi",
        description: "Không thể tải lên file. Vui lòng thử lại.",
        variant: "destructive"
      });
    }
  };

  const handleTextSubmit = async (title: string, content: string) => {
    if (!notebookId) return;
    setIsLocallyProcessing(true);

    try {
      // Create source record first to get the ID
      const createdSource = await addSourceAsync({
        notebookId,
        title,
        type: 'text',
        content,
        processing_status: 'processing',
        metadata: {
          characterCount: content.length,
          webhookProcessed: true
        }
      });

      // Send to webhook endpoint with source ID
      const { data, error } = await supabase.functions.invoke('process-additional-sources', {
        body: {
          type: 'copied-text',
          notebookId,
          title,
          content,
          sourceIds: [createdSource.id], // Pass the source ID
          timestamp: new Date().toISOString()
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Thành công",
        description: "Văn bản đã được thêm và gửi để xử lý"
      });
    } catch (error) {
      console.error('Error adding text source:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thêm văn bản",
        variant: "destructive"
      });
    } finally {
      setIsLocallyProcessing(false);
    }

    onOpenChange(false);
  };

  const handleMultipleWebsiteSubmit = async (urls: string[]) => {
    if (!notebookId) return;
    setIsLocallyProcessing(true);

    try {
      console.log('Creating sources for multiple websites with delay strategy:', urls.length);
      
      // Create the first source immediately (this will trigger generation if it's the first source)
      const firstSource = await addSourceAsync({
        notebookId,
        title: `Website 1: ${urls[0]}`,
        type: 'website',
        url: urls[0],
        processing_status: 'processing',
        metadata: {
          originalUrl: urls[0],
          webhookProcessed: true
        }
      });
      
      console.log('First source created:', firstSource.id);
      
      let remainingSources = [];
      
      // If there are more URLs, add a delay before creating the rest
      if (urls.length > 1) {
        console.log('Adding 150ms delay before creating remaining sources...');
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Create remaining sources
        remainingSources = await Promise.all(urls.slice(1).map(async (url, index) => {
          return await addSourceAsync({
            notebookId,
            title: `Website ${index + 2}: ${url}`,
            type: 'website',
            url,
            processing_status: 'processing',
            metadata: {
              originalUrl: url,
              webhookProcessed: true
            }
          });
        }));
        
        console.log('Remaining sources created:', remainingSources.length);
      }

      // Combine all created sources
      const allCreatedSources = [firstSource, ...remainingSources];

      // Send to webhook endpoint with all source IDs
      const { data, error } = await supabase.functions.invoke('process-additional-sources', {
        body: {
          type: 'multiple-websites',
          notebookId,
          urls,
          sourceIds: allCreatedSources.map(source => source.id), // Pass array of source IDs
          timestamp: new Date().toISOString()
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Thành công",
        description: `${urls.length} website đã được thêm và gửi để xử lý`
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error adding multiple websites:', error);
      toast({
        title: "Lỗi",
        description: "Không thể thêm website",
        variant: "destructive"
      });
    } finally {
      setIsLocallyProcessing(false);
    }
  };

  // Use local processing state instead of global processing states
  const isProcessingFiles = isLocallyProcessing;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#FFFFFF">
                    <path d="M480-80q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM320-200v-80h320v80H320Zm10-120q-69-41-109.5-110T180-580q0-125 87.5-212.5T480-880q125 0 212.5 87.5T780-580q0 81-40.5 150T630-320H330Zm24-80h252q45-32 69.5-79T700-580q0-92-64-156t-156-64q-92 0-156 64t-64 156q0 54 24.5 101t69.5 79Zm126 0Z" />
                  </svg>
                </div>
                <DialogTitle className="text-xl font-medium">InsightsLM</DialogTitle>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-medium mb-2">Thêm nguồn</h2>
              <p className="text-gray-600 text-sm mb-1">Nguồn tài liệu giúp InsightsLM dựa trên thông tin quan trọng nhất với bạn để trả lời.</p>
              <p className="text-gray-500 text-xs">
                (Ví dụ: kế hoạch marketing, tài liệu học tập, ghi chú nghiên cứu, biên bản họp, tài liệu bán hàng, v.v.)
              </p>
            </div>

            {/* File Upload Area */}
            <div 
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              } ${isProcessingFiles ? 'opacity-50 pointer-events-none' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100">
                  <Upload className="h-6 w-6 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground mb-2">
                    {isProcessingFiles ? 'Đang xử lý file...' : 'Tải nguồn lên'}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {isProcessingFiles ? (
                      'Vui lòng chờ trong khi chúng tôi xử lý file'
                    ) : (
                      <>
                        Kéo thả hoặc{' '}
                        <button 
                          className="text-blue-600 hover:underline" 
                          onClick={() => document.getElementById('file-upload')?.click()}
                          disabled={isProcessingFiles}
                        >
                          chọn file
                        </button>{' '}
                        để tải lên
                      </>
                    )}
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  Định dạng hỗ trợ: PDF, txt, Markdown, Âm thanh (ví dụ: mp3) · Tối đa 25MB mỗi file
                </p>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.txt,.md,.mp3,.wav,.m4a"
                  onChange={handleFileSelect}
                  disabled={isProcessingFiles}
                />
              </div>
            </div>

            {/* Upload Progress Bar */}
            {uploadStatus !== 'idle' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {uploadStatus === 'uploading' && `Đang tải lên... ${uploadProgress}%`}
                    {uploadStatus === 'success' && 'Tải lên hoàn tất! ✅'}
                    {uploadStatus === 'error' && 'Tải lên thất bại ❌'}
                  </span>
                </div>
                <Progress
                  value={uploadProgress}
                  className={`h-2 ${
                    uploadStatus === 'error'
                      ? '[&>div]:bg-red-500'
                      : uploadStatus === 'success'
                        ? '[&>div]:bg-green-500'
                        : '[&>div]:bg-amber-500'
                  }`}
                />
              </div>
            )}

            {/* Integration Options */}
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-center space-y-2"
                onClick={() => setShowMultipleWebsiteDialog(true)}
                disabled={isProcessingFiles}
              >
                <Link className="h-6 w-6 text-green-600" />
                <span className="font-medium">Liên kết - Website</span>
                <span className="text-sm text-gray-500">Nhiều URL cùng lúc</span>
              </Button>

              <Button
                variant="outline"
                className="h-auto p-4 flex flex-col items-center space-y-2"
                onClick={() => setShowCopiedTextDialog(true)}
                disabled={isProcessingFiles}
              >
                <Copy className="h-6 w-6 text-purple-600" />
                <span className="font-medium">Dán văn bản</span>
                <span className="text-sm text-gray-500">Thêm nội dung đã sao chép</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      <CopiedTextDialog 
        open={showCopiedTextDialog} 
        onOpenChange={setShowCopiedTextDialog} 
        onSubmit={handleTextSubmit} 
      />

      <MultipleWebsiteUrlsDialog 
        open={showMultipleWebsiteDialog} 
        onOpenChange={setShowMultipleWebsiteDialog} 
        onSubmit={handleMultipleWebsiteSubmit} 
      />
    </>
  );
};

export default AddSourcesDialog;
