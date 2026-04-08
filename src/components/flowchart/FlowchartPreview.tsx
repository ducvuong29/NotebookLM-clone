import { memo, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import panzoom from 'panzoom';
import { Loader2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

interface FlowchartPreviewProps {
  mermaidCode: string;
  isGenerating?: boolean;
  onFullscreen?: () => void;
}

const INVALID_SYNTAX_MESSAGE = 'Lỗi cú pháp Mermaid - vui lòng kiểm tra mã';
const UNSAFE_SYNTAX_MESSAGE =
  'Mã Mermaid phải bắt đầu bằng flowchart hoặc graph và không được chứa HTML.';

function hasSupportedSyntax(mermaidCode: string) {
  const trimmedCode = mermaidCode.trim();
  return /^\s*(flowchart|graph)\b/i.test(trimmedCode) && !/(<[^>]+>|script\b)/i.test(trimmedCode);
}

function getReducedMotionPreference() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const FlowchartPreview = memo(function FlowchartPreview({
  mermaidCode,
  isGenerating = false,
  onFullscreen,
}: FlowchartPreviewProps) {
  const { resolvedTheme } = useTheme();
  const [renderedSvg, setRenderedSvg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getReducedMotionPreference);
  const renderSequenceRef = useRef(0);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const trimmedCode = mermaidCode.trim();
    if (!trimmedCode) {
      setErrorMessage(null);
      return;
    }

    if (!hasSupportedSyntax(trimmedCode)) {
      setErrorMessage(UNSAFE_SYNTAX_MESSAGE);
      return;
    }

    const renderId = `flowchart-${renderSequenceRef.current++}`;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      fontFamily: 'Inter Variable, sans-serif',
      flowchart: {
        htmlLabels: false,
        curve: 'basis',
        padding: 16,
        nodeSpacing: 50,
        rankSpacing: 50,
      },
    });

    mermaid
      .render(renderId, trimmedCode)
      .then(({ svg }) => {
        setRenderedSvg(svg);
        setErrorMessage(null);
        setRenderTick((current) => current + 1);
      })
      .catch(() => {
        setErrorMessage(INVALID_SYNTAX_MESSAGE);
      });
  }, [mermaidCode, resolvedTheme]);

  useEffect(() => {
    const svgHost = svgContainerRef.current;
    if (!svgHost) {
      return undefined;
    }

    const svgElement = svgHost.querySelector('svg') as unknown as HTMLElement | null;
    if (!svgElement) {
      return undefined;
    }

    const instance = panzoom(svgElement, {
      maxZoom: 3,
      minZoom: 0.5,
      smoothScroll: !prefersReducedMotion,
    });

    return () => instance.dispose();
  }, [prefersReducedMotion, renderTick]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Xem trước sơ đồ</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Kéo để di chuyển, cuộn để phóng to</span>
            {onFullscreen && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onFullscreen}
                aria-label="Xem toàn màn hình"
                title="Xem toàn màn hình"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="flowchart-canvas flex min-h-0 flex-1 items-stretch justify-stretch overflow-hidden p-4">
        {isGenerating && !mermaidCode.trim() ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-background/70 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Đang dựng sơ đồ từ nội dung tài liệu...</p>
          </div>
        ) : renderedSvg ? (
          <div
            ref={svgContainerRef}
            data-testid="flowchart-preview-canvas"
            className="flowchart-mermaid h-full w-full overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm"
            dangerouslySetInnerHTML={{ __html: renderedSvg }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-background/70 px-6 text-center text-sm text-muted-foreground">
            Dán hoặc chỉnh sửa mã Mermaid để xem sơ đồ SVG tại đây.
          </div>
        )}
      </div>
    </div>
  );
});
