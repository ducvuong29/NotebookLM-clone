import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotebookMembers, useUpdateMemberRole, useRemoveMember, NotebookMember } from '@/hooks/useCollaborationApi';
import { useNotebookPermissions } from '@/hooks/useNotebookPermissions';
import { UserPlus, UserX, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvitationDialog } from './InvitationDialog';

interface MemberPanelProps {
  notebookId: string;
  notebookOwnerId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberPanel({ notebookId, notebookOwnerId, isOpen, onOpenChange }: MemberPanelProps) {
  const { data: members, isLoading } = useNotebookMembers(notebookId);
  const { canInvite, isOwner, role: myRole } = useNotebookPermissions(notebookId, notebookOwnerId);
  const { mutate: updateRole, isPending: isUpdating } = useUpdateMemberRole();
  const { mutate: removeMember, isPending: isRemoving } = useRemoveMember();
  
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const handleRoleChange = (memberId: string, newRole: 'editor' | 'viewer') => {
    updateRole({ notebook_id: notebookId, member_id: memberId, role: newRole });
  };

  const handleRemove = (memberId: string) => {
    removeMember({ notebook_id: notebookId, member_id: memberId });
  };

  // Only notebook owner can modify roles/remove
  const canModifyMembers = isOwner;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Quản lý thành viên</DialogTitle>
              {canInvite && (
                <Button size="sm" onClick={() => setIsInviteOpen(true)} className="mr-6">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Mời
                </Button>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="h-[300px] mt-4 pr-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members?.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                Chưa có thành viên nào.
              </div>
            ) : (
              <div className="space-y-4" role="list" aria-label="Danh sách thành viên">
                {members?.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    canModify={canModifyMembers}
                    onRoleChange={(newRole) => handleRoleChange(member.id, newRole)}
                    onRemove={() => handleRemove(member.id)}
                    isBusy={isUpdating || isRemoving}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <InvitationDialog
        notebookId={notebookId}
        isOpen={isInviteOpen}
        onOpenChange={setIsInviteOpen}
      />
    </>
  );
}

interface MemberRowProps {
  member: NotebookMember;
  canModify: boolean;
  onRoleChange: (role: 'editor' | 'viewer') => void;
  onRemove: () => void;
  isBusy: boolean;
}

function MemberRow({ member, canModify, onRoleChange, onRemove, isBusy }: MemberRowProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const displayName = member.full_name || member.email || 'Người dùng ẩn danh';
  const emailStr = member.email || 'Người dùng ẩn danh';
  const initial = emailStr.charAt(0).toUpperCase();
  
  const isOwnerCard = member.role === 'owner';
  
  return (
    <div className="flex items-center justify-between space-x-4" role="listitem">
      <div className="flex items-center space-x-4">
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium leading-none">{displayName}</p>
          <p className="text-xs text-muted-foreground mt-1 cursor-default">
            {member.email && <span className="mr-2">{member.email}</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {isOwnerCard ? (
          <span className="text-sm text-muted-foreground px-3">Chủ sở hữu</span>
        ) : (
          <>
            <Select
              value={member.role}
              onValueChange={onRoleChange as (value: string) => void}
              disabled={!canModify || isBusy}
            >
              <SelectTrigger
                className="w-[130px] h-8 text-xs"
                aria-label={`Thay đổi vai trò của ${displayName}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Biên tập viên</SelectItem>
                <SelectItem value="viewer">Người xem</SelectItem>
              </SelectContent>
            </Select>

            {/* Remove button with AlertDialog confirmation */}
            <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={!canModify || isBusy}
                onClick={() => setShowRemoveConfirm(true)}
                aria-label={`Xoá ${displayName} khỏi notebook`}
              >
                <UserX className="h-4 w-4" />
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xoá {displayName} khỏi notebook?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Thành viên sẽ không thể truy cập notebook và lịch sử chat của họ sẽ bị xoá.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onRemove();
                      setShowRemoveConfirm(false);
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Xoá
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}

export default MemberPanel;
