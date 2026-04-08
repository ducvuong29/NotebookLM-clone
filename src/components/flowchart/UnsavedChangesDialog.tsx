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

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}

export const UnsavedChangesDialog = React.memo(({
  open,
  onOpenChange,
  onDiscard
}: UnsavedChangesDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Thay đổi chưa được lưu</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            Bạn có thay đổi chưa lưu. Nếu rời đi, các thay đổi sẽ bị mất.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Tiếp tục chỉnh sửa</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onDiscard}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Hủy thay đổi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

UnsavedChangesDialog.displayName = 'UnsavedChangesDialog';
