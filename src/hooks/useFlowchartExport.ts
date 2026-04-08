import { useCallback, useState } from 'react';
import mermaid from 'mermaid';

interface UseFlowchartExportOptions {
  title: string;
  summary: string;
  mermaidCode: string;
}

interface UseFlowchartExportReturn {
  exportPng: () => Promise<void>;
  isExporting: boolean;
}

/**
 * Sanitize a flowchart title into a safe filename.
 * Preserves Vietnamese diacritics (UTF range \u1E00-\u1EFF, \u00C0-\u024F).
 */
function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 60)
      .replace(/-+$/, '') || 'flowchart'
  );
}

/**
 * Trigger a browser download of a data URL.
 */
function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Create an off-screen composite container with title, summary, and
 * re-rendered Mermaid SVG using light theme for export.
 */
async function renderExportComposite(params: {
  title: string;
  summary: string;
  mermaidCode: string;
}): Promise<{ container: HTMLDivElement; cleanup: () => void }> {
  const { title, summary, mermaidCode } = params;

  // Create an invisible wrapper to keep it off-screen without breaking html-to-image
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed; top:0; left:0; width:0; height:0; overflow:hidden; z-index:-9999; pointer-events:none;';

  // Create the actual container to be captured
  const container = document.createElement('div');
  // Add color:#000000 to prevent inheriting white text from dark mode root
  container.style.cssText =
    'width:1200px;padding:40px;background:#ffffff;color:#000000;font-family:"Inter Variable",Inter,sans-serif;';

  // Title
  const titleEl = document.createElement('h1');
  titleEl.textContent = title;
  titleEl.style.cssText =
    'font-size:22px;font-weight:600;color:#1e293b;margin:0 0 12px 0;line-height:1.3;';
  container.appendChild(titleEl);

  // Summary
  if (summary.trim()) {
    const summaryEl = document.createElement('p');
    summaryEl.textContent = summary;
    summaryEl.style.cssText =
      'font-size:14px;color:#475569;line-height:1.6;margin:0 0 24px 0;';
    container.appendChild(summaryEl);
  }

  // Re-render Mermaid SVG with light theme
  const renderId = `export-render-${Date.now()}`;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    fontFamily: 'Inter Variable, sans-serif',
    flowchart: {
      htmlLabels: false,
      curve: 'basis',
      padding: 16,
      nodeSpacing: 50,
      rankSpacing: 50,
    },
  });

  const { svg } = await mermaid.render(renderId, mermaidCode.trim());

  const svgWrapper = document.createElement('div');
  svgWrapper.innerHTML = svg;
  
  // Ensure the SVG itself has a defined dimension within the flex/block context if needed,
  // but Mermaid usually defines max-width. We'll ensure the wrapper handles it.
  svgWrapper.style.cssText = 'width:100%; display:flex; justify-content:flex-start;';
  container.appendChild(svgWrapper);

  // Append to body so html-to-image can capture it
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  // Allow browser time to paint SVG and apply layout before taking the snapshot
  await new Promise((resolve) => setTimeout(resolve, 300)); // Increased delay for safety

  return {
    container,
    cleanup: () => wrapper.remove(),
  };
}

/**
 * Hook encapsulating flowchart PNG and PDF export logic.
 * Both export libraries are dynamically imported on first use.
 */
export function useFlowchartExport(
  options: UseFlowchartExportOptions
): UseFlowchartExportReturn {
  const [isExporting, setIsExporting] = useState(false);

  const exportPng = useCallback(async () => {
    setIsExporting(true);
    let cleanup: (() => void) | undefined;

    try {
      const { toPng } = await import('html-to-image');
      const composed = await renderExportComposite({
        title: options.title,
        summary: options.summary,
        mermaidCode: options.mermaidCode,
      });
      cleanup = composed.cleanup;

      const dataUrl = await toPng(composed.container, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      const filename = `${sanitizeFilename(options.title)}-flowchart.png`;
      triggerDownload(dataUrl, filename);
    } finally {
      cleanup?.();
      setIsExporting(false);
    }
  }, [options.title, options.summary, options.mermaidCode]);

  return { exportPng, isExporting };
}
