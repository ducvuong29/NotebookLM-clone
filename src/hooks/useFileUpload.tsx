import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  // Keep track of progress of each individual file being uploaded concurrently
  const [uploadProgresses, setUploadProgresses] = useState<Record<string, number>>({});
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const { toast } = useToast();

  const resetProgress = useCallback(() => {
    setUploadProgresses({});
    setUploadStatus('idle');
  }, []);

  const uploadFile = async (file: File, notebookId: string, sourceId: string): Promise<string | null> => {
    try {
      setIsUploading(true);
      setUploadStatus('uploading');
      
      // Initialize progress for this file
      setUploadProgresses(prev => ({ ...prev, [sourceId]: 0 }));
      
      const fileExtension = file.name.split('.').pop() || 'bin';
      const filePath = `${notebookId}/${sourceId}.${fileExtension}`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/sources/${filePath}`;

      const result = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgresses(prev => ({ ...prev, [sourceId]: percent }));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgresses(prev => ({ ...prev, [sourceId]: 100 }));
            resolve(filePath);
          } else {
            setUploadStatus('error');
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          setUploadStatus('error');
          reject(new Error('Upload failed due to network error'));
        });

        xhr.addEventListener('abort', () => {
          setUploadStatus('error');
          reject(new Error('Upload was aborted'));
        });

        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('Cache-Control', '3600');
        xhr.send(file);
      });

      return result;
    } catch (error) {
      setUploadStatus('error');
      toast({
        title: "Lỗi tải lên",
        description: `Không thể tải lên ${file.name}. Vui lòng thử lại.`,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const getFileUrl = (filePath: string): string => {
    const { data } = supabase.storage
      .from('sources')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  };

  // Calculate overall progress as the average of all tracked files
  const progressValues = Object.values(uploadProgresses);
  const uploadProgress = progressValues.length > 0 
    ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length) 
    : 0;

  return {
    uploadFile,
    getFileUrl,
    isUploading,
    uploadProgress,
    uploadStatus,
    setUploadStatus,
    resetProgress,
  };
};
