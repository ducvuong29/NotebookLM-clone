
import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, MoreVertical, Trash2, Edit, Loader2, CheckCircle, XCircle, Upload, GitBranch, ChevronLeft, PanelLeftClose } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Suspense } from 'react';
import { LazyAddSourcesDialog } from './lazy-components';
import RenameSourceDialog from './RenameSourceDialog';
import SourceContentViewer from '@/components/chat/SourceContentViewer';
import { useSources } from '@/hooks/useSources';
import { useSourceDelete } from '@/hooks/useSourceDelete';
import { Citation } from '@/types/message';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonSourceItem } from '@/components/ui/SkeletonSourceItem';
import { EMPTY_STATE } from '@/lib/empty-state-content';
import type { Database } from '@/integrations/supabase/types';

type SourceRecord = Database['public']['Tables']['sources']['Row'];

interface SourcesSidebarProps {
  hasSource: boolean;
  notebookId?: string;
  selectedCitation?: Citation | null;
  onCitationClose?: () => void;
  setSelectedCitation?: (citation: Citation | null) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  onGenerateFlowchart?: (sourceId: string) => void;
  flowchartStatusMap?: Map<string, string>;
  onCloseSidebar?: () => void;
}

// ============================================================================
// Module-level helpers — no component state/props dependency, stable across renders
// ============================================================================

function renderSourceIcon(type: string) {
  const iconMap: Record<string, string> = {
    'pdf': '/file-types/PDF.svg',
    'text': '/file-types/TXT.png',
    'website': '/file-types/WEB.svg',
    'youtube': '/file-types/MP3.png',
    'audio': '/file-types/MP3.png',
    'doc': '/file-types/DOC.png',
    'multiple-websites': '/file-types/WEB.svg',
    'copied-text': '/file-types/TXT.png',
  };

  const iconUrl = iconMap[type] || iconMap['text'];

  return (
    <img
      src={iconUrl}
      alt={`${type} icon`}
      className="w-full h-full object-contain"
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        target.parentElement!.innerHTML = '📄';
      }}
    />
  );
}

function renderProcessingStatus(status: string) {
  switch (status) {
    case 'uploading':
      return <Upload className="h-4 w-4 animate-pulse text-blue-500" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'pending':
      return <Loader2 className="h-4 w-4 animate-pulse text-gray-500" />;
    default:
      return null;
  }
}

const SourcesSidebar = ({
  hasSource,
  notebookId,
  selectedCitation,
  onCitationClose,
  setSelectedCitation,
  canEdit = true,
  canDelete = true,
  onGenerateFlowchart,
  flowchartStatusMap = new Map<string, string>(),
  onCloseSidebar,
}: SourcesSidebarProps) => {
  const [showAddSourcesDialog, setShowAddSourcesDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceRecord | null>(null);
  const [selectedSourceForViewing, setSelectedSourceForViewing] = useState<SourceRecord | null>(null);

  const {
    sources,
    isLoading
  } = useSources(notebookId);

  const {
    deleteSource,
    isDeleting
  } = useSourceDelete();

  // Permission booleans received via props from Notebook.tsx (H-3 centralization)

  // [perf] O(1) source lookup Map — replaces 3 separate O(n) .find() calls per render
  const sourceMap = useMemo(
    () => new Map((sources ?? []).map(s => [s.id, s])),
    [sources]
  );

  // Get source fields via O(1) Map lookup
  const getSourceContent = (citation: Citation) => sourceMap.get(citation.source_id)?.content || '';
  const getSourceSummary = (citation: Citation) => sourceMap.get(citation.source_id)?.summary || '';
  const getSourceUrl = (citation: Citation) => sourceMap.get(citation.source_id)?.url || '';

  // Get the source summary for a selected source
  const getSelectedSourceSummary = () => selectedSourceForViewing?.summary || '';

  // Get the source content for a selected source
  const getSelectedSourceContent = () => selectedSourceForViewing?.content || '';

  // Get the source URL for a selected source
  const getSelectedSourceUrl = () => selectedSourceForViewing?.url || '';

  
  // [perf] useCallback stabilizes handler references so parent memo'd children
  // (e.g., list items) aren't forced to re-render on every SourcesSidebar re-render.

  const handleRemoveSource = useCallback((source: SourceRecord) => {
    setSelectedSource(source);
    setShowDeleteDialog(true);
  }, []);

  const handleRenameSource = useCallback((source: SourceRecord) => {
    setSelectedSource(source);
    setShowRenameDialog(true);
  }, []);

  const handleSourceClick = useCallback((source: SourceRecord) => {
    // Clear any existing citation state first
    if (setSelectedCitation) {
      setSelectedCitation(null);
    }

    // Set the selected source for viewing
    setSelectedSourceForViewing(source);

    // Create a mock citation for the selected source without line data (this prevents auto-scroll)
    const mockCitation: Citation = {
      citation_id: -1, // Use negative ID to indicate this is a mock citation
      source_id: source.id,
      source_title: source.title,
      source_type: source.type,
      chunk_index: 0,
      excerpt: 'Full document view',
      // Deliberately omitting chunk_lines_from and chunk_lines_to to prevent auto-scroll
    };

    // [perf] React 18 auto-batches all setState calls in an event handler into 1 re-render.
    if (setSelectedCitation) {
      setSelectedCitation(mockCitation);
    }
  }, [setSelectedCitation]);

  const handleBackToSources = useCallback(() => {
    setSelectedSourceForViewing(null);
    onCitationClose?.();
  }, [onCitationClose]);

  const confirmDelete = useCallback(() => {
    if (selectedSource) {
      deleteSource(selectedSource.id);
      setShowDeleteDialog(false);
      setSelectedSource(null);
    }
  }, [selectedSource, deleteSource]);

  // If we have a selected citation, show the content viewer
  if (selectedCitation) {
    // Determine which citation to display and get appropriate content/summary/url
    const displayCitation = selectedCitation;
    const sourceContent = selectedSourceForViewing ? getSelectedSourceContent() : getSourceContent(selectedCitation);
    const sourceSummary = selectedSourceForViewing ? getSelectedSourceSummary() : getSourceSummary(selectedCitation);
    const sourceUrl = selectedSourceForViewing ? getSelectedSourceUrl() : getSourceUrl(selectedCitation);

    return (
      <div className="w-full bg-muted/30 border-r border-border flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleBackToSources} className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline" onClick={handleBackToSources}>
              Nguồn tài liệu
            </h2>
          </div>
        </div>
        
        <SourceContentViewer 
          citation={displayCitation} 
          sourceContent={sourceContent} 
          sourceSummary={sourceSummary}
          sourceUrl={sourceUrl}
          className="flex-1 overflow-hidden" 
          isOpenedFromSourceList={selectedCitation.citation_id === -1}
        />
      </div>
    );
  }

  return (
    <div className="w-full bg-muted/30 border-r border-border flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-foreground">Nguồn tài liệu</h2>
          {onCloseSidebar && (
            <Button variant="ghost" size="icon" onClick={onCloseSidebar} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <PanelLeftClose className="h-5 w-5" />
            </Button>
          )}
        </div>
        
        {canEdit && (
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddSourcesDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Thêm nguồn
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 h-full">
        <div className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonSourceItem key={i} />
              ))}
            </div>
          ) : sources && sources.length > 0 ? (
            <div className="space-y-4">
              {sources.map((source) => (
                <ContextMenu key={source.id}>
                  <ContextMenuTrigger>
                    <Card className="p-3 border border-border cursor-pointer hover:bg-muted animate-fade-in" onClick={() => handleSourceClick(source)}>
                      <div className="flex items-start justify-between space-x-3">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <div className="w-6 h-6 bg-background rounded border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                            {renderSourceIcon(source.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-foreground truncate block">{source.title}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 py-[4px] flex items-center space-x-1">
                          {source.processing_status === 'completed' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGenerateFlowchart?.(source.id);
                              }}
                              disabled={flowchartStatusMap.get(source.id) === 'generating'}
                              aria-label={`Tạo sơ đồ cho ${source.title}`}
                              title="Tạo sơ đồ"
                            >
                              {flowchartStatusMap.get(source.id) === 'generating' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <GitBranch className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {renderProcessingStatus(source.processing_status)}
                        </div>
                      </div>
                    </Card>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    {canEdit && (
                      <ContextMenuItem onClick={() => handleRenameSource(source)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Đổi tên nguồn
                      </ContextMenuItem>
                    )}
                    {canDelete && (
                      <ContextMenuItem onClick={() => handleRemoveSource(source)} className="text-red-600 focus:text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Xóa nguồn
                      </ContextMenuItem>
                    )}
                    {!canEdit && !canDelete && (
                      <ContextMenuItem disabled>
                        Không có quyền sửa đổi
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<span className="text-4xl block mb-2">📄</span>}
              title={EMPTY_STATE.sources.title}
              description={EMPTY_STATE.sources.description}
              className="py-12"
            />
          )}
        </div>
      </ScrollArea>

      {/* [perf] AddSourcesDialog lazy-loaded — 17.8KB chunk downloaded only on first "Thêm nguồn" click */}
      <Suspense fallback={null}>
        <LazyAddSourcesDialog
          open={showAddSourcesDialog}
          onOpenChange={setShowAddSourcesDialog}
          notebookId={notebookId}
        />
      </Suspense>

      <RenameSourceDialog 
        open={showRenameDialog} 
        onOpenChange={setShowRenameDialog} 
        source={selectedSource} 
        notebookId={notebookId} 
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSource?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to delete this source. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="bg-red-600 hover:bg-red-700" 
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// [perf] React.memo prevents SourcesSidebar from re-rendering when Notebook.tsx
// re-renders due to unrelated state changes (e.g., showFlowchart, activeTab).
export default React.memo(SourcesSidebar);
