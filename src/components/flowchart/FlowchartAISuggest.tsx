import { memo, useState } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useFlowchartAI } from '@/hooks/useFlowchartAI';

interface FlowchartAISuggestProps {
  currentMermaidCode: string;
  sourceId?: string;
  notebookId?: string;
  onApplyAIChange: (newMermaidCode: string) => void;
}

export const FlowchartAISuggest = memo(function FlowchartAISuggest({
  currentMermaidCode,
  sourceId,
  notebookId,
  onApplyAIChange,
}: FlowchartAISuggestProps) {
  const [instruction, setInstruction] = useState('');
  const { mutateAsync: editFlowchart, isPending } = useFlowchartAI();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedInstruction = instruction.trim();

    if (!trimmedInstruction || !currentMermaidCode.trim() || isPending) {
      return;
    }

    try {
      const newMermaidCode = await editFlowchart({
        instruction: trimmedInstruction,
        current_mermaid_code: currentMermaidCode,
        source_id: sourceId,
        notebook_id: notebookId,
      });

      if (newMermaidCode) {
        onApplyAIChange(newMermaidCode);
        setInstruction('');
      }
    } catch {
      // Error is handled by the hook's Toast
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-card/60 p-3 backdrop-blur-md">
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all duration-300"
      >
        <div className="flex shrink-0 items-center pl-3 text-primary/80">
          <Sparkles className="h-4 w-4" />
        </div>
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Yêu cầu AI chỉnh sửa sơ đồ... (vd: Đổi màu node A thành đỏ)"
          disabled={isPending || !currentMermaidCode.trim()}
          className="min-h-[44px] w-full resize-none border-0 bg-transparent px-3 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
          rows={1}
        />
        <div className="flex shrink-0 items-center pr-2">
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={!instruction.trim() || isPending || !currentMermaidCode.trim()}
            className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
});
