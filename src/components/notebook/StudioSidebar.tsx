import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MoreVertical, Plus, Edit, Bot, User, Loader2, AlertCircle, CheckCircle2, RefreshCw, Activity, ChevronRight, ChevronLeft, Workflow, Headphones, NotebookPen, PanelRight } from 'lucide-react';
import { useNotes, Note } from '@/hooks/useNotes';
import { useFlowcharts } from '@/hooks/useFlowcharts';
import { useAudioOverview } from '@/hooks/useAudioOverview';
import { useNotebooks } from '@/hooks/useNotebooks';
import { useSources } from '@/hooks/useSources';
import { useQueryClient } from '@tanstack/react-query';
import NoteEditor from './NoteEditor';
import AudioPlayer from './AudioPlayer';
import { Citation } from '@/types/message';

// Lazy-load ActivityPanel — only downloaded when user opens it
const ActivityPanel = lazy(() => import('./ActivityPanel'));

interface StudioSidebarProps {
  notebookId?: string;
  isExpanded?: boolean;
  onCitationClick?: (citation: Citation) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  isMember?: boolean;
  onOpenFlowchart?: (sourceId?: string) => void;
  hasSource?: boolean;
}

const StudioSidebar = ({
  notebookId,
  isExpanded,
  onCitationClick,
  canEdit = true,
  canDelete = true,
  isMember = false,
  onOpenFlowchart,
  hasSource = false,
}: StudioSidebarProps) => {
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [audioError, setAudioError] = useState(false);
  
  // Collapse states for the menu items
  const [audioOpen, setAudioOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [flowchartOpen, setFlowchartOpen] = useState(true);
  const [hasLoadedActivity, setHasLoadedActivity] = useState(false);

  useEffect(() => {
    if (activityOpen && !hasLoadedActivity) {
      setHasLoadedActivity(true);
    }
  }, [activityOpen, hasLoadedActivity]);

  const { notes, isLoading, createNote, updateNote, deleteNote, isCreating, isUpdating, isDeleting } = useNotes(notebookId);
  const { notebooks } = useNotebooks();
  const { sources } = useSources(notebookId);
  const { flowcharts } = useFlowcharts(notebookId);
  const { generateAudioOverview, refreshAudioUrl, autoRefreshIfExpired, isGenerating, isAutoRefreshing, generationStatus, checkAudioExpiry } = useAudioOverview(notebookId);
  
  const queryClient = useQueryClient();
  const notebook = notebooks?.find(n => n.id === notebookId);
  const hasValidAudio = notebook?.audio_overview_url && !checkAudioExpiry(notebook.audio_url_expires_at);
  const currentStatus = generationStatus || notebook?.audio_overview_generation_status;
  const hasProcessedSource = sources?.some(source => source.processing_status === 'completed') || false;

  useEffect(() => {
    if (!notebookId || !notebook?.audio_overview_url) return;
    autoRefreshIfExpired(notebookId, notebook.audio_url_expires_at);
    const interval = setInterval(
      () => autoRefreshIfExpired(notebookId, notebook.audio_url_expires_at),
      5 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, [notebookId, notebook?.audio_overview_url, notebook?.audio_url_expires_at, autoRefreshIfExpired]);

  const handleCreateNote = () => { setIsCreatingNote(true); setEditingNote(null); };
  const handleEditNote = (note: Note) => { setEditingNote(note); setIsCreatingNote(false); };
  
  const handleSaveNote = (title: string, content: string) => {
    if (editingNote) {
      if (editingNote.source_type === 'user') {
        updateNote({ id: editingNote.id, title, content });
      }
    } else {
      createNote({ title, content, source_type: 'user' });
    }
    setEditingNote(null);
    setIsCreatingNote(false);
  };

  const handleDeleteNote = () => {
    if (editingNote) { deleteNote(editingNote.id); setEditingNote(null); }
  };

  const handleCancel = () => { setEditingNote(null); setIsCreatingNote(false); };
  const handleGenerateAudio = () => { if (notebookId) { generateAudioOverview(notebookId); setAudioError(false); } };
  const handleAudioError = () => { setAudioError(true); };
  const handleAudioRetry = () => { handleGenerateAudio(); };
  const handleAudioDeleted = () => { if (notebookId) { queryClient.invalidateQueries({ queryKey: ['notebooks'] }); } setAudioError(false); };
  const handleUrlRefresh = (notebookId: string) => { refreshAudioUrl(notebookId); };

  const getStatusDisplay = () => {
    if (isAutoRefreshing) return { icon: null, text: "Đang làm mới URL...", description: "Đang cập nhật quyền truy cập âm thanh" };
    if (currentStatus === 'generating' || isGenerating) return { icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />, text: "Đang tạo âm thanh...", description: "Quá trình này có thể mất vài phút" };
    if (currentStatus === 'failed') return { icon: <AlertCircle className="h-4 w-4 text-red-600" />, text: "Tạo thất bại", description: "Vui lòng thử lại" };
    if (currentStatus === 'completed' && hasValidAudio) return { icon: <CheckCircle2 className="h-4 w-4 text-green-600" />, text: "Sẵn sàng phát", description: "Tổng quan âm thanh đã sẵn sàng" };
    return null;
  };

  const getPreviewText = (note: Note) => {
    if (note.source_type === 'ai_response') {
      if (note.extracted_text) return note.extracted_text;
      try {
        const parsed = JSON.parse(note.content);
        if (parsed.segments && parsed.segments[0]) return parsed.segments[0].text;
      } catch (e) { /* ignore */ }
    }
    return note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content;
  };

  if (editingNote || isCreatingNote) {
    return (
      <div className="w-full bg-background border-l border-border flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="text-muted-foreground mr-2">
            <ChevronLeft className="w-4 h-4 mr-1" /> Quay lại
          </Button>
          <span className="font-medium">{editingNote ? 'Chỉnh sửa ghi chú' : 'Thêm ghi chú'}</span>
          <div className="w-12"></div>
        </div>
        <NoteEditor 
          note={editingNote || undefined} 
          onSave={handleSaveNote} 
          onDelete={editingNote && canDelete ? handleDeleteNote : undefined} 
          onCancel={handleCancel} 
          isLoading={isCreating || isUpdating || isDeleting} 
          onCitationClick={onCitationClick} 
          readOnly={!canEdit}
        />
      </div>
    );
  }

  // Google NotebookLM style UX logic:
  // "Studio" header, sleek menu of collapsible items.
  return (
    <div className="w-full bg-background border-l border-border flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0 flex items-center gap-2">
        <PanelRight className="w-5 h-5 text-muted-foreground md:ml-10" />
        <h2 className="text-lg font-medium text-foreground">Studio</h2>
      </div>

      <ScrollArea className="flex-1 h-full px-4 py-4 no-scrollbar">
        <div className="space-y-4">

          {/* Sơ đồ Tương tác - Flowchart */}
          <Collapsible open={flowchartOpen} onOpenChange={setFlowchartOpen} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-foreground">Sơ đồ Tương tác</h3>
                </div>
                <div className="flex items-center gap-2">
                  {flowcharts && flowcharts.length > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{flowcharts.length}</span>}
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${flowchartOpen ? 'rotate-90' : ''}`} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 border-t border-border/50">
                <p className="text-sm text-muted-foreground mb-4">Trực quan hoá nội dung và cấu trúc tài liệu bằng sơ đồ hệ thống.</p>
                
                {flowcharts && flowcharts.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {flowcharts.map(fc => {
                      const source = sources?.find(s => s.id === fc.source_id);
                      return (
                        <div key={fc.id} className="group relative p-3 border border-border/50 rounded-lg hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => onOpenFlowchart?.(fc.source_id)}>
                          <div className="flex items-center gap-2 mb-1">
                            <Workflow className="h-3 w-3 text-primary" />
                            <span className="text-[10px] uppercase font-medium text-muted-foreground line-clamp-1">
                              {source?.title || 'Nguồn không xác định'}
                            </span>
                          </div>
                          <h4 className="font-medium text-sm text-foreground line-clamp-1">{fc.title || 'Sơ đồ luồng'}</h4>
                          {fc.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{fc.summary}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 px-4 bg-muted/20 rounded-lg border border-border/50 border-dashed mb-4">
                    <span className="text-muted-foreground/50 text-2xl block mb-2">📊</span>
                    <p className="text-xs text-muted-foreground">Chưa có sơ đồ nào. Tạo sơ đồ từ mục Nguồn!</p>
                  </div>
                )}
                
                {(!flowcharts || flowcharts.length === 0) && (
                  <Button 
                    size="sm" 
                    onClick={() => onOpenFlowchart?.()} 
                    disabled={!hasSource} 
                    className="w-full text-white bg-primary hover:bg-primary/90"
                  >
                    Mở màn hình sơ đồ
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Audio Overview */}
          <Collapsible open={audioOpen} onOpenChange={setAudioOpen} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-foreground">Tổng quan Âm thanh</h3>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${audioOpen ? 'rotate-90' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 border-t border-border/50">
                {hasValidAudio && !audioError && currentStatus !== 'generating' && !isAutoRefreshing ? (
                  <AudioPlayer 
                    audioUrl={notebook.audio_overview_url} 
                    title="Cuộc trò chuyện chuyên sâu" 
                    notebookId={notebookId} 
                    expiresAt={notebook.audio_url_expires_at} 
                    onError={handleAudioError} 
                    onRetry={handleAudioRetry} 
                    onDeleted={handleAudioDeleted}
                    onUrlRefresh={handleUrlRefresh}
                  />
                ) : (
                  <div className="bg-muted/30 rounded-lg p-3">
                    {/* Status Display */}
                    {(() => { const statusDisplay = getStatusDisplay(); return statusDisplay && (
                      <div className="flex items-center space-x-2 mb-3">
                        {statusDisplay.icon}
                        <div>
                          <p className="text-sm font-medium text-foreground">{statusDisplay.text}</p>
                          <p className="text-xs text-muted-foreground">{statusDisplay.description}</p>
                        </div>
                      </div>
                    ); })()}
                    
                    {audioError && (
                      <div className="flex items-center space-x-2 mb-3 p-2 bg-red-50 dark:bg-red-950/30 rounded-md">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <div className="flex-1">
                          <p className="text-sm text-red-600 dark:text-red-400">Âm thanh không khả dụng</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={handleAudioRetry} className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/50">
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Thử lại
                        </Button>
                      </div>
                    )}
                    
                    <Button 
                      size="sm" 
                      onClick={handleGenerateAudio} 
                      disabled={isGenerating || currentStatus === 'generating' || !hasProcessedSource || isAutoRefreshing || !canEdit} 
                      className="w-full"
                    >
                      {isGenerating || currentStatus === 'generating' ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Đang tạo...</>
                      ) : 'Tạo âm thanh'}
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Ghi chú - Notes */}
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <NotebookPen className="w-4 h-4 text-primary" />
                  <h3 className="font-medium text-foreground">Ghi chú đã lưu</h3>
                </div>
                <div className="flex items-center gap-2">
                  {notes && notes.length > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{notes.length}</span>}
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${notesOpen ? 'rotate-90' : ''}`} />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-4 border-t border-border/50">
                {canEdit && (
                  <Button variant="outline" size="sm" className="w-full mb-4 border-dashed" onClick={handleCreateNote}>
                    <Plus className="h-4 w-4 mr-2" />
                    Thêm ghi chú mới
                  </Button>
                )}

                {isLoading ? (
                  <div className="text-center py-4 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />Đang tải...</div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-2">
                    {notes.map(note => (
                      <div key={note.id} className="group relative p-3 border border-border/50 rounded-lg hover:border-primary/50 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => handleEditNote(note)}>
                        <div className="flex items-center gap-2 mb-1">
                          {note.source_type === 'ai_response' ? <Bot className="h-3 w-3 text-primary" /> : <User className="h-3 w-3 text-muted-foreground" />}
                          <span className="text-[10px] uppercase font-medium text-muted-foreground">
                            {note.source_type === 'ai_response' ? 'Trả lời AI' : 'Ghi chú'}
                          </span>
                        </div>
                        <h4 className="font-medium text-sm text-foreground line-clamp-1">{note.title}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{getPreviewText(note)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 px-4 bg-muted/20 rounded-lg border border-border/50 border-dashed">
                    <span className="text-muted-foreground/50 text-2xl block mb-2">📄</span>
                    <p className="text-xs text-muted-foreground">Chưa có ghi chú nào. Hãy tạo một ghi chú mới!</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Hoạt động - Activity */}
          {isMember && (
            <Collapsible open={activityOpen} onOpenChange={setActivityOpen} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <h3 className="font-medium text-foreground">Hoạt động Notebook</h3>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${activityOpen ? 'rotate-90' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-0 border-t border-border/50 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {hasLoadedActivity && (
                    <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}>
                      <ActivityPanel notebookId={notebookId} />
                    </Suspense>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

        </div>
      </ScrollArea>
    </div>
  );
};

export default StudioSidebar;
