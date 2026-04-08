import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlowchartPanel } from '@/components/flowchart/FlowchartPanel';
import { mockFlowchartData } from '@/components/flowchart/__mocks__/mockFlowchartData';

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/components/flowchart/FlowchartEditor', () => ({
  FlowchartEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Trình chỉnh sửa mã Mermaid"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/flowchart/FlowchartPreview', () => ({
  FlowchartPreview: ({ mermaidCode }: { mermaidCode: string }) => (
    <div data-testid="mock-preview">{mermaidCode}</div>
  ),
}));

describe('FlowchartPanel', () => {
  it('renders the empty state when no flowchart is selected', () => {
    render(<FlowchartPanel flowchartData={null} onClose={vi.fn()} />);

    expect(screen.getByText('Chưa có sơ đồ')).toBeInTheDocument();
    expect(screen.getByLabelText('Đóng bảng sơ đồ')).toBeInTheDocument();
  });

  it('enables saving after inline edits and passes the updated draft', async () => {
    const handleSave = vi.fn();

    render(
      <FlowchartPanel
        flowchartData={mockFlowchartData}
        onClose={vi.fn()}
        onSave={handleSave}
        sourceName="Quy trình nội bộ"
      />
    );

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue(mockFlowchartData.title), {
      target: { value: 'Quy trình kiểm duyệt mới' },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(handleSave).toHaveBeenCalledWith({
      mermaid_code: mockFlowchartData.mermaid_code,
      title: 'Quy trình kiểm duyệt mới',
      summary: mockFlowchartData.summary,
    });
  });

  it('keeps save disabled when the Mermaid code is potentially unsafe', () => {
    render(<FlowchartPanel flowchartData={mockFlowchartData} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Trình chỉnh sửa mã Mermaid'), {
      target: { value: 'flowchart TD\nA[<script>alert(1)</script>] --> B' },
    });

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });
});
