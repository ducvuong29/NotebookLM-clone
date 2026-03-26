import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SourceContentViewer from '@/components/chat/SourceContentViewer';
import { Citation } from '@/types/message';

// ── Helpers ──────────────────────────────────────────────────────────
const makeCitation = (overrides: Partial<Citation> = {}): Citation => ({
  citation_id: 1,
  source_id: 'src-1',
  source_title: 'Test Source',
  source_type: 'text',
  chunk_lines_from: 3,
  chunk_lines_to: 5,
  chunk_index: 0,
  excerpt: 'test excerpt',
  ...overrides,
});

const MULTI_LINE_CONTENT = [
  'Line 1 content',
  'Line 2 content',
  'Line 3 highlighted',
  'Line 4 highlighted',
  'Line 5 highlighted',
  'Line 6 content',
  'Line 7 content',
].join('\n');

// Mock scrollIntoView since jsdom does not implement it
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// ── Tests ────────────────────────────────────────────────────────────
describe('SourceContentViewer', () => {
  // ── Empty state ──────────────────────────────────────────────────
  it('shows Vietnamese placeholder when no citation is provided', () => {
    render(<SourceContentViewer citation={null} />);
    expect(screen.getByText('Nhấn vào trích dẫn để xem nội dung nguồn')).toBeInTheDocument();
  });

  it('shows Vietnamese placeholder when no sourceContent is provided', () => {
    render(<SourceContentViewer citation={makeCitation()} />);
    expect(screen.getByText('Nhấn vào trích dẫn để xem nội dung nguồn')).toBeInTheDocument();
  });

  // ── Content rendering ────────────────────────────────────────────
  it('renders all content lines', () => {
    render(
      <SourceContentViewer
        citation={makeCitation()}
        sourceContent={MULTI_LINE_CONTENT}
      />
    );
    expect(screen.getByText('Line 1 content')).toBeInTheDocument();
    expect(screen.getByText('Line 7 content')).toBeInTheDocument();
  });

  // ── Highlight styling ────────────────────────────────────────────
  it('highlights lines within chunk_lines_from..chunk_lines_to', () => {
    render(
      <SourceContentViewer
        citation={makeCitation({ chunk_lines_from: 3, chunk_lines_to: 5 })}
        sourceContent={MULTI_LINE_CONTENT}
      />
    );

    // Highlighted lines should have purple background style
    const line3 = screen.getByText('Line 3 highlighted').closest('div');
    expect(line3).toHaveStyle({ backgroundColor: '#eadef9' });
    expect(line3).toHaveStyle({ borderLeftColor: '#9333ea' });

    // Non-highlighted line should NOT have the purple style
    const line1 = screen.getByText('Line 1 content').closest('div');
    expect(line1).not.toHaveStyle({ backgroundColor: '#eadef9' });
  });

  // ── No highlighting for source-list clicks ───────────────────────
  it('does NOT highlight when citation has no line data (source list click)', () => {
    const mockCitation = makeCitation({
      citation_id: -1,
      chunk_lines_from: undefined,
      chunk_lines_to: undefined,
    });
    render(
      <SourceContentViewer
        citation={mockCitation}
        sourceContent={MULTI_LINE_CONTENT}
        isOpenedFromSourceList={true}
      />
    );

    // No line should have the highlight background
    const line3 = screen.getByText('Line 3 highlighted').closest('div');
    expect(line3).not.toHaveStyle({ backgroundColor: '#eadef9' });
  });

  // ── Source title + icon ──────────────────────────────────────────
  it('displays the source title in the header', () => {
    render(
      <SourceContentViewer
        citation={makeCitation({ source_title: 'My Document' })}
        sourceContent={MULTI_LINE_CONTENT}
      />
    );
    expect(screen.getByText('My Document')).toBeInTheDocument();
  });

  // ── Vietnamese labels ────────────────────────────────────────────
  it('renders Vietnamese "Hướng dẫn nguồn" accordion label', () => {
    render(
      <SourceContentViewer
        citation={makeCitation()}
        sourceContent={MULTI_LINE_CONTENT}
        sourceSummary="This is a summary"
      />
    );
    expect(screen.getByText('Hướng dẫn nguồn')).toBeInTheDocument();
  });

  it('renders Vietnamese "Tóm tắt" heading', () => {
    render(
      <SourceContentViewer
        citation={makeCitation({ citation_id: -1, chunk_lines_from: undefined, chunk_lines_to: undefined })}
        sourceContent={MULTI_LINE_CONTENT}
        sourceSummary="This is a summary"
        isOpenedFromSourceList={true}
      />
    );
    expect(screen.getByText('Tóm tắt')).toBeInTheDocument();
  });

  it('renders Vietnamese "Đường dẫn" for website sources', () => {
    render(
      <SourceContentViewer
        citation={makeCitation({ citation_id: -1, source_type: 'website', chunk_lines_from: undefined, chunk_lines_to: undefined })}
        sourceContent={MULTI_LINE_CONTENT}
        sourceSummary="Summary here"
        sourceUrl="https://example.com"
        isOpenedFromSourceList={true}
      />
    );
    expect(screen.getByText('Đường dẫn')).toBeInTheDocument();
  });

  // ── Accordion behavior ───────────────────────────────────────────
  it('opens Source Guide accordion by default when opened from source list', () => {
    render(
      <SourceContentViewer
        citation={makeCitation({ citation_id: -1, chunk_lines_from: undefined, chunk_lines_to: undefined })}
        sourceContent={MULTI_LINE_CONTENT}
        sourceSummary="Guide content"
        isOpenedFromSourceList={true}
      />
    );
    // Accordion should be open — the summary text should be visible
    expect(screen.getByText('Guide content')).toBeInTheDocument();
  });

  // ── Transition classes ───────────────────────────────────────────
  it('applies transition-colors class to content lines for smooth animation', () => {
    render(
      <SourceContentViewer
        citation={makeCitation()}
        sourceContent="Single line"
      />
    );
    const line = screen.getByText('Single line').closest('div');
    expect(line?.className).toContain('transition-colors');
  });
});
