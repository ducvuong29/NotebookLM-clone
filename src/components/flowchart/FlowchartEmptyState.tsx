import { memo } from 'react';
import { Workflow, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FlowchartEmptyStateProps {
  onOpenSources?: () => void;
}

export const FlowchartEmptyState = memo(function FlowchartEmptyState({ onOpenSources }: FlowchartEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center animate-fade-in">
      <div className="flex justify-center mb-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-background/70 shadow-sm">
          <Workflow className="h-8 w-8 text-muted-foreground/60" />
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Chưa có sơ đồ</h3>
        <p className="max-w-[260px] mx-auto text-[13px] leading-relaxed text-muted-foreground">
          Chọn một tài liệu và nhấn <strong className="font-medium text-foreground">"Tạo sơ đồ"</strong> để bắt đầu.
        </p>
      </div>
      <div className="mt-2">
        <Button 
          variant="outline" 
          onClick={onOpenSources}
          className="gap-2 text-sm font-medium shadow-sm transition-all hover:bg-primary/5 hover:text-primary hover:border-primary/20"
        >
          <MousePointerClick className="w-4 h-4" />
          Chọn tài liệu → Tạo sơ đồ
        </Button>
      </div>
    </div>
  );
});
