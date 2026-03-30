
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { EnhancedChatMessage, Citation, MessageSegment } from '@/types/message';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

// Type for the expected message structure from n8n_chat_histories
interface N8nMessageFormat {
  type: 'human' | 'ai';
  content: string | {
    segments: Array<{ text: string; citation_id?: number }>;
    citations: Array<{
      citation_id: number;
      source_id: string;
      source_title: string;
      source_type: string;
      page_number?: number;
      chunk_index?: number;
      excerpt?: string;
    }>;
  };
  additional_kwargs?: any;
  response_metadata?: any;
  tool_calls?: any[];
  invalid_tool_calls?: any[];
}

// Type for the AI response structure from n8n
interface N8nAiResponseContent {
  output: Array<{
    text: string;
    citations?: Array<{
      chunk_index: number;
      chunk_source_id: string;
      chunk_lines_from: number;
      chunk_lines_to: number;
    }>;
  }>;
}

const transformMessage = (item: any, sourceMap: Map<string, any>): EnhancedChatMessage => {
  
  let transformedMessage: EnhancedChatMessage['message'];
  
  // Check if message is an object and has the expected structure
  if (item.message && 
      typeof item.message === 'object' && 
      !Array.isArray(item.message) &&
      'type' in item.message && 
      'content' in item.message) {
    
    // Type assertion with proper checking
    const messageObj = item.message as unknown as N8nMessageFormat;
    
    // Check if this is an AI message with JSON content that needs parsing
    if (messageObj.type === 'ai' && typeof messageObj.content === 'string') {
      try {
        const parsedContent = JSON.parse(messageObj.content) as N8nAiResponseContent;
        
        if (parsedContent.output && Array.isArray(parsedContent.output)) {
          // Transform the parsed content into segments and citations
          const segments: MessageSegment[] = [];
          const citations: Citation[] = [];
          let citationIdCounter = 1;
          
          parsedContent.output.forEach((outputItem) => {
            // Add the text segment
            segments.push({
              text: outputItem.text,
              citation_id: outputItem.citations && outputItem.citations.length > 0 ? citationIdCounter : undefined
            });
            
            // Process citations if they exist
            if (outputItem.citations && outputItem.citations.length > 0) {
              outputItem.citations.forEach((citation) => {
                const sourceInfo = sourceMap.get(citation.chunk_source_id);
                citations.push({
                  citation_id: citationIdCounter,
                  source_id: citation.chunk_source_id,
                  source_title: sourceInfo?.title || 'Unknown Source',
                  source_type: sourceInfo?.type || 'pdf',
                  chunk_lines_from: citation.chunk_lines_from,
                  chunk_lines_to: citation.chunk_lines_to,
                  chunk_index: citation.chunk_index,
                  excerpt: `Lines ${citation.chunk_lines_from}-${citation.chunk_lines_to}`
                });
              });
              citationIdCounter++;
            }
          });
          
          transformedMessage = {
            type: 'ai',
            content: {
              segments,
              citations
            },
            additional_kwargs: messageObj.additional_kwargs,
            response_metadata: messageObj.response_metadata,
            tool_calls: messageObj.tool_calls,
            invalid_tool_calls: messageObj.invalid_tool_calls
          };
        } else {
          // Fallback for AI messages that don't match expected format
          transformedMessage = {
            type: 'ai',
            content: messageObj.content,
            additional_kwargs: messageObj.additional_kwargs,
            response_metadata: messageObj.response_metadata,
            tool_calls: messageObj.tool_calls,
            invalid_tool_calls: messageObj.invalid_tool_calls
          };
        }
      } catch (parseError) {
        // If parsing fails, treat as regular string content
        transformedMessage = {
          type: 'ai',
          content: messageObj.content,
          additional_kwargs: messageObj.additional_kwargs,
          response_metadata: messageObj.response_metadata,
          tool_calls: messageObj.tool_calls,
          invalid_tool_calls: messageObj.invalid_tool_calls
        };
      }
    } else {
      // Handle non-AI messages or AI messages that don't need parsing
      transformedMessage = {
        type: messageObj.type === 'human' ? 'human' : 'ai',
        content: messageObj.content || 'Empty message',
        additional_kwargs: messageObj.additional_kwargs,
        response_metadata: messageObj.response_metadata,
        tool_calls: messageObj.tool_calls,
        invalid_tool_calls: messageObj.invalid_tool_calls
      };
    }
  } else if (typeof item.message === 'string') {
    // Handle case where message is just a string
    transformedMessage = {
      type: 'human',
      content: item.message
    };
  } else {
    // Fallback for any other cases
    transformedMessage = {
      type: 'human',
      content: 'Unable to parse message'
    };
  }

  return {
    id: item.id,
    session_id: item.session_id,
    message: transformedMessage
  };
};

export const useChatMessages = (notebookId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Derive compositeSessionId during render — NOT in state or effect
  // Per rerender-derived-state-no-effect: derive from props, don't store
  const userId = user?.id;
  const compositeSessionId = notebookId && userId ? `${notebookId}:${userId}` : null;

  const {
    data: messages = [],
    isLoading,
    error,
  } = useQuery({
    // Per-user cache isolation: include userId in query key
    queryKey: ['chat-messages', notebookId, userId],
    queryFn: async () => {
      if (!compositeSessionId) return [];
      
      // Per async-parallel (CRITICAL): fetch chat history + sources in parallel
      // Eliminates waterfall — up to 2x faster initial load
      const [chatResult, sourcesResult] = await Promise.all([
        supabase
          .from('n8n_chat_histories')
          .select('*')
          .eq('session_id', compositeSessionId)
          .order('id', { ascending: true }),
        supabase
          .from('sources')
          .select('id, title, type')
          .eq('notebook_id', notebookId!)
      ]);

      if (chatResult.error) throw chatResult.error;
      
      // Per js-index-maps: Map for O(1) source lookups — already correct pattern
      const sourceMap = new Map(sourcesResult.data?.map(s => [s.id, s]) || []);
      
      // Cache the sourceMap for Realtime subscription to use (avoids N+1 query)
      queryClient.setQueryData(['sources-map', notebookId], sourceMap);
      
      // Transform the data to match our expected format
      return chatResult.data.map((item) => transformMessage(item, sourceMap));
    },
    enabled: !!compositeSessionId,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  // Set up Realtime subscription for new messages
  // Per rerender-dependencies: use compositeSessionId (primitive string) as dep
  // instead of user (object) — prevents re-subscription on unrelated user field changes
  useEffect(() => {
    if (!compositeSessionId || !notebookId) return;

    const channel = supabase
      .channel(`chat-messages-${compositeSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'n8n_chat_histories',
          filter: `session_id=eq.${compositeSessionId}`
        },
        async (payload) => {
          // Retrieve sources from React Query cache instead of DB to avoid N+1 queries
          const sourceMap = queryClient.getQueryData<Map<string, any>>(['sources-map', notebookId]) || new Map();
          
          // Transform the new message
          const newMessage = transformMessage(payload.new, sourceMap);
          
          // Update the query cache with the new message
          queryClient.setQueryData(['chat-messages', notebookId, userId], (oldMessages: EnhancedChatMessage[] = []) => {
            // Check if message already exists to prevent duplicates
            const messageExists = oldMessages.some(msg => msg.id === newMessage.id);
            if (messageExists) {
              return oldMessages;
            }
            
            return [...oldMessages, newMessage];
          });
        }
      )
      .subscribe();

    // Per client-event-listeners: cleanup via removeChannel on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [compositeSessionId, queryClient, notebookId, userId]);

  const sendMessage = useMutation({
    mutationFn: async (messageData: {
      notebookId: string;
      role: 'user' | 'assistant';
      content: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      // Call the n8n webhook — pass notebook_id (not session_id) to Edge Function
      // Edge Function constructs composite session_id server-side (security!)
      const webhookResponse = await supabase.functions.invoke('send-chat-message', {
        body: {
          notebook_id: messageData.notebookId,
          message: messageData.content,
        }
      });

      if (webhookResponse.error) {
        throw new Error(`Webhook error: ${webhookResponse.error.message}`);
      }

      return webhookResponse.data;
    },
    onSuccess: () => {
      // The response will appear via Realtime
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi gửi tin nhắn',
        description: 'Chưa lấy được câu trả lời. Vui lòng thử lại.',
        variant: 'destructive',
      });
    },
  });

  const deleteChatHistory = useMutation({
    mutationFn: async (targetNotebookId: string) => {
      if (!user) throw new Error('User not authenticated');
      
      // Construct composite session_id for deletion — scoped to current user only
      // Per AC #7: deletes only the current user's chat, not all members' chats
      const deleteSessionId = `${targetNotebookId}:${user.id}`;
      
      const { error } = await supabase
        .from('n8n_chat_histories')
        .delete()
        .eq('session_id', deleteSessionId);

      if (error) {
        throw error;
      }
      
      return targetNotebookId;
    },
    onSuccess: (targetNotebookId) => {
      toast({
        title: "Đã xóa lịch sử trò chuyện",
        description: "Toàn bộ tin nhắn của bạn đã được xóa thành công.",
      });
      
      // Clear the query data and refetch to confirm
      queryClient.setQueryData(['chat-messages', targetNotebookId, userId], []);
      queryClient.invalidateQueries({
        queryKey: ['chat-messages', targetNotebookId, userId]
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: "Không thể xóa lịch sử trò chuyện. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  });

  return {
    messages,
    isLoading,
    error,
    sendMessage: sendMessage.mutate,
    sendMessageAsync: sendMessage.mutateAsync,
    isSending: sendMessage.isPending,
    deleteChatHistory: deleteChatHistory.mutate,
    isDeletingChatHistory: deleteChatHistory.isPending,
  };
};
