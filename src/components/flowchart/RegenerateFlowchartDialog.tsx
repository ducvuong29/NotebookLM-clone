import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RegenerateFlowchartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  sourceName: string;
}

export const RegenerateFlowchartDialog = React.memo(({
  open,
  onOpenChange,
  onConfirm,
  sourceName
}: RegenerateFlowchartDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tạo lại sơ đồ?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Sơ đồ cho &quot;{sourceName}&quot; đã tồn tại. Tạo lại sẽ thay thế sơ đồ hiện tại. Bạn có muốn tiếp tục?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Tạo lại
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

RegenerateFlowchartDialog.displayName = 'RegenerateFlowchartDialog';
