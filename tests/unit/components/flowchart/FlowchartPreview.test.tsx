import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowchartPreview } from '@/components/flowchart/FlowchartPreview';

const {
  initializeMock,
  renderMock,
  disposeMock,
  panzoomMock,
} = vi.hoisted(() => {
  const dispose = vi.fn();

  return {
    initializeMock: vi.fn(),
    renderMock: vi.fn(),
    disposeMock: dispose,
    panzoomMock: vi.fn(() => ({
      dispose,
    })),
  };
});

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}));

vi.mock('panzoom', () => ({
  default: panzoomMock,
}));

describe('FlowchartPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    initializeMock.mockReset();
    renderMock.mockReset();
    panzoomMock.mockClear();
    disposeMock.mockClear();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? false : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('initializes Mermaid in strict mode and renders SVG after the debounce', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg><g id="start"><rect /></g><g id="end"><rect /></g></svg>',
    });

    render(<FlowchartPreview mermaidCode={'flowchart TD\nstart-->end'} />);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderMock).toHaveBeenCalledWith('flowchart-0', 'flowchart TD\nstart-->end');

    expect(initializeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        theme: 'default',
        flowchart: expect.objectContaining({
          htmlLabels: false,
        }),
      })
    );

    expect(screen.getByTestId('flowchart-preview-canvas').innerHTML).toContain('<svg>');
    expect(panzoomMock).toHaveBeenCalled();
  });

  it('shows an error but keeps the last valid render when a later parse fails', async () => {
    renderMock
      .mockResolvedValueOnce({
        svg: '<svg><text>valid-flowchart</text></svg>',
      })
      .mockRejectedValueOnce(new Error('parse error'));

    const { rerender } = render(<FlowchartPreview mermaidCode={'flowchart TD\nA-->B'} />);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('flowchart-preview-canvas').innerHTML).toContain('valid-flowchart');

    rerender(<FlowchartPreview mermaidCode={'flowchart TD\nA-->'} />);

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Lỗi cú pháp Mermaid - vui lòng kiểm tra mã')).toBeInTheDocument();
    expect(screen.getByTestId('flowchart-preview-canvas').innerHTML).toContain('valid-flowchart');
  });
});
