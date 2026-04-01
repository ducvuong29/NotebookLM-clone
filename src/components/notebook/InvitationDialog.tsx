import React, { useState, useRef, useEffect } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInviteMember, useSearchUsers, SearchUserResult } from '@/hooks/useCollaborationApi';
import { useDebounce } from '@/hooks/useDebounce';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InvitationDialogProps {
  notebookId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvitationDialog({ notebookId, isOpen, onOpenChange }: InvitationDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('viewer');
  
  // Combobox state
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const debouncedSearchQuery = useDebounce(email, 300);
  const { data: searchResults, isLoading: isSearching } = useSearchUsers(debouncedSearchQuery);
  const { mutate: inviteMember, isPending } = useInviteMember();

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const resetForm = () => {
    setEmail('');
    setRole('viewer');
    setShowDropdown(false);
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

    setShowDropdown(false);
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

  const handleSelectUser = (user: SearchUserResult) => {
    setEmail(user.email);
    setShowDropdown(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Thêm thành viên</DialogTitle>
          <DialogDescription>
            Tìm kiếm hoặc nhập email người dùng để thêm vào notebook
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleInvite} className="space-y-4 overflow-visible">
          <div className="space-y-2 flex flex-col relative" ref={dropdownRef}>
            <label className="text-sm font-medium text-foreground">
              Người dùng
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Nhập email hoặc tên người dùng..."
                value={email}
                className="pl-9"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (email.length > 0) setShowDropdown(true);
                }}
                disabled={isPending}
                autoComplete="off"
              />
            </div>
            
            {showDropdown && email.length > 0 && (
              <div className="absolute top-[68px] left-0 right-0 z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80">
                {isSearching ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" /> 
                    <span className="text-sm text-muted-foreground">Đang tìm...</span>
                  </div>
                ) : searchResults && searchResults.length > 0 ? (
                  <div className="max-h-[200px] overflow-y-auto py-1">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground"
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.avatar_url || ''} />
                          <AvatarFallback>{(user.full_name || user.email).charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-medium truncate">{user.full_name || 'Người dùng'}</span>
                          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {email.includes('@') 
                      ? `Sẽ thêm: ${email}` 
                      : 'Không tìm thấy người dùng'}
                  </div>
                )}
              </div>
            )}
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
                  Đang thêm...
                </>
              ) : (
                'Thêm'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default InvitationDialog;
