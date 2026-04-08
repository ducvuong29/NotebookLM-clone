import { memo, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import panzoom from 'panzoom';
import { Loader2, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

interface FlowchartFullscreenModalProps {
  mermaidCode: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

function getReducedMotionPreference() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const FlowchartFullscreenModal = memo(function FlowchartFullscreenModal({
  mermaidCode,
  title,
  isOpen,
  onClose,
}: FlowchartFullscreenModalProps) {
  const { resolvedTheme } = useTheme();
  const [renderedSvg, setRenderedSvg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [prefersReducedMotion] = useState(getReducedMotionPreference);
  const renderSequenceRef = useRef(0);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const panzoomRef = useRef<ReturnType<typeof panzoom> | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render mermaid when modal opens or code changes
  useEffect(() => {
    if (!isOpen) return;
    const trimmedCode = mermaidCode.trim();
    if (!trimmedCode) {
      setRenderedSvg('');
      setErrorMessage(null);
      return;
    }

    const renderId = `flowchart-fs-${renderSequenceRef.current++}`;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      fontFamily: 'Inter Variable, sans-serif',
      flowchart: { htmlLabels: false, curve: 'basis', padding: 24, nodeSpacing: 60, rankSpacing: 60 },
    });
    mermaid
      .render(renderId, trimmedCode)
      .then(({ svg }) => {
        setRenderedSvg(svg);
        setErrorMessage(null);
        setRenderTick((c) => c + 1);
      })
      .catch(() => setErrorMessage('Lỗi cú pháp Mermaid – vui lòng kiểm tra mã'));
  }, [mermaidCode, resolvedTheme, isOpen]);

  // Attach panzoom to the rendered SVG
  useEffect(() => {
    const svgHost = svgContainerRef.current;
    if (!svgHost) return;
    const svgEl = svgHost.querySelector('svg') as unknown as HTMLElement | null;
    if (!svgEl) return;

    const instance = panzoom(svgEl, {
      maxZoom: 5,
      minZoom: 0.3,
      smoothScroll: !prefersReducedMotion,
    });
    panzoomRef.current = instance;

    return () => {
      instance.dispose();
      panzoomRef.current = null;
    };
  }, [prefersReducedMotion, renderTick]);

  const handleZoomIn = () => panzoomRef.current?.smoothZoom(0, 0, 1.3);
  const handleZoomOut = () => panzoomRef.current?.smoothZoom(0, 0, 0.77);
  const handleReset = () => {
    panzoomRef.current?.moveTo(0, 0);
    panzoomRef.current?.zoomAbs(0, 0, 1);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem toàn màn hình sơ đồ"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm p-4 md:p-8 transition-all"
    >
      {/* Modal content */}
      <div className="flex h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] w-[calc(100vw-2rem)] md:w-[calc(100vw-4rem)] max-w-7xl flex-col overflow-hidden bg-card rounded-xl border border-border shadow-2xl ring-1 ring-border/50">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">
              {title ?? 'Xem sơ đồ toàn màn hình'}
            </h2>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              aria-label="Thu nhỏ"
              title="Thu nhỏ"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleReset}
              aria-label="Đặt lại kích thước"
              title="Đặt lại kích thước"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              aria-label="Phóng to"
              title="Phóng to"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="mx-1.5 h-4 w-px bg-border" />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Đóng xem toàn màn hình"
              title="Đóng (Esc)"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hint */}
        <div className="shrink-0 border-b border-border/50 bg-muted/30 px-5 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            Kéo để di chuyển · Cuộn để phóng to/thu nhỏ · Nhấn Esc để đóng
          </p>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="shrink-0 border-b border-border bg-destructive/10 px-5 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Canvas */}
        <div className="flex min-h-0 flex-1 items-stretch justify-stretch overflow-hidden">
          {!mermaidCode.trim() ? (
            <div className="flex flex-1 items-center justify-center bg-background/50 text-sm text-muted-foreground">
              Chưa có mã Mermaid để hiển thị.
            </div>
          ) : !renderedSvg && !errorMessage ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm">Đang tạo sơ đồ...</p>
            </div>
          ) : renderedSvg ? (
            <div
              ref={svgContainerRef}
              data-testid="flowchart-fullscreen-canvas"
              className="h-full w-full overflow-hidden bg-background"
              dangerouslySetInnerHTML={{ __html: renderedSvg }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});
