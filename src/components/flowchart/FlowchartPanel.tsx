import { memo, useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { FlowchartEditor } from './FlowchartEditor';
import { FlowchartEmptyState } from './FlowchartEmptyState';
import { FlowchartFullscreenModal } from './FlowchartFullscreenModal';
import { FlowchartHeader } from './FlowchartHeader';
import { FlowchartPreview } from './FlowchartPreview';
import { FlowchartToolbar } from './FlowchartToolbar';
import { FlowchartAISuggest } from './FlowchartAISuggest';
import { useDebounce } from '@/hooks/useDebounce';
import { useFlowchartExport } from '@/hooks/useFlowchartExport';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type FlowchartRow = Database['public']['Tables']['flowcharts']['Row'];

interface FlowchartPanelProps {
  flowchartData: FlowchartRow | null;
  onSave?: (data: { mermaid_code: string; title: string; summary: string }) => void | Promise<void>;
  onClose: () => void;
  isGenerating?: boolean;
  sourceName?: string;
  onOpenSources?: () => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
}

function isSupportedMermaidCode(mermaidCode: string) {
  const trimmedCode = mermaidCode.trim();
  return /^\s*(flowchart|graph)\b/i.test(trimmedCode) && !/(< [^>]+>|script\b)/i.test(trimmedCode);
}

export const FlowchartPanel = memo(function FlowchartPanel({
  flowchartData,
  onSave,
  onClose,
  isGenerating = false,
  sourceName,
  onOpenSources,
  onDirtyStateChange,
}: FlowchartPanelProps) {
  const { resolvedTheme } = useTheme();
  const { toast } = useToast();
  const [mermaidCode, setMermaidCode] = useState(flowchartData?.mermaid_code ?? '');
  const [title, setTitle] = useState(flowchartData?.title ?? '');
  const [summary, setSummary] = useState(flowchartData?.summary ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditorVisible, setIsEditorVisible] = useState(true);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  const debouncedCode = useDebounce(mermaidCode, 300);

  useEffect(() => {
    setMermaidCode(flowchartData?.mermaid_code ?? '');
    setTitle(flowchartData?.title ?? '');
    setSummary(flowchartData?.summary ?? '');
  }, [flowchartData?.id, flowchartData?.mermaid_code, flowchartData?.summary, flowchartData?.title]);

  const initialTitle = flowchartData?.title ?? '';
  const initialSummary = flowchartData?.summary ?? '';
  const initialMermaidCode = flowchartData?.mermaid_code ?? '';
  const isDirty =
    title !== initialTitle || summary !== initialSummary || mermaidCode !== initialMermaidCode;
  const isCodeEmpty = mermaidCode.trim().length === 0;
  const isCodeSafe = !isCodeEmpty && isSupportedMermaidCode(mermaidCode);

  useEffect(() => {
    onDirtyStateChange?.(isDirty);
  }, [isDirty, onDirtyStateChange]);

  let saveDisabledReason: string | undefined;
  if (!flowchartData) {
    saveDisabledReason = 'Chưa có sơ đồ để lưu';
  } else if (isGenerating) {
    saveDisabledReason = 'Sơ đồ đang được tạo';
  } else if (!isDirty) {
    saveDisabledReason = 'Chưa có thay đổi';
  } else if (isCodeEmpty) {
    saveDisabledReason = 'Chưa có mã Mermaid';
  } else if (!isCodeSafe) {
    saveDisabledReason = 'Mã Mermaid phải bắt đầu bằng flowchart hoặc graph và không chứa HTML';
  }

  // Export logic
  const { exportPng, exportPdf, isExporting } = useFlowchartExport({
    title,
    summary,
    mermaidCode,
  });

  let exportDisabledReason: string | undefined;
  if (!flowchartData) {
    exportDisabledReason = 'Chưa có sơ đồ để xuất';
  } else if (isGenerating) {
    exportDisabledReason = 'Sơ đồ đang được tạo';
  } else if (isCodeEmpty) {
    exportDisabledReason = 'Chưa có mã Mermaid';
  }

  const handleExportPng = useCallback(async () => {
    try {
      await exportPng();
      toast({ title: 'Đã xuất PNG thành công!' });
    } catch {
      toast({
        title: 'Lỗi xuất sơ đồ',
        description: 'Không thể tạo ảnh PNG. Vui lòng thử lại.',
        variant: 'destructive',
      });
    }
  }, [exportPng, toast]);

  const handleExportPdf = useCallback(async () => {
    try {
      await exportPdf();
      toast({ title: 'Đã xuất PDF thành công!' });
    } catch {
      toast({
        title: 'Lỗi xuất sơ đồ',
        description: 'Không thể tạo file PDF. Vui lòng thử lại.',
        variant: 'destructive',
      });
    }
  }, [exportPdf, toast]);

  const handleSave = async () => {
    if (!flowchartData || saveDisabledReason) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave?.({
        mermaid_code: mermaidCode.trim(),
        title: title.trim() || 'Quy trình chưa đặt tên',
        summary: summary.trim(),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!flowchartData) {
    return (
      <div className="flex h-full flex-col overflow-hidden border-l border-border bg-muted/30">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center justify-between gap-3 md:ml-10">
            <div>
              <h2 className="text-base font-semibold text-foreground">Sơ đồ quy trình</h2>
              <p className="text-sm text-muted-foreground">Bản xem trước Mermaid hiển thị tại đây.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Đóng bảng sơ đồ"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <FlowchartEmptyState onOpenSources={onOpenSources} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden border-l border-border bg-muted/30 shadow-sm">
      <FlowchartHeader
        title={title}
        summary={summary}
        sourceName={sourceName}
        onTitleChange={setTitle}
        onSummaryChange={setSummary}
        onTitleCommit={() => setTitle((currentTitle) => currentTitle.trim() || 'Quy trình chưa đặt tên')}
        onSummaryCommit={() => setSummary((currentSummary) => currentSummary.trim())}
        onClose={onClose}
      />

      <div className="flex-1 overflow-hidden p-4">
        {/* Sub-toolbar: editor toggle */}
        <div className="mb-2 flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditorVisible((prev) => !prev)}
            aria-label={isEditorVisible ? 'Ẩn editor Mermaid' : 'Hiện editor Mermaid'}
            title={isEditorVisible ? 'Ẩn editor Mermaid' : 'Hiện editor Mermaid'}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {isEditorVisible ? (
              <><EyeOff className="h-3 w-3" /> Ẩn editor</>
            ) : (
              <><Eye className="h-3 w-3" /> Hiện editor</>
            )}
          </Button>
        </div>

        <div
          className={`grid min-h-0 gap-4 transition-all duration-200 ${
            isEditorVisible ? 'grid-cols-2' : 'grid-cols-1'
          }`}
          style={{ height: 'calc(100% - 36px)' }}
        >
          {isEditorVisible && (
            <div className="min-h-0 min-w-0">
              <FlowchartEditor
                value={mermaidCode}
                theme={resolvedTheme}
                onChange={setMermaidCode}
              />
            </div>
          )}
          <div className="min-h-0 min-w-0">
            <FlowchartPreview
              mermaidCode={debouncedCode}
              isGenerating={isGenerating}
              onFullscreen={() => setIsFullscreenOpen(true)}
            />
          </div>
        </div>
      </div>

      <FlowchartAISuggest
        currentMermaidCode={mermaidCode}
        sourceId={flowchartData.source_id ?? undefined}
        notebookId={flowchartData.notebook_id ?? undefined}
        onApplyAIChange={setMermaidCode}
      />

      <FlowchartToolbar
        isDirty={isDirty}
        isSaving={isSaving}
        saveDisabledReason={saveDisabledReason}
        onSave={handleSave}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        isExporting={isExporting}
        exportDisabledReason={exportDisabledReason}
      />

      <FlowchartFullscreenModal
        mermaidCode={debouncedCode}
        title={title}
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
      />
    </div>
  );
});

export default FlowchartPanel;
