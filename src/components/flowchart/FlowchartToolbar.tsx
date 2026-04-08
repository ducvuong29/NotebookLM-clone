import { memo } from 'react';
import { FileImage, FileText, Loader2, Save, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onExportPdf: () => void;
  isExporting: boolean;
  exportDisabledReason?: string;
}

export const FlowchartToolbar = memo(function FlowchartToolbar({
  isDirty,
  isSaving,
  saveDisabledReason,
  onSave,
  onExportPng,
  onExportPdf,
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
      disabled={isExporting}
      aria-label="Mở menu xuất sơ đồ"
      className="export-btn-ripple"
    >
      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      {isExporting ? 'Đang xuất...' : 'Xuất'}
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
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
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={isExportItemDisabled}
              onClick={onExportPng}
            >
              <FileImage className="mr-2 h-4 w-4" />
              PNG
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExportItemDisabled}
              onClick={onExportPdf}
            >
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
