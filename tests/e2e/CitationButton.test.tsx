import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CitationButton from '@/components/chat/CitationButton';

describe('CitationButton', () => {
  // ── Rendering ────────────────────────────────────────────────────
  it('renders the correct citation number (1-indexed)', () => {
    render(<CitationButton chunkIndex={0} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('1');
  });

  it('renders chunkIndex=4 as display number 5', () => {
    render(<CitationButton chunkIndex={4} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('5');
  });

  // ── Click handler ────────────────────────────────────────────────
  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<CitationButton chunkIndex={0} onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  // ── Accessibility ────────────────────────────────────────────────
  it('has Vietnamese aria-label "Trích dẫn N"', () => {
    render(<CitationButton chunkIndex={2} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Trích dẫn 3');
  });

  // ── Active state styling ─────────────────────────────────────────
  it('applies active styling when isActive is true', () => {
    const { rerender } = render(
      <CitationButton chunkIndex={0} onClick={vi.fn()} isActive={false} />
    );
    const button = screen.getByRole('button');

    // Inactive: should have blue text (not white)
    expect(button.className).toContain('text-blue-600');
    expect(button.className).not.toContain('bg-blue-600');

    // Active: should have filled blue background
    rerender(<CitationButton chunkIndex={0} onClick={vi.fn()} isActive={true} />);
    const activeButton = screen.getByRole('button');
    expect(activeButton.className).toContain('bg-blue-600');
    expect(activeButton.className).toContain('text-white');
  });

  // ── Pulse animation ──────────────────────────────────────────────
  it('applies pulse animation class on render', () => {
    render(<CitationButton chunkIndex={0} onClick={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('animate-');
  });
});
