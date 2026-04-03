
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useDocumentProcessing = () => {
  const { toast } = useToast();

  const processDocument = useMutation({
    mutationFn: async ({
      sourceId,
      filePath,
      sourceType
    }: {
      sourceId: string;
      filePath: string;
      sourceType: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('process-document', {
        body: {
          sourceId,
          filePath,
          sourceType
        }
      });

      if (error) {
        console.error('Document processing error:', error);
        throw error;
      }

      return data;
    },
    // // BUG-02 fix (Layer 2): Exponential backoff with jitter.
    // // When n8n is down, prevents thundering herd — 500 users don't all retry
    // // at the same millisecond. Delays: ~1s → ~2s → ~4s (+ random jitter).
    // retry: (failureCount, error) => {
    //   if (failureCount >= 3) return false;

    //   // Don't retry client errors (400 Bad Request, 403 Forbidden, 404 Not Found)
    //   // Only retry server/network errors (502, 504, timeout, etc.)
    //   const message = error?.message?.toLowerCase() ?? '';
    //   const isClientError = message.includes('400') || message.includes('403') || message.includes('404');
    //   return !isClientError;
    // },
    // retryDelay: (attemptIndex) => {
    //   // Exponential: 1s, 2s, 4s (capped at 30s)
    //   const baseDelay = Math.min(1000 * 2 ** attemptIndex, 30000);
    //   // Jitter: ±20% randomization so users don't retry in sync
    //   const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
    //   return baseDelay + jitter;
    // },
    // Retry disabled: n8n Cloud has limited RAM. Multiple concurrent retries
    // cause "retry storm" → all executions crash with OOM. Single attempt is
    // more reliable than 3 concurrent crashes.
    retry: false,

    onSuccess: (data) => {
      console.log('Document processing initiated successfully:', data);
    },
    onError: (error) => {
      console.error('Failed to initiate document processing:', error);
      toast({
        title: "Lỗi xử lý",
        description: "Không thể bắt đầu xử lý tài liệu sau nhiều lần thử. Vui lòng thử lại sau.",
        variant: "destructive",
      });
    },
  });

  return {
    processDocumentAsync: processDocument.mutateAsync,
    processDocument: processDocument.mutate,
    isProcessing: processDocument.isPending,
  };
};
