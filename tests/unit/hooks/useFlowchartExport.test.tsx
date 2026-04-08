import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFlowchartExport } from '@/hooks/useFlowchartExport';

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg><text>mock</text></svg>' }),
  },
}));

// Mock html-to-image (dynamic import — vitest still intercepts)
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'),
}));

// Mock jspdf (dynamic import)
const mockSave = vi.fn();
const mockAddImage = vi.fn();
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSplitTextToSize = vi.fn().mockReturnValue(['line1', 'line2']);

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    setFontSize: mockSetFontSize,
    text: mockText,
    splitTextToSize: mockSplitTextToSize,
    addImage: mockAddImage,
    save: mockSave,
  })),
}));

describe('useFlowchartExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isExporting = false', () => {
    const { result } = renderHook(() =>
      useFlowchartExport({
        title: 'Test Flowchart',
        summary: 'A test summary',
        mermaidCode: 'flowchart TD\n  A-->B',
      })
    );

    expect(result.current.isExporting).toBe(false);
  });

  it('exposes exportPng and exportPdf as functions', () => {
    const { result } = renderHook(() =>
      useFlowchartExport({
        title: 'Test',
        summary: 'Summary',
        mermaidCode: 'flowchart TD\n  A-->B',
      })
    );

    expect(typeof result.current.exportPng).toBe('function');
    expect(typeof result.current.exportPdf).toBe('function');
  });

  it('returns stable function references across renders', () => {
    const { result, rerender } = renderHook(() =>
      useFlowchartExport({
        title: 'Test',
        summary: 'Summary',
        mermaidCode: 'flowchart TD\n  A-->B',
      })
    );

    const firstPng = result.current.exportPng;
    const firstPdf = result.current.exportPdf;

    rerender();

    expect(result.current.exportPng).toBe(firstPng);
    expect(result.current.exportPdf).toBe(firstPdf);
  });
});

describe('sanitizeFilename (tested via exported utility logic)', () => {
  /**
   * The sanitizeFilename function is internal to the hook module.
   * We replicate it here for direct unit testing of the algorithm.
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

  it('handles basic Latin characters', () => {
    expect(sanitizeFilename('Simple Title')).toBe('Simple-Title');
  });

  it('preserves Vietnamese diacritics', () => {
    expect(sanitizeFilename('Quy trình xét duyệt hồ sơ')).toBe(
      'Quy-trình-xét-duyệt-hồ-sơ'
    );
  });

  it('strips special characters (/, @, #, !)', () => {
    const result = sanitizeFilename('Test / File @ Name #1!');
    expect(result).not.toMatch(/[/@#!]/);
  });

  it('replaces whitespace with hyphens', () => {
    expect(sanitizeFilename('hello   world')).toBe('hello-world');
  });

  it('truncates to max 60 characters', () => {
    const longTitle = 'A'.repeat(100);
    const result = sanitizeFilename(longTitle);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it('removes trailing hyphens after truncation', () => {
    // 60 chars ending with spaces → would become trailing hyphens
    const title = 'A'.repeat(58) + '  ';
    const result = sanitizeFilename(title);
    expect(result).not.toMatch(/-+$/);
  });

  it('falls back to "flowchart" for empty title', () => {
    expect(sanitizeFilename('')).toBe('flowchart');
  });

  it('falls back to "flowchart" for all-special-chars title', () => {
    expect(sanitizeFilename('!@#$%^&*()')).toBe('flowchart');
  });

  it('handles mixed Vietnamese + special chars', () => {
    const result = sanitizeFilename('Quy trình xét duyệt hồ sơ / 2026');
    expect(result).toContain('Quy-trình');
    expect(result).not.toContain('/');
  });
});
