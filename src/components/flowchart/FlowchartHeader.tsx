import { memo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface FlowchartHeaderProps {
  title: string;
  summary: string;
  sourceName?: string;
  onTitleChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  onTitleCommit: () => void;
  onSummaryCommit: () => void;
  onClose: () => void;
}

export const FlowchartHeader = memo(function FlowchartHeader({
  title,
  summary,
  sourceName,
  onTitleChange,
  onSummaryChange,
  onTitleCommit,
  onSummaryCommit,
  onClose,
}: FlowchartHeaderProps) {
  return (
    <div className="border-b border-border px-4 py-4">
      <div className="flex items-start gap-3 md:ml-10">
        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            onBlur={onTitleCommit}
            placeholder="Tên quy trình..."
            className="h-auto border-transparent bg-transparent px-0 text-[22px] font-semibold leading-tight shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0"
          />

          <Textarea
            value={summary}
            onChange={(event) => onSummaryChange(event.target.value)}
            onBlur={onSummaryCommit}
            placeholder="Tóm tắt nội dung..."
            className="min-h-[76px] resize-none border-transparent bg-transparent px-0 text-[13px] leading-6 text-muted-foreground shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0"
          />

          {sourceName ? (
            <div className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              Tài liệu: {sourceName}
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Đóng bảng sơ đồ"
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
