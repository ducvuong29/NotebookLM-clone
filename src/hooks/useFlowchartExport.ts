import { useCallback, useState } from 'react';
import mermaid from 'mermaid';

interface UseFlowchartExportOptions {
  title: string;
  summary: string;
  mermaidCode: string;
}

interface UseFlowchartExportReturn {
  exportPng: () => Promise<void>;
  exportPdf: () => Promise<void>;
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

  // Create off-screen container
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;left:-9999px;top:0;width:1200px;padding:40px;background:#ffffff;font-family:"Inter Variable",Inter,sans-serif;';

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
  container.appendChild(svgWrapper);

  // Append to body so html-to-image can capture it
  document.body.appendChild(container);

  return {
    container,
    cleanup: () => container.remove(),
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

  const exportPdf = useCallback(async () => {
    setIsExporting(true);
    let cleanup: (() => void) | undefined;

    try {
      // Generate PNG first using the composite renderer
      const { toPng } = await import('html-to-image');
      const composed = await renderExportComposite({
        title: options.title,
        summary: options.summary,
        mermaidCode: options.mermaidCode,
      });
      cleanup = composed.cleanup;

      const pngDataUrl = await toPng(composed.container, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      cleanup();
      cleanup = undefined;

      // Create PDF
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Page dimensions (A4 landscape: 297 x 210 mm)
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;

      // Title
      doc.setFontSize(18);
      doc.text(options.title, margin, 20);

      // Summary
      let currentY = 28;
      if (options.summary.trim()) {
        doc.setFontSize(11);
        const summaryLines = doc.splitTextToSize(options.summary, contentWidth);
        doc.text(summaryLines, margin, currentY);
        const summaryHeight = summaryLines.length * 5; // ~5mm per line at 11pt
        currentY += summaryHeight + 5;
      }

      // Add PNG image — fit remaining page area maintaining aspect ratio
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load export image'));
        img.src = pngDataUrl;
      });

      const remainingHeight = pageHeight - currentY - margin;
      const imgAspect = img.width / img.height;
      let imgWidth = contentWidth;
      let imgHeight = imgWidth / imgAspect;

      if (imgHeight > remainingHeight) {
        imgHeight = remainingHeight;
        imgWidth = imgHeight * imgAspect;
      }

      doc.addImage(pngDataUrl, 'PNG', margin, currentY, imgWidth, imgHeight);

      const filename = `${sanitizeFilename(options.title)}-flowchart.pdf`;
      doc.save(filename);
    } finally {
      cleanup?.();
      setIsExporting(false);
    }
  }, [options.title, options.summary, options.mermaidCode]);

  return { exportPng, exportPdf, isExporting };
}
