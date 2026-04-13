import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Upload, FileText, Loader2, RefreshCw, AlertCircle, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useSources } from '@/hooks/useSources';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import SaveToNoteButton from './SaveToNoteButton';
import { Suspense } from 'react';
import { LazyAddSourcesDialog } from './lazy-components';
import { Citation } from '@/types/message';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonChatMessage } from '@/components/ui/SkeletonChatMessage';
import { EMPTY_STATE } from '@/lib/empty-state-content';

interface ChatAreaProps {
  hasSource: boolean;
  notebookId?: string;
  notebook?: {
    id: string;
    title: string;
    description?: string;
    generation_status?: string;
    icon?: string;
    example_questions?: string[];
  } | null;
  onCitationClick?: (citation: Citation) => void;
  selectedCitation?: Citation | null;
}

const ChatArea = ({
  hasSource,
  notebookId,
  notebook,
  onCitationClick,
  selectedCitation
}: ChatAreaProps) => {
  const [message, setMessage] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [showAiLoading, setShowAiLoading] = useState(false);
  const [clickedQuestions, setClickedQuestions] = useState<Set<string>>(new Set());
  const [showAddSourcesDialog, setShowAddSourcesDialog] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showTimeout, setShowTimeout] = useState(false);
  const lastFailedMessageRef = useRef<string | null>(null);
  const handleSendMessageRef = useRef<(msg?: string) => void>(() => {});
  
  const isGenerating = notebook?.generation_status === 'generating';
  
  const {
    messages,
    sendMessageAsync,
    isSending,
    deleteChatHistory,
    isDeletingChatHistory
  } = useChatMessages(notebookId);
  
  const {
    sources
  } = useSources(notebookId);
  
  const sourceCount = sources?.length || 0;

  // Check if at least one source has been successfully processed
  const hasProcessedSource = sources?.some(source => source.processing_status === 'completed') || false;

  // Chat should be disabled if there are no processed sources
  const isChatDisabled = !hasProcessedSource;

  // [perf] Debug log removed — was calling sources.map() on every render in production

  // Track when we send a message to show loading state
  const [lastMessageCount, setLastMessageCount] = useState(0);

  // Ref for auto-scrolling to the most recent message
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // If we have new messages and we have a pending message, clear it
    if (messages.length > lastMessageCount && pendingUserMessage) {
      setPendingUserMessage(null);
      setShowAiLoading(false);
    }
    setLastMessageCount(messages.length);
  }, [messages.length, lastMessageCount, pendingUserMessage]);

  // Auto-scroll when pending message is set, when messages update, or when AI loading appears
  // [perf] Use requestAnimationFrame instead of setTimeout(50) — runs after next paint cycle, never double-scrolls
  useEffect(() => {
    if (latestMessageRef.current && scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        requestAnimationFrame(() => {
          latestMessageRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        });
      }
    }
  }, [pendingUserMessage, messages.length, showAiLoading]);

  // Chat timeout UI indicator (30s)
  useEffect(() => {
    if (!showAiLoading) {
      setShowTimeout(false);
      return;
    }
    const timer = setTimeout(() => setShowTimeout(true), 30000);
    return () => clearTimeout(timer);
  }, [showAiLoading]);


  // Network reconnect: no auto-retry — user clicks the "Thử lại" button manually
  // [perf] useCallback stabilizes handler refs so React.memo on ChatArea
  // can short-circuit re-renders when Notebook.tsx state changes unrelated to chat.
  const handleSendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || message.trim();
    if (textToSend && notebookId) {
      try {
        setChatError(null);
        setPendingUserMessage(textToSend);
        await sendMessageAsync({
          notebookId: notebookId,
          role: 'user',
          content: textToSend
        });
        setMessage('');
        lastFailedMessageRef.current = null;
        setShowAiLoading(true);
      } catch (error) {
        setPendingUserMessage(null);
        setShowAiLoading(false);
        lastFailedMessageRef.current = textToSend;
        setChatError('Oops! Chưa lấy được câu trả lời. Thử lại nhé 😊');
      }
    }
  }, [message, notebookId, sendMessageAsync]);
  handleSendMessageRef.current = handleSendMessage;

  // handleRetry reads lastFailedMessageRef (a ref, not state) — uses ref to call
  // handleSendMessage so dep array stays empty and ref is always up-to-date
  const handleRetry = useCallback(() => {
    if (lastFailedMessageRef.current) {
      setChatError(null);
      setShowTimeout(false);
      setShowAiLoading(false);
      handleSendMessageRef.current(lastFailedMessageRef.current);
    }
  }, []);

  const handleRefreshChat = useCallback(() => {
    if (notebookId) {
      deleteChatHistory(notebookId);
      setClickedQuestions(new Set());
      setChatError(null);
      setShowTimeout(false);
      lastFailedMessageRef.current = null;
    }
  }, [notebookId, deleteChatHistory]);

  const handleCitationClick = useCallback((citation: Citation) => {
    onCitationClick?.(citation);
  }, [onCitationClick]);

  // Uses handleSendMessageRef so dep array stays empty — avoids recreating on every message change
  const handleExampleQuestionClick = useCallback((question: string) => {
    setClickedQuestions(prev => new Set(prev).add(question));
    setMessage(question);
    handleSendMessageRef.current(question);
  }, []);

  // [perf] Helper functions REMOVED — isUser/isAi are derived once inside .map() below
  // (previously called 3 times per message, causing 60+ redundant property accesses per render)

  // Get the index of the last message for auto-scrolling
  const shouldShowScrollTarget = () => {
    return messages.length > 0 || pendingUserMessage || showAiLoading;
  };

  // Show refresh button if there are any messages (including system messages)
  const shouldShowRefreshButton = messages.length > 0;

  // Get example questions from the notebook, filtering out clicked ones
  const exampleQuestions = notebook?.example_questions?.filter(q => !clickedQuestions.has(q)) || [];

  // Update placeholder text based on processing status
  const getPlaceholderText = () => {
    if (isChatDisabled) {
      if (sourceCount === 0) {
        return "Tải nguồn lên để bắt đầu...";
      } else {
        return "Vui lòng chờ trong khi nguồn đang được xử lý...";
      }
    }
    return "Bắt đầu nhập...";
  };
  return <div className="flex-1 flex flex-col h-full overflow-hidden">
      {hasSource ? <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 border-b border-border flex-shrink-0">
            <div className="max-w-[1000px] mx-auto flex items-center justify-between">
              <h2 className="text-lg font-medium text-foreground">Trò chuyện</h2>
              {shouldShowRefreshButton && <Button variant="ghost" size="sm" onClick={handleRefreshChat} disabled={isDeletingChatHistory || isChatDisabled} className="flex items-center space-x-2">
                  <RefreshCw className={`h-4 w-4 ${isDeletingChatHistory ? 'animate-spin' : ''}`} />
                  <span>{isDeletingChatHistory ? 'Đang xóa...' : 'Xóa chat'}</span>
                </Button>}
            </div>
          </div>

          <ScrollArea className="flex-1 h-full" ref={scrollAreaRef}>
            {/* Document Summary */}
            <div className="px-5 py-4 border-b border-border">
              <div className="max-w-[1000px] mx-auto">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 flex items-center justify-center bg-transparent">
                    {isGenerating ? <Loader2 className="text-foreground font-normal w-10 h-10 animate-spin" /> : <span className="text-[40px] leading-none">{notebook?.icon || '☕'}</span>}
                  </div>
                  <div>
                    <h1 className="text-lg font-medium text-foreground">
                      {isGenerating ? 'Đang tạo nội dung...' : notebook?.title || 'Notebook chưa đặt tên'}
                    </h1>
                    <p className="text-sm text-muted-foreground">{sourceCount} nguồn</p>
                  </div>
                </div>
                
                <div className="bg-muted/50 rounded-lg mb-4 px-4 py-3">
                  {isGenerating ? <div className="flex items-center space-x-2 text-muted-foreground">
                      
                      <p>AI đang phân tích nguồn và tạo tiêu đề, mô tả...</p>
                    </div> : <MarkdownRenderer content={notebook?.description || 'Chưa có mô tả cho notebook này.'} className="prose prose-gray dark:prose-invert max-w-none text-[13px] leading-snug" />}
                </div>

                {/* Chat Messages */}
                {(messages.length > 0 || pendingUserMessage || showAiLoading) && <div className="mb-4 space-y-3">
                    {messages.map((msg) => {
                        const messageType = msg.message.type;
                        const isUser = messageType === 'human' || messageType === 'user';
                        const isAi = messageType === 'ai' || messageType === 'assistant';
                        return (
                          <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                            <div className={`${isUser ? 'max-w-md lg:max-w-2xl px-4 py-2 bg-blue-500 text-white rounded-lg' : 'w-full'}`}>
                              <div className={isUser ? '' : 'prose prose-gray dark:prose-invert max-w-none text-foreground'}>
                                <MarkdownRenderer content={msg.message.content} className={isUser ? '' : ''} onCitationClick={handleCitationClick} selectedCitation={selectedCitation} isUserMessage={isUser} />
                              </div>
                              {isAi && <div className="mt-2 flex justify-start">
                                  <SaveToNoteButton content={msg.message.content} notebookId={notebookId} />
                                </div>}
                            </div>
                          </div>
                        );
                      })}
                    
                    {/* Pending user message */}
                    {pendingUserMessage && <div className="flex justify-end">
                        <div className="max-w-md lg:max-w-2xl px-4 py-2 bg-blue-500 text-white rounded-lg">
                          <MarkdownRenderer content={pendingUserMessage} className="" isUserMessage={true} />
                        </div>
                      </div>}
                    
                    {/* AI Loading Indicator */}
                    {showAiLoading && <div className="flex justify-start" ref={latestMessageRef}>
                        <div className="space-y-2 w-full">
                          <SkeletonChatMessage />
                          {showTimeout && (
                            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                              <AlertCircle className="h-4 w-4 flex-shrink-0" />
                              <span>Phản hồi đang mất nhiều thời gian hơn dự kiến...</span>
                              <Button variant="outline" size="sm" className="ml-auto flex-shrink-0" onClick={handleRetry}>
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Thử lại
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>}

                    {/* Chat Error with Retry */}
                    {chatError && <div className="flex justify-start" ref={!showAiLoading ? latestMessageRef : undefined}>
                        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-md">
                          <AlertCircle className="h-4 w-4 flex-shrink-0" />
                          <span>{chatError}</span>
                          <Button variant="outline" size="sm" className="ml-auto flex-shrink-0 border-red-300 text-red-700 hover:bg-red-100" onClick={handleRetry}>
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Thử lại
                          </Button>
                        </div>
                      </div>}
                    
                    {/* Scroll target for when no AI loading is shown */}
                    {!showAiLoading && !chatError && shouldShowScrollTarget() && <div ref={latestMessageRef} />}
                  </div>}
              </div>
            </div>
          </ScrollArea>

          {/* Chat Input - Fixed at bottom */}
          <div className="p-4 border-t border-border flex-shrink-0">
            <div className="max-w-[1000px] mx-auto">
              <div className="flex space-x-4">
                <div className="flex-1 relative">
                  <Input placeholder={getPlaceholderText()} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && !isChatDisabled && !isSending && !pendingUserMessage && handleSendMessage()} className="pr-12" disabled={isChatDisabled || isSending || !!pendingUserMessage} />
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                    {sourceCount} nguồn
                  </div>
                </div>
                <Button onClick={() => handleSendMessage()} disabled={!message.trim() || isChatDisabled || isSending || !!pendingUserMessage}>
                  {isSending || pendingUserMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              
              {/* Example Questions Carousel */}
              {!isChatDisabled && !pendingUserMessage && !showAiLoading && exampleQuestions.length > 0 && <div className="mt-4">
                  <Carousel className="w-full max-w-[1000px]">
                    <CarouselContent className="-ml-2 md:-ml-4">
                      {exampleQuestions.map((question, index) => <CarouselItem key={index} className="pl-2 md:pl-4 basis-auto">
                          <Button variant="outline" size="sm" className="text-left whitespace-nowrap h-auto py-2 px-3 text-sm" onClick={() => handleExampleQuestionClick(question)}>
                            {question}
                          </Button>
                        </CarouselItem>)}
                    </CarouselContent>
                    {exampleQuestions.length > 2 && <>
                        <CarouselPrevious className="left-0" />
                        <CarouselNext className="right-0" />
                      </>}
                  </Carousel>
                </div>}
            </div>
          </div>
        </div> :
    // Empty State
    <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden">
          <div className="mb-8 w-full max-w-md mx-auto">
            <EmptyState
              icon={<Upload className="h-10 w-10 text-muted-foreground opacity-50" />}
              title="Thêm nguồn để bắt đầu"
              description="Tải lên tài liệu để AI có thể hỗ trợ bạn kết nối các ý tưởng và giải đáp câu hỏi."
              action={{
                label: 'Tải nguồn lên',
                onClick: () => setShowAddSourcesDialog(true),
                icon: <Upload className="h-4 w-4" />
              }}
            />
          </div>

          {/* Bottom Input */}
          <div className="w-full max-w-2xl">
            <div className="flex space-x-4">
              <Input placeholder="Tải nguồn lên để bắt đầu" disabled className="flex-1" />
              <div className="flex items-center text-sm text-muted-foreground">
                0 nguồn
              </div>
              <Button disabled>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>}
      
      {/* Footer */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <p className="text-center text-sm text-muted-foreground">InsightsLM có thể không chính xác; vui lòng kiểm tra lại câu trả lời.</p>
      </div>
      
      {/* [perf] AddSourcesDialog lazy-loaded — 17.8KB chunk, only on first "Tải nguồn lên" click */}
      <Suspense fallback={null}>
        <LazyAddSourcesDialog
          open={showAddSourcesDialog}
          onOpenChange={setShowAddSourcesDialog}
          notebookId={notebookId}
        />
      </Suspense>
    </div>;
};

// [perf] React.memo prevents ChatArea from re-rendering when Notebook.tsx
// re-renders due to unrelated state changes (e.g., sidebar toggle, showFlowchart).
// Works in conjunction with useCallback handlers passed from Notebook.tsx.
export default React.memo(ChatArea);
