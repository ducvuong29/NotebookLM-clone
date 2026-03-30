import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInviteMember } from '@/hooks/useCollaborationApi';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface InvitationDialogProps {
  notebookId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvitationDialog({ notebookId, isOpen, onOpenChange }: InvitationDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  const { mutate: inviteMember, isPending } = useInviteMember();

  const resetForm = () => {
    setEmail('');
    setRole('viewer');
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.error('Vui lòng nhập email hợp lệ');
      return;
    }

    inviteMember(
      { notebook_id: notebookId, email: email.trim(), role },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mời thành viên</DialogTitle>
          <DialogDescription>
            Nhập email để mời tham gia notebook
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-2">
            <Input
              id="email"
              type="email"
              placeholder="ten@vi-du.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="role-select" className="text-sm font-medium text-foreground">
              Vai trò
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as 'editor' | 'viewer')} disabled={isPending}>
              <SelectTrigger id="role-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Biên tập viên</SelectItem>
                <SelectItem value="viewer">Người xem</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Hủy
            </Button>
            <Button type="submit" disabled={isPending || !email.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi lời mời'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default InvitationDialog;
