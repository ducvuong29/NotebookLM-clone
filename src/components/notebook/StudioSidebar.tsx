import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MoreVertical, Plus, Edit, Bot, User, Loader2, AlertCircle, CheckCircle2, RefreshCw, Activity, ChevronRight } from 'lucide-react';
import { useNotes, Note } from '@/hooks/useNotes';
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
}

const StudioSidebar = ({
  notebookId,
  isExpanded,
  onCitationClick,
  canEdit = true,
  canDelete = true,
  isMember = false,
}: StudioSidebarProps) => {
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [hasLoadedActivity, setHasLoadedActivity] = useState(false);

  useEffect(() => {
    if (activityOpen && !hasLoadedActivity) {
      setHasLoadedActivity(true);
    }
  }, [activityOpen, hasLoadedActivity]);

  const {
    notes,
    isLoading,
    createNote,
    updateNote,
    deleteNote,
    isCreating,
    isUpdating,
    isDeleting
  } = useNotes(notebookId);
  const {
    notebooks
  } = useNotebooks();
  const {
    sources
  } = useSources(notebookId);
  const {
    generateAudioOverview,
    refreshAudioUrl,
    autoRefreshIfExpired,
    isGenerating,
    isAutoRefreshing,
    generationStatus,
    checkAudioExpiry
  } = useAudioOverview(notebookId);
  const queryClient = useQueryClient();
  const notebook = notebooks?.find(n => n.id === notebookId);
  const hasValidAudio = notebook?.audio_overview_url && !checkAudioExpiry(notebook.audio_url_expires_at);
  const currentStatus = generationStatus || notebook?.audio_overview_generation_status;
  
  // Permission booleans received via props from Notebook.tsx (H-3 centralization)
  
  // Check if at least one source has been successfully processed
  const hasProcessedSource = sources?.some(source => source.processing_status === 'completed') || false;

  // Auto-refresh expired URLs — delegate all check logic to autoRefreshIfExpired (avoids redundant double-check)
  useEffect(() => {
    if (!notebookId || !notebook?.audio_overview_url) return;
    
    // Call directly — autoRefreshIfExpired internally guards against concurrent calls
    autoRefreshIfExpired(notebookId, notebook.audio_url_expires_at);

    // Set up periodic check every 5 minutes
    const interval = setInterval(
      () => autoRefreshIfExpired(notebookId, notebook.audio_url_expires_at),
      5 * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [notebookId, notebook?.audio_overview_url, notebook?.audio_url_expires_at, autoRefreshIfExpired]);

  const handleCreateNote = () => {
    setIsCreatingNote(true);
    setEditingNote(null);
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setIsCreatingNote(false);
  };

  const handleSaveNote = (title: string, content: string) => {
    if (editingNote) {
      // Only allow updating user notes, not AI responses
      if (editingNote.source_type === 'user') {
        updateNote({
          id: editingNote.id,
          title,
          content
        });
      }
    } else {
      createNote({
        title,
        content,
        source_type: 'user'
      });
    }
    setEditingNote(null);
    setIsCreatingNote(false);
  };

  const handleDeleteNote = () => {
    if (editingNote) {
      deleteNote(editingNote.id);
      setEditingNote(null);
    }
  };

  const handleCancel = () => {
    setEditingNote(null);
    setIsCreatingNote(false);
  };

  const handleGenerateAudio = () => {
    if (notebookId) {
      generateAudioOverview(notebookId);
      setAudioError(false);
    }
  };

  const handleAudioError = () => {
    setAudioError(true);
  };

  const handleAudioRetry = () => {
    // Regenerate the audio overview
    handleGenerateAudio();
  };

  const handleAudioDeleted = () => {
    // Refresh the notebooks data to update the UI
    if (notebookId) {
      queryClient.invalidateQueries({
        queryKey: ['notebooks']
      });
    }
    setAudioError(false);
  };

  const handleUrlRefresh = (notebookId: string) => {
    refreshAudioUrl(notebookId);
  };

  const getStatusDisplay = () => {
    if (isAutoRefreshing) {
      return {
        icon: null,
        text: "Đang làm mới URL...",
        description: "Đang cập nhật quyền truy cập âm thanh"
      };
    }
    
    if (currentStatus === 'generating' || isGenerating) {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
        text: "Đang tạo âm thanh...",
        description: "Quá trình này có thể mất vài phút"
      };
    } else if (currentStatus === 'failed') {
      return {
        icon: <AlertCircle className="h-4 w-4 text-red-600" />,
        text: "Tạo thất bại",
        description: "Vui lòng thử lại"
      };
    } else if (currentStatus === 'completed' && hasValidAudio) {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
        text: "Sẵn sàng phát",
        description: "Tổng quan âm thanh đã sẵn sàng"
      };
    }
    return null;
  };

  const isEditingMode = editingNote || isCreatingNote;
  const getPreviewText = (note: Note) => {
    if (note.source_type === 'ai_response') {
      // Use extracted_text if available, otherwise parse the content
      if (note.extracted_text) {
        return note.extracted_text;
      }
      try {
        const parsed = JSON.parse(note.content);
        if (parsed.segments && parsed.segments[0]) {
          return parsed.segments[0].text;
        }
      } catch (e) {
        // If parsing fails, use content as-is
      }
    }

    // For user notes or fallback, use the content directly
    const contentToUse = note.content;
    return contentToUse.length > 100 ? contentToUse.substring(0, 100) + '...' : contentToUse;
  };

  if (isEditingMode) {
    return <div className="w-full bg-background border-l border-border flex flex-col h-full overflow-hidden">
        <NoteEditor 
          note={editingNote || undefined} 
          onSave={handleSaveNote} 
          onDelete={editingNote && canDelete ? handleDeleteNote : undefined} 
          onCancel={handleCancel} 
          isLoading={isCreating || isUpdating || isDeleting} 
          onCitationClick={onCitationClick} 
          readOnly={!canEdit}
        />
      </div>;
  }

  return <div className="w-full bg-muted/30 border-l border-border flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0">
        <h2 className="text-lg font-medium text-foreground mb-4">Studio</h2>
        
        {/* Audio Overview */}
        <Card className="p-4 mb-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Tổng quan Âm thanh</h3>
          </div>

          {hasValidAudio && !audioError && currentStatus !== 'generating' && !isAutoRefreshing ? <AudioPlayer 
              audioUrl={notebook.audio_overview_url} 
              title="Cuộc trò chuyện chuyên sâu" 
              notebookId={notebookId} 
              expiresAt={notebook.audio_url_expires_at} 
              onError={handleAudioError} 
              onRetry={handleAudioRetry} 
              onDeleted={handleAudioDeleted}
              onUrlRefresh={handleUrlRefresh}
            /> : <Card className="p-3 border border-border">
              {/* Hide this div when generating or auto-refreshing */}
              {currentStatus !== 'generating' && !isGenerating && !isAutoRefreshing && <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" className="fill-foreground">
                      <path d="M280-120v-123q-104-14-172-93T40-520h80q0 83 58.5 141.5T320-320h10q5 0 10-1 13 20 28 37.5t32 32.5q-10 3-19.5 4.5T360-243v123h-80Zm20-282q-43-8-71.5-40.5T200-520v-240q0-50 35-85t85-35q50 0 85 35t35 85v160H280v80q0 31 5 60.5t15 57.5Zm340 2q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm-40 280v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T640-320q83 0 141.5-58.5T840-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T680-520v-240q0-17-11.5-28.5T640-800q-17 0-28.5 11.5T600-760v240q0 17 11.5 28.5T640-480Zm0-160Z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">Cuộc trò chuyện chuyên sâu</h4>
                    <p className="text-sm text-muted-foreground">Hai người dẫn</p>
                  </div>
                </div>}
              
              {/* Status Display — [perf] derived once, was calling getStatusDisplay() 3x before */}
              {(() => { const statusDisplay = getStatusDisplay(); return statusDisplay && (
                <div className="flex items-center space-x-2 mb-3 p-2 rounded-md bg-transparent">
                  {statusDisplay.icon}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{statusDisplay.text}</p>
                    <p className="text-xs text-muted-foreground">{statusDisplay.description}</p>
                  </div>
                </div>
              ); })()}
              
              {/* Audio error div */}
              {audioError && <div className="flex items-center space-x-2 mb-3 p-2 bg-red-50 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <div className="flex-1">
                    <p className="text-sm text-red-600">Âm thanh không khả dụng</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAudioRetry} className="text-red-600 border-red-300 hover:bg-red-50">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Thử lại
                  </Button>
                </div>}
              
              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  onClick={handleGenerateAudio} 
                  disabled={isGenerating || currentStatus === 'generating' || !hasProcessedSource || isAutoRefreshing || !canEdit} 
                  className="flex-1 text-white bg-slate-900 hover:bg-slate-800"
                >
                  {isGenerating || currentStatus === 'generating' ? <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Đang tạo...
                    </> : 'Tạo'}
                </Button>
              </div>
            </Card>}
        </Card>

        {/* Notes Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-foreground">Ghi chú</h3>
          </div>
          
          {canEdit && (
            <Button variant="outline" size="sm" className="w-full mb-4" onClick={handleCreateNote}>
              <Plus className="h-4 w-4 mr-2" />
              Thêm ghi chú
            </Button>
          )}
        </div>
      </div>

      {/* Saved Notes Area */}
      <ScrollArea className="flex-1 h-full">
        <div className="p-4">
          {isLoading ? <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Đang tải ghi chú...</p>
            </div> : notes && notes.length > 0 ? <div className="space-y-3">
              {notes.map(note => <Card key={note.id} className="p-3 border border-border hover:bg-muted cursor-pointer" onClick={() => handleEditNote(note)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {note.source_type === 'ai_response' ? <Bot className="h-3 w-3 text-primary" /> : <User className="h-3 w-3 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground uppercase">
                          {note.source_type === 'ai_response' ? 'Trả lời AI' : 'Ghi chú'}
                        </span>
                      </div>
                      <h4 className="font-medium text-foreground truncate">{note.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {getPreviewText(note)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(note.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {note.source_type === 'user' && canEdit && (
                      <Button aria-label="Chỉnh sửa" variant="ghost" size="sm" className="ml-2 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 p-0 md:px-3">
                        <Edit className="h-4 w-4 md:h-3 md:w-3" />
                      </Button>
                    )}
                  </div>
                </Card>)}
            </div> : <div className="text-center py-8">
              <div className="w-16 h-16 bg-muted rounded-lg mx-auto mb-4 flex items-center justify-center">
                <span className="text-muted-foreground text-2xl">📄</span>
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Ghi chú đã lưu sẽ xuất hiện ở đây</h3>
              <p className="text-sm text-muted-foreground">
                Lưu tin nhắn trò chuyện để tạo ghi chú mới, hoặc nhấn Thêm ghi chú ở trên.
              </p>
            </div>}
        </div>
      </ScrollArea>

      {/* Activity Log — collapsible, only for members */}
      {isMember && (
        <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-2 px-4 py-3 border-t border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Activity className="w-4 h-4" />
              <span>Hoạt động</span>
              <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${activityOpen ? 'rotate-90' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="max-h-[300px] overflow-y-auto border-t border-border/50">
              {hasLoadedActivity && (
                <Suspense fallback={
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                }>
                  <ActivityPanel notebookId={notebookId} />
                </Suspense>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>;
};

export default StudioSidebar;
