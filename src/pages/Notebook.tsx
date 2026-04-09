import React, { lazy, Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react';

import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { RegenerateFlowchartDialog } from '@/components/flowchart/RegenerateFlowchartDialog';
import { UnsavedChangesDialog } from '@/components/flowchart/UnsavedChangesDialog';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, GripVertical, Plus } from 'lucide-react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useNotebooks } from '@/hooks/useNotebooks';
import { useSources } from '@/hooks/useSources';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useNotebookPermissions } from '@/hooks/useNotebookPermissions';
import { FlowchartSkeleton } from '@/components/flowchart/FlowchartSkeleton';
import { useFlowcharts } from '@/hooks/useFlowcharts';
import { useGenerateFlowchart } from '@/hooks/useGenerateFlowchart';
import NotebookHeader from '@/components/notebook/NotebookHeader';
import SourcesSidebar from '@/components/notebook/SourcesSidebar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Citation } from '@/types/message';
// [perf] ChatArea + StudioSidebar are eager-loaded: they render on every /notebook
// visit (100% probability), so lazy would only add a cascade waterfall without
// any bundle benefit for users already on this route.
import ChatArea from '@/components/notebook/ChatArea';
import StudioSidebar from '@/components/notebook/StudioSidebar';
// MobileNotebookTabs stays lazy — mutually exclusive with the desktop layout,
// so ~60% of sessions (desktop) never need this chunk at all.
import { LazyMobileNotebookTabs } from '@/components/notebook/lazy-components';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, Link as LinkIcon, File, AudioLines, Network,
  Presentation, BookOpen, MessageCircleQuestion, BarChart2, Table
} from 'lucide-react';

const FlowchartPanel = lazy(() =>
  import('@/components/flowchart/FlowchartPanel').then((module) => ({
    default: module.FlowchartPanel,
  }))
);

// ---------- Skeleton fallbacks for lazy panels ----------

/** Shown while MobileNotebookTabs chunk downloads */
const MobileTabsSkeleton = () => (
  <div className="flex h-full flex-col animate-pulse">
    <div className="h-12 bg-muted border-b border-border" />
    <div className="flex-1 p-4 space-y-3">
      <div className="h-4 bg-muted rounded w-2/3" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  </div>
);

interface CollapsedSidebarRailProps {
  side: 'left' | 'right';
  onOpen: () => void;
  actionTooltip?: string;
  children?: React.ReactNode;
}

const CollapsedSidebarRail = ({ side, onOpen, actionTooltip, children }: CollapsedSidebarRailProps) => {
  const edgeClass = side === 'left' ? 'left-4' : 'right-4';
  const PanelIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;

  return (
    <div className={`absolute top-4 bottom-4 z-20 hidden md:flex w-[56px] flex-col items-center rounded-[28px] border border-border/60 bg-background/95 p-2 shadow-lg backdrop-blur-md ${edgeClass}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpen}
        aria-label={side === 'left' ? 'Mở nguồn' : 'Mở studio'}
        title={side === 'left' ? 'Mở nguồn' : 'Mở studio'}
        className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PanelIcon className="h-5 w-5" />
      </Button>
      
      {actionTooltip && (
        <>
          <div className="my-2 h-[1px] w-6 bg-border shrink-0" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpen}
            title={actionTooltip}
            aria-label={actionTooltip}
            className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground mb-2"
          >
            <Plus className="h-6 w-6" strokeWidth={2} />
          </Button>
        </>
      )}

      {children && (
        <ScrollArea className="flex-1 w-full flex flex-col pt-2 no-scrollbar">
          <div className="flex flex-col items-center gap-3 pb-4">
            {children}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

const StudioRailIcon = ({ icon: Icon, bgColor, iconColor, onOpen }: { icon: React.ElementType, bgColor: string, iconColor: string, onOpen: () => void }) => (
  <button 
    onClick={onOpen}
    className={`relative flex items-center justify-center w-11 h-11 rounded-2xl ${bgColor} hover:brightness-95 dark:hover:brightness-110 transition-all shrink-0`}
  >
    <Icon className={`w-5 h-5 ${iconColor}`} />
    <span className="absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 flex items-center justify-center bg-background rounded-full w-4 h-4 border border-background shadow-sm">
       <Plus className="w-3 h-3 text-muted-foreground" strokeWidth={4} />
    </span>
  </button>
);

interface SidebarDockButtonProps {
  side: 'left' | 'right';
  action: 'open' | 'close';
  onClick: () => void;
}

const SidebarDockButton = ({ side, action, onClick }: SidebarDockButtonProps) => {
  const edgeClass =
    side === 'left'
      ? action === 'open'
        ? 'left-3'
        : 'right-3'
      : action === 'open'
        ? 'right-3'
        : 'left-3';

  const icon =
    side === 'left'
      ? action === 'open'
        ? <PanelLeftOpen className="h-4 w-4" />
        : <PanelLeftClose className="h-4 w-4" />
      : action === 'open'
        ? <PanelRightOpen className="h-4 w-4" />
        : <PanelRightClose className="h-4 w-4" />;

  const ariaLabel =
    side === 'left'
      ? action === 'open'
        ? 'Hiện nguồn'
        : 'Ẩn nguồn'
      : action === 'open'
        ? 'Hiện sidebar phải'
        : 'Ẩn sidebar phải';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`absolute top-3 z-20 hidden h-9 w-9 rounded-xl border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground md:inline-flex ${edgeClass}`}
    >
      {icon}
    </Button>
  );
};

const Notebook = () => {
  const { id: notebookId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromSearch = (location.state as { fromSearch?: string })?.fromSearch;
  const { notebooks } = useNotebooks();
  const { sources } = useSources(notebookId);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [showSourcesSidebar, setShowSourcesSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [showFlowchart, setShowFlowchart] = useState(false);
  const [hasLoadedFlowchart, setHasLoadedFlowchart] = useState(false);
  const { flowcharts, getFlowchartBySourceId, saveFlowchart } = useFlowcharts(notebookId);
  const { generateFlowchartAsync, isGenerating: isFlowchartGenerating } = useGenerateFlowchart(notebookId);
  const [activeFlowchartSourceId, setActiveFlowchartSourceId] = useState<string | null>(null);
  const [pendingRegenerateSourceId, setPendingRegenerateSourceId] = useState<string | null>(null);
  const [isFlowchartDirty, setIsFlowchartDirtyState] = useState(false);
  const isFlowchartDirtyRef = useRef(isFlowchartDirty);

  const setIsFlowchartDirty = useCallback((dirty: boolean) => {
    setIsFlowchartDirtyState(dirty);
    isFlowchartDirtyRef.current = dirty;
  }, []);

  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const { toast } = useToast();

  const guardedAction = useCallback((action: () => void) => {
    if (isFlowchartDirtyRef.current) {
      setPendingAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  }, []);

  const flowchartGeneratingStatus = useMemo(() => {
    const map = new Map<string, string>();
    flowcharts?.forEach(fc => {
      if (fc.generation_status === 'generating') {
        map.set(fc.source_id, 'generating');
      }
    });
    return map;
  }, [flowcharts]);
  const isDesktop = useIsDesktop();

  // [perf] useMemo — notebooks is an array from React Query cache; .find() is O(n).
  // Without memo, this runs on every Notebook render (sidebar toggle, citation click, etc.).
  // Re-computes only when notebooks array reference or notebookId changes.
  const notebook = useMemo(
    () => notebooks?.find((item) => item.id === notebookId),
    [notebooks, notebookId]
  );

  // [perf] useMemo — avoids Boolean(sources && sources.length > 0) recalculation
  // on every render. Stable reference also benefits any memo'd children reading this.
  const hasSource = useMemo(
    () => Boolean(sources && sources.length > 0),
    [sources]
  );

  const isSourceDocumentOpen = Boolean(selectedCitation);

  useEffect(() => {
    if (selectedCitation?.source_id) {
      guardedAction(() => {
        setActiveFlowchartSourceId(selectedCitation.source_id);
      });
    }
  }, [selectedCitation?.source_id, guardedAction]);

  useEffect(() => {
    if (!sources || sources.length === 0) {
      setShowFlowchart(false);
      setActiveFlowchartSourceId(null);
      return;
    }

    setActiveFlowchartSourceId((currentSourceId) => {
      if (currentSourceId && sources.some((source) => source.id === currentSourceId)) {
        return currentSourceId;
      }

      return sources[0]?.id ?? null;
    });
  }, [notebookId, sources]);

  const executeFlowchartGeneration = useCallback(async (sourceId: string) => {
    const source = sources?.find(s => s.id === sourceId);
    if (!source) return;

    try {
      await generateFlowchartAsync({ sourceId, force: !!getFlowchartBySourceId(sourceId) });

      // Switch to flowchart panel immediately (data arrives via Realtime)
      guardedAction(() => {
        setActiveFlowchartSourceId(sourceId);
        setShowFlowchart(true);
        setHasLoadedFlowchart(true);
        setShowRightSidebar(true);
      });
    } catch (error) {
      // Error toast is handled by useGenerateFlowchart.onError
      console.error('Flowchart generation trigger failed:', error);
    }
  }, [sources, generateFlowchartAsync, getFlowchartBySourceId, guardedAction]);

  const handleGenerateFlowchart = useCallback((sourceId: string) => {
    // Check if flowchart exists → confirmation dialog
    if (getFlowchartBySourceId(sourceId)) {
      setPendingRegenerateSourceId(sourceId);
      return;
    }
    executeFlowchartGeneration(sourceId);
  }, [getFlowchartBySourceId, executeFlowchartGeneration]);

  const { role, canEdit, canDelete, canInvite, isMember } = useNotebookPermissions(
    notebookId,
    notebook?.user_id,
    notebook?.visibility
  );

  // [perf] useCallback keeps function references stable across Notebook re-renders.
  // Without this, memo'd children (ChatArea, SourcesSidebar, StudioSidebar) lose
  // their memo optimization every time any Notebook state changes.

  const handleCitationClick = useCallback((citation: Citation) => {
    guardedAction(() => {
      setActiveFlowchartSourceId(citation.source_id);
      setSelectedCitation(citation);

      if (!isDesktop) {
        setActiveTab('sources');
      }
    });
  }, [guardedAction, isDesktop, setActiveTab]);

  // setSelectedCitation is a stable useState setter — dep array is intentionally empty.
  const handleCitationClose = useCallback(() => {
    setSelectedCitation(null);
  }, []);

  const handleFlowchartToggle = useCallback((sourceId?: string) => {
    guardedAction(() => {
      if (!showFlowchart || sourceId) {
        setHasLoadedFlowchart(true);
        if (typeof sourceId === 'string') {
          setActiveFlowchartSourceId(sourceId);
        } else if (!showFlowchart) {
          setActiveFlowchartSourceId(
            selectedCitation?.source_id ?? activeFlowchartSourceId ?? sources?.[0]?.id ?? null
          );
        }
      }

      setShowRightSidebar(true);
      setShowFlowchart(sourceId ? true : !showFlowchart);
    });
  }, [guardedAction, showFlowchart, selectedCitation, activeFlowchartSourceId, sources]);

  const handleNavigateHome = useCallback(() => {
    guardedAction(() => {
      navigate('/');
    });
  }, [guardedAction, navigate]);

  const handleNavigateBack = useCallback(() => {
    guardedAction(() => {
      if (fromSearch) {
        navigate(`/?q=${encodeURIComponent(fromSearch)}`);
      } else {
        navigate(-1);
      }
    });
  }, [guardedAction, navigate, fromSearch]);

  const handleFlowchartSave = useCallback(async (draft: {
    mermaid_code: string;
    title: string;
    summary: string;
  }) => {
    if (!activeFlowchartSourceId) return;
    const existing = getFlowchartBySourceId(activeFlowchartSourceId);
    if (!existing) return;

    try {
      await saveFlowchart.mutateAsync({
        id: existing.id,
        mermaid_code: draft.mermaid_code,
        title: draft.title,
        summary: draft.summary,
      });
      toast({ title: "Đã lưu sơ đồ!", variant: "default" });
    } catch {
      toast({
        title: "Lỗi lưu sơ đồ",
        description: "Không thể lưu thay đổi. Vui lòng thử lại.",
        variant: "destructive",
      });
    }
  }, [activeFlowchartSourceId, getFlowchartBySourceId, saveFlowchart, toast]);

  // [perf] Extracted from JSX: stable references so memoized children
  // (FlowchartPanel, SourcesSidebar, SidebarDockButton) keep their optimisations
  // on every Notebook re-render.
  const handleCloseSourcesSidebar = useCallback(() => setShowSourcesSidebar(false), []);
  const handleOpenSourcesSidebar  = useCallback(() => setShowSourcesSidebar(true), []);
  const handleOpenRightSidebar    = useCallback(() => setShowRightSidebar(true), []);
  const handleCloseRightSidebar   = useCallback(() => setShowRightSidebar(false), []);

  // FlowchartPanel callbacks that call guardedAction
  const handleFlowchartClose = useCallback(
    () => guardedAction(() => setShowFlowchart(false)),
    [guardedAction]
  );
  const handleFlowchartOpenSources = useCallback(
    () => guardedAction(() => setShowSourcesSidebar(true)),
    [guardedAction]
  );

  // RegenerateFlowchartDialog callbacks
  const handleRegenerateOpenChange = useCallback((open: boolean) => {
    if (!open) setPendingRegenerateSourceId(null);
  }, []);
  const handleRegenerateConfirm = useCallback(() => {
    if (pendingRegenerateSourceId) {
      executeFlowchartGeneration(pendingRegenerateSourceId);
      setPendingRegenerateSourceId(null);
    }
  }, [pendingRegenerateSourceId, executeFlowchartGeneration]);

  // UnsavedChangesDialog discard callback
  const handleUnsavedDiscard = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const activeFlowchartSource =
    sources?.find((source) => source.id === activeFlowchartSourceId) ?? null;
  const activeFlowchartData = activeFlowchartSourceId
    ? getFlowchartBySourceId(activeFlowchartSourceId) ?? null
    : null;

  useEffect(() => {
    if (!isFlowchartDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Required for generic message to appear
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isFlowchartDirty]);

  const sourcesWidth = showSourcesSidebar
    ? isSourceDocumentOpen
      ? 'w-[26%]'
      : 'w-[18%]'
    : 'w-0';

  const rightSidebarWidth = showRightSidebar
    ? showFlowchart
      ? showSourcesSidebar
        ? 'w-[34%]'
        : 'w-[40%]'
      : showSourcesSidebar
        ? 'w-[30%]'
        : 'w-[34%]'
    : 'w-0';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <NotebookHeader
        title={notebook?.title || 'Notebook chưa đặt tên'}
        notebookId={notebookId}
        notebookOwnerId={notebook?.user_id}
        role={role}
        canEdit={canEdit}
        canInvite={canInvite}
        isMember={isMember}
        showFlowchartToggle={Boolean(isDesktop && hasSource)}
        isFlowchartActive={showFlowchart}
        onToggleFlowchart={handleFlowchartToggle}
        onNavigateHome={handleNavigateHome}
        onNavigateBack={handleNavigateBack}
      />

      {isDesktop ? (
        <main id="main-content" className="flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            {showSourcesSidebar && (
              <>
                <Panel
                  id="sources-panel"
                  order={1}
                  collapsible
                  defaultSize={20}
                  minSize={15}
                  maxSize={40}
                  className="relative"
                >
                  <div className="h-full overflow-hidden opacity-100">
                      <SourcesSidebar
                        hasSource={hasSource}
                        notebookId={notebookId}
                        selectedCitation={selectedCitation}
                        onCitationClose={handleCitationClose}
                        setSelectedCitation={setSelectedCitation}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onGenerateFlowchart={handleGenerateFlowchart}
                        flowchartStatusMap={flowchartGeneratingStatus}
                        onCloseSidebar={handleCloseSourcesSidebar}
                      />
                  </div>
                </Panel>
                <PanelResizeHandle className="relative flex w-2 items-center justify-center bg-border/40 hover:bg-primary/50 transition-colors z-10 cursor-col-resize group">
                  <div className="z-20 flex h-6 w-3 items-center justify-center rounded-sm border border-border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                  </div>
                </PanelResizeHandle>
              </>
            )}

            <Panel id="chat-panel" order={2} className="relative min-w-0">
              {!showSourcesSidebar && (
                <CollapsedSidebarRail
                  side="left"
                  onOpen={handleOpenSourcesSidebar}
                  actionTooltip="Thêm nguồn"
                >
                  {sources?.map(source => (
                    <div 
                      key={source.id} 
                      className="w-11 h-11 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-800 transition-colors"
                      onClick={() => setShowSourcesSidebar(true)}
                      title={source.title}
                    >
                      {source.type === 'pdf' ? (
                        <div className="bg-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-sm">PDF</div>
                      ) : source.type === 'youtube' ? (
                        <div className="text-red-500 font-bold">&#9654;</div>
                      ) : (
                        <FileText className="h-5 w-5 text-blue-400" />
                      )}
                    </div>
                  ))}
                </CollapsedSidebarRail>
              )}
              {!showRightSidebar && (
                <CollapsedSidebarRail
                  side="right"
                  onOpen={handleOpenRightSidebar}
                  actionTooltip="Mở Studio"
                >
                   <StudioRailIcon icon={AudioLines} bgColor="bg-muted" iconColor="text-foreground" onOpen={() => setShowRightSidebar(true)} />
                   <StudioRailIcon icon={Network} bgColor="bg-muted" iconColor="text-foreground" onOpen={() => setShowRightSidebar(true)} />
                </CollapsedSidebarRail>
              )}
              <ErrorBoundary key={notebookId}>
                <ChatArea
                  hasSource={hasSource}
                  notebookId={notebookId}
                  notebook={notebook}
                  onCitationClick={handleCitationClick}
                  selectedCitation={selectedCitation}
                />
              </ErrorBoundary>
            </Panel>

            {showRightSidebar && (
              <>
                <PanelResizeHandle className="relative flex w-2 items-center justify-center bg-border/40 hover:bg-primary/50 transition-colors z-10 cursor-col-resize group">
                  <div className="z-20 flex h-6 w-3 items-center justify-center rounded-sm border border-border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                  </div>
                </PanelResizeHandle>
                <Panel
                  id="studio-panel"
                  order={3}
                  collapsible
                  defaultSize={30}
                  minSize={25}
                  maxSize={50}
                  className="relative"
                >
                  <div className="relative h-full overflow-hidden opacity-100">
                    <div
                      aria-hidden={showFlowchart}
                      className={`absolute inset-0 transition-panel ${
                        showFlowchart
                          ? 'translate-x-full opacity-0 pointer-events-none'
                          : 'translate-x-0 opacity-100'
                      }`}
                    >
                      <StudioSidebar
                        notebookId={notebookId}
                        onCitationClick={handleCitationClick}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        isMember={isMember}
                        onOpenFlowchart={handleFlowchartToggle}
                        hasSource={hasSource}
                      />
                    </div>

                    <div
                      aria-hidden={!showFlowchart}
                      className={`absolute inset-0 transition-panel ${
                        showFlowchart
                          ? 'translate-x-0 opacity-100'
                          : 'translate-x-full opacity-0 pointer-events-none'
                      }`}
                    >
                      {hasLoadedFlowchart ? (
                        <Suspense fallback={<FlowchartSkeleton />}>
                          <FlowchartPanel
                            key={`flowchart-panel-${activeFlowchartSourceId ?? 'empty'}`}
                            flowchartData={activeFlowchartData}
                            sourceName={activeFlowchartSource?.title}
                            onSave={handleFlowchartSave}
                            onClose={handleFlowchartClose}
                            onOpenSources={handleFlowchartOpenSources}
                            onDirtyStateChange={setIsFlowchartDirty}
                          />
                        </Suspense>
                      ) : null}
                    </div>
                  </div>
                  <SidebarDockButton
                    side="right"
                    action="close"
                    onClick={handleCloseRightSidebar}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </main>
      ) : (
        <main id="main-content" className="h-full flex-1 overflow-hidden">
          <ErrorBoundary key={notebookId}>
            <Suspense fallback={<MobileTabsSkeleton />}>
              <LazyMobileNotebookTabs
                hasSource={hasSource}
                notebookId={notebookId}
                notebook={notebook}
                selectedCitation={selectedCitation}
                onCitationClose={handleCitationClose}
                setSelectedCitation={setSelectedCitation}
                onCitationClick={handleCitationClick}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                canEdit={canEdit}
                canDelete={canDelete}
                isMember={isMember}
              />
            </Suspense>
          </ErrorBoundary>
        </main>
      )}

      <RegenerateFlowchartDialog
        open={!!pendingRegenerateSourceId}
        onOpenChange={handleRegenerateOpenChange}
        onConfirm={handleRegenerateConfirm}
        sourceName={sources?.find(s => s.id === pendingRegenerateSourceId)?.title ?? ''}
      />

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onOpenChange={setShowUnsavedDialog}
        onDiscard={handleUnsavedDiscard}
      />
    </div>
  );
};

export default Notebook;
