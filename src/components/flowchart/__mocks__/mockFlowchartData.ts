export interface FlowchartData {
  id: string;
  source_id: string;
  notebook_id: string;
  title: string;
  summary: string;
  mermaid_code: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
}

interface CreateMockFlowchartDataOptions {
  sourceId: string;
  notebookId: string;
  sourceTitle?: string;
}

const baseMermaidCode = `flowchart TD
  start([Bắt đầu]) --> draft[Tạo tài liệu]
  draft --> review{Kiểm tra nội dung}
  review -->|Đạt| tech[Đánh giá kỹ thuật]
  review -->|Chưa đạt| draft
  tech --> approve{Phê duyệt}
  approve -->|Đồng ý| publish[Xuất bản]
  approve -->|Từ chối| draft
  publish --> end([Kết thúc])`;

export const mockFlowchartData: FlowchartData = {
  id: 'mock-flowchart-001',
  source_id: 'mock-source-001',
  notebook_id: 'mock-notebook-001',
  title: 'Quy trình phê duyệt tài liệu',
  summary:
    'Quy trình 5 bước để phê duyệt tài liệu nội bộ, bao gồm kiểm tra nội dung, đánh giá kỹ thuật và phê duyệt cuối cùng.',
  mermaid_code: baseMermaidCode,
  status: 'completed',
  created_at: '2026-04-06T09:00:00Z',
  updated_at: '2026-04-06T09:01:00Z',
};

export const mockEmptyFlowchart: FlowchartData | null = null;

export const mockGeneratingFlowchart: FlowchartData = {
  ...mockFlowchartData,
  status: 'processing',
  mermaid_code: '',
};

export function createMockFlowchartData({
  sourceId,
  notebookId,
  sourceTitle,
}: CreateMockFlowchartDataOptions): FlowchartData {
  return {
    ...mockFlowchartData,
    id: `mock-flowchart-${sourceId}`,
    source_id: sourceId,
    notebook_id: notebookId,
    title: sourceTitle ? `Quy trình: ${sourceTitle}` : mockFlowchartData.title,
  };
}
