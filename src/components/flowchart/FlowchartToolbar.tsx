import { memo } from 'react';
import { FileImage, FileText, Loader2, Save, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FlowchartToolbarProps {
  isDirty: boolean;
  isSaving: boolean;
  saveDisabledReason?: string;
  onSave: () => void;
  onExportPng: () => void;
  isExporting: boolean;
  exportDisabledReason?: string;
}

export const FlowchartToolbar = memo(function FlowchartToolbar({
  isDirty,
  isSaving,
  saveDisabledReason,
  onSave,
  onExportPng,
  isExporting,
  exportDisabledReason,
}: FlowchartToolbarProps) {
  const isSaveDisabled = !isDirty || isSaving || Boolean(saveDisabledReason);
  const isExportItemDisabled = isExporting || Boolean(exportDisabledReason);

  const saveButton = (
    <Button type="button" onClick={onSave} disabled={isSaveDisabled} className="min-w-[124px]">
      <Save className="h-4 w-4" />
      {isSaving ? 'Đang lưu...' : 'Lưu'}
    </Button>
  );

  const exportTriggerButton = (
    <Button
      type="button"
      variant="outline"
      onClick={onExportPng}
      disabled={isExportItemDisabled}
      aria-label="Xuất sơ đồ (PNG)"
      className="export-btn-ripple min-w-[124px]"
    >
      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
      {isExporting ? 'Đang xuất...' : 'Xuất PNG'}
    </Button>
  );

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Bản nháp được giữ trong phiên làm việc hiện tại để bạn thử nghiệm an toàn.
      </p>

      <div className="flex items-center gap-2">
        {saveDisabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{saveButton}</span>
              </TooltipTrigger>
              <TooltipContent>{saveDisabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          saveButton
        )}

        {exportDisabledReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{exportTriggerButton}</span>
              </TooltipTrigger>
              <TooltipContent>{exportDisabledReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          exportTriggerButton
        )}
      </div>
    </div>
  );
});
