import React from 'react';
import { Badge } from '@/components/ui/badge';

interface PermissionBadgeProps {
  role: string | null;
  className?: string;
}

const ROLE_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  owner: { label: 'Chủ sở hữu', variant: 'default' },
  editor: { label: 'Biên tập viên', variant: 'secondary' },
  viewer: { label: 'Người xem', variant: 'outline' },
  admin: { label: 'Quản trị viên', variant: 'destructive' },
};

export const PermissionBadge = ({ role, className }: PermissionBadgeProps) => {
  if (!role) return null;

  const roleConfig = ROLE_LABELS[role];
  if (!roleConfig) return null;

  return (
    <Badge 
      variant={roleConfig.variant} 
      className={`animate-in fade-in-0 duration-200 ${className || ''}`}
      aria-label={`Vai trò của bạn: ${roleConfig.label}`}
    >
      {roleConfig.label}
    </Badge>
  );
};
export default PermissionBadge;
