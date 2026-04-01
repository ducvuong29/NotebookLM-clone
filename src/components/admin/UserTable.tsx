import React, { useState, useCallback } from 'react';
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useAdminUsers,
  useDeleteUser,
  type AdminUser,
} from '@/hooks/useAdminUsers';
import { useDebounce } from '@/hooks/useDebounce';
import CreateUserDialog from './CreateUserDialog';
import BulkImportDialog from './BulkImportDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

// ============================================================================
// Constants
// ============================================================================

const PAGE_SIZE = 25;

// ============================================================================
// Skeleton rows
// ============================================================================

const SKELETON_WIDTHS = [
  ['w-8', 'w-28'],   // avatar + name
  ['w-36'],          // email
  ['w-16'],          // role
  ['w-20'],          // date
  ['w-10'],          // action
] as const;

const SkeletonRow: React.FC<{ index: number }> = React.memo(({ index }) => (
  <tr
    className="border-b border-border/20"
    style={{ animationDelay: `${index * 80}ms` }}
  >
    {/* Name + Avatar */}
    <td className="px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-muted/50 animate-skeleton-pulse flex-shrink-0" />
        <div className={`h-4 bg-muted/50 rounded-md animate-skeleton-pulse ${SKELETON_WIDTHS[0][1]}`} />
      </div>
    </td>
    {/* Email */}
    <td className="px-5 py-4">
      <div className={`h-4 bg-muted/50 rounded-md animate-skeleton-pulse ${SKELETON_WIDTHS[1][0]}`} />
    </td>
    {/* Role */}
    <td className="px-5 py-4">
      <div className={`h-5 bg-muted/50 rounded-full animate-skeleton-pulse ${SKELETON_WIDTHS[2][0]}`} />
    </td>
    {/* Date */}
    <td className="px-5 py-4">
      <div className={`h-4 bg-muted/50 rounded-md animate-skeleton-pulse ${SKELETON_WIDTHS[3][0]}`} />
    </td>
    {/* Action */}
    <td className="px-5 py-4">
      <div className={`h-8 bg-muted/50 rounded-md animate-skeleton-pulse ${SKELETON_WIDTHS[4][0]}`} />
    </td>
  </tr>
));

SkeletonRow.displayName = 'SkeletonRow';

// ============================================================================
// Delete User Confirmation Dialog (2-step)
// ============================================================================

const DeleteUserDialog: React.FC<{
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: string) => void;
  isDeleting: boolean;
}> = React.memo(({ user, open, onOpenChange, onConfirm, isDeleting }) => {
  const [confirmText, setConfirmText] = useState('');

  const expectedText = user?.email ?? '';
  const isConfirmed = confirmText === expectedText;

  // Reset confirm text when dialog opens/closes
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) setConfirmText('');
    onOpenChange(newOpen);
  }, [onOpenChange]);

  const handleConfirm = useCallback(() => {
    if (user && isConfirmed) {
      onConfirm(user.id);
    }
  }, [user, isConfirmed, onConfirm]);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Xóa tài khoản vĩnh viễn
          </DialogTitle>
          <DialogDescription className="text-left space-y-3 pt-2">
            <p>
              Bạn đang xóa tài khoản của{' '}
              <span className="font-semibold text-foreground">
                {user.full_name ?? user.email}
              </span>
              . Hành động này <strong className="text-destructive">không thể hoàn tác</strong>.
            </p>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium text-destructive">Dữ liệu sẽ bị xóa vĩnh viễn:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Tài khoản đăng nhập</li>
                <li>Tất cả notebooks do người dùng tạo</li>
                <li>Tất cả sources, notes, documents liên quan</li>
                <li>Lịch sử chat và files đã tải lên</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-delete" className="text-sm">
            Nhập <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{expectedText}</span> để xác nhận:
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Nhập email để xác nhận..."
            disabled={isDeleting}
            className="bg-background/50"
            autoComplete="off"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Hủy
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang xóa...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa vĩnh viễn
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

DeleteUserDialog.displayName = 'DeleteUserDialog';

// ============================================================================
// User Row (memoized to avoid re-render on unrelated state changes)
// ============================================================================

const UserRow: React.FC<{
  user: AdminUser;
  onDelete: (user: AdminUser) => void;
  isDeleting: boolean;
}> = React.memo(({ user, onDelete, isDeleting }) => {
  const initial = (user.full_name ?? user.email)?.[0]?.toUpperCase() ?? '?';
  const isAdmin = user.role === 'admin';

  const handleDelete = useCallback(() => {
    onDelete(user);
  }, [user, onDelete]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <tr className="group border-b border-border/20 hover:bg-muted/25 transition-colors duration-150">
      {/* Name + Avatar */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div
            className={`
              w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0
              text-xs font-bold uppercase tracking-wide
              bg-primary/10 text-primary
              transition-colors duration-200
            `}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate max-w-[200px] text-foreground">
              {user.full_name ?? '—'}
            </p>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-primary/80">
                <ShieldAlert className="h-3 w-3" />
                Admin
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-5 py-3.5 text-sm text-muted-foreground">
        <span className="truncate block max-w-[240px]">{user.email}</span>
      </td>

      {/* Role badge */}
      <td className="px-5 py-3.5">
        <span className={`
          inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide
          ${isAdmin
            ? 'bg-primary/10 text-primary border border-primary/20'
            : 'bg-muted text-muted-foreground border border-border/30'
          }
        `}>
          {isAdmin ? 'Admin' : 'User'}
        </span>
      </td>

      {/* Last sign in */}
      <td className="px-5 py-3.5 text-sm text-muted-foreground">
        {formatDate(user.last_sign_in_at)}
      </td>

      {/* Delete action */}
      <td className="px-5 py-3.5">
        {!isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10
                       opacity-0 group-hover:opacity-100 transition-all duration-200"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Xóa tài khoản"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </td>
    </tr>
  );
});

UserRow.displayName = 'UserRow';

// ============================================================================
// Empty State
// ============================================================================

const EmptyState: React.FC<{ hasSearch: boolean }> = React.memo(({ hasSearch }) => (
  <tr>
    <td colSpan={5} className="px-5 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/30">
          <Users className="h-9 w-9 text-muted-foreground/35" />
        </div>
        {hasSearch ? (
          <>
            <p className="text-sm text-muted-foreground">
              Không tìm thấy người dùng nào phù hợp.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Thử tìm kiếm với từ khóa khác
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Chưa có nhân viên nào. Tạo tài khoản mới.
            </p>
            <div className="flex items-center gap-3 mt-1">
              <CreateUserDialog />
              <BulkImportDialog />
            </div>
          </>
        )}
      </div>
    </td>
  </tr>
));

EmptyState.displayName = 'EmptyState';

// ============================================================================
// Error State
// ============================================================================

const ErrorState: React.FC = React.memo(() => (
  <tr>
    <td colSpan={5} className="px-5 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="p-3 rounded-xl bg-destructive/10">
          <Users className="h-7 w-7 text-destructive/60" />
        </div>
        <p className="text-sm text-destructive font-medium">
          Không thể tải danh sách người dùng
        </p>
        <p className="text-xs text-muted-foreground">
          Vui lòng thử lại sau
        </p>
      </div>
    </td>
  </tr>
));

ErrorState.displayName = 'ErrorState';

// ============================================================================
// UserTable — Main component
// ============================================================================

const UserTable: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Reset to page 1 when search changes
  const effectiveSearch = debouncedSearch;
  const effectivePage = debouncedSearch !== searchInput ? 1 : page;

  const { data, isLoading, isFetching, error } = useAdminUsers({
    page: effectivePage,
    pageSize: PAGE_SIZE,
    searchQuery: effectiveSearch,
  });

  const deleteMutation = useDeleteUser();

  const handleDeleteClick = useCallback((user: AdminUser) => {
    setDeleteTarget(user);
    setIsDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback((userId: string) => {
    deleteMutation.mutate(
      { user_id: userId },
      {
        onSuccess: () => {
          setIsDialogOpen(false);
          setDeleteTarget(null);
        },
      }
    );
  }, [deleteMutation]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchInput(e.target.value);
      setPage(1); // Reset page on new search
    },
    []
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;
  const users = data?.users ?? [];
  const hasSearch = debouncedSearch.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Search bar + actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
          <Input
            type="search"
            placeholder="Tìm kiếm theo tên hoặc email..."
            value={searchInput}
            onChange={handleSearchChange}
            className="pl-10 h-10 bg-background/60 border-border/50 text-sm
                       placeholder:text-muted-foreground/40
                       focus-visible:ring-primary/30 focus-visible:border-primary/40
                       transition-all duration-200"
            aria-label="Tìm kiếm người dùng"
          />
          {/* Subtle loading indicator on search */}
          {isFetching && debouncedSearch && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <BulkImportDialog />
          <CreateUserDialog />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden shadow-sm
                      ring-1 ring-border/10">
        <div className="overflow-x-auto">
          <table className="w-full" role="table">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th
                  className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5"
                  scope="col"
                >
                  Tên
                </th>
                <th
                  className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5"
                  scope="col"
                >
                  Email
                </th>
                <th
                  className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5"
                  scope="col"
                >
                  Vai trò
                </th>
                <th
                  className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5"
                  scope="col"
                >
                  Lần đăng nhập cuối
                </th>
                <th
                  className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3.5 w-16"
                  scope="col"
                >
                  {/* Action column */}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                // 5 skeleton rows with staggered animation
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={`skeleton-${i}`} index={i} />
                ))
              ) : error ? (
                <ErrorState />
              ) : users.length > 0 ? (
                users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onDelete={handleDeleteClick}
                    isDeleting={deleteMutation.isPending}
                  />
                ))
              ) : (
                <EmptyState hasSearch={hasSearch} />
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!isLoading && !error && users.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 bg-muted/10">
            <p className="text-xs text-muted-foreground">
              {data ? (
                <>
                  Hiển thị{' '}
                  <span className="font-medium text-foreground">
                    {Math.min(data.totalCount, PAGE_SIZE)}
                  </span>{' '}
                  / {data.totalCount} người dùng
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="h-8 px-3 text-xs gap-1.5"
                aria-label="Trang trước"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Trước
              </Button>
              <span className="text-xs text-muted-foreground font-medium px-2 min-w-[80px] text-center">
                Trang {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="h-8 px-3 text-xs gap-1.5"
                aria-label="Trang sau"
              >
                Sau
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteUserDialog
        user={deleteTarget}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
};

export default UserTable;
