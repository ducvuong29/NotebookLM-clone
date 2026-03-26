import React, { useCallback, useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { UserPlus, Mail, User as UserIcon, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateUser } from '@/hooks/useAdminUsers';

// ============================================================================
// Validation Schema (Zod)
// ============================================================================

const createUserSchema = z.object({
  email: z
    .string()
    .min(1, 'Vui lòng nhập email')
    .email('Email không hợp lệ'),
  full_name: z
    .string()
    .min(2, 'Tên phải có ít nhất 2 ký tự')
    .max(100, 'Tên quá dài'),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

// ============================================================================
// Component
// ============================================================================

const CreateUserDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const createUser = useCreateUser();

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      full_name: '',
    },
    mode: 'onChange', // Validate as user types for instant feedback
  });

  const onSubmit = useCallback(
    async (data: CreateUserFormData) => {
      try {
        await createUser.mutateAsync(data);
        form.reset();
        setOpen(false);
      } catch {
        // Error already handled by mutation onError (toast)
        // Check if server returned USER_EXISTS code → set inline field error
        const errorMsg = createUser.error?.message ?? '';
        if (errorMsg.includes('đã tồn tại')) {
          form.setError('email', {
            type: 'server',
            message: 'Email đã tồn tại trong hệ thống',
          });
        }
      }
    },
    [createUser, form]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        form.reset();
        form.clearErrors();
      }
    },
    [form]
  );

  const isFormValid = form.formState.isValid;
  const isSubmitting = createUser.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-2 shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.97]"
        >
          <UserPlus className="h-4 w-4" />
          Tạo mới
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[440px] border-border/50 shadow-lg animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <DialogHeader className="space-y-2 pb-2">
          <DialogTitle className="text-xl font-semibold tracking-tight font-heading">
            Tạo tài khoản mới
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            Nhập thông tin nhân viên. Hệ thống sẽ gửi email xác nhận.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5 pt-2"
          >
            {/* Full Name */}
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">
                    Họ và tên
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        placeholder="Nguyễn Văn A"
                        className="pl-10 h-11 bg-secondary/30 border-border/60 transition-colors focus-visible:bg-background"
                        autoComplete="name"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs animate-in fade-in slide-in-from-top-1 duration-150" />
                </FormItem>
              )}
            />

            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Email</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                      <Input
                        type="email"
                        placeholder="nhanvien@company.com"
                        className="pl-10 h-11 bg-secondary/30 border-border/60 transition-colors focus-visible:bg-background"
                        autoComplete="email"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs animate-in fade-in slide-in-from-top-1 duration-150" />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
                className="px-4"
              >
                Hủy
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!isFormValid || isSubmitting}
                className="px-5 gap-2 min-w-[120px] transition-all duration-200 active:scale-[0.97]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Tạo tài khoản
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateUserDialog;
