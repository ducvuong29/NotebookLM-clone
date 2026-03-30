import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNotebookPermissions } from '@/hooks/useNotebookPermissions';
import { useAuth } from '@/contexts/AuthContext';
import { useNotebookMembers } from '@/hooks/useCollaborationApi';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useCollaborationApi', () => ({
  useNotebookMembers: vi.fn(),
}));

describe('useNotebookPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants owner permissions if user is the notebook creator', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'user-1', user_metadata: { role: 'user' } }
    });
    (useNotebookMembers as any).mockReturnValue({
      data: [],
      isLoading: false
    });

    const { result } = renderHook(() => useNotebookPermissions('notebook-1', 'user-1'));

    expect(result.current.role).toBe('owner');
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canInvite).toBe(true);
    expect(result.current.canView).toBe(true);
    expect(result.current.isOwner).toBe(true);
  });

  it('grants admin permissions if user is a system admin', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'admin-1', user_metadata: { role: 'admin' } }
    });
    (useNotebookMembers as any).mockReturnValue({
      data: [],
      isLoading: false
    });

    const { result } = renderHook(() => useNotebookPermissions('notebook-1', 'user-99'));

    expect(result.current.role).toBe('admin');
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(true);
    expect(result.current.canInvite).toBe(true);
    expect(result.current.isOwner).toBe(false);
  });

  it('grants editor permissions if user is an accepted member with editor role', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'user-2' }
    });
    (useNotebookMembers as any).mockReturnValue({
      data: [
        { user_id: 'user-2', status: 'accepted', role: 'editor' }
      ],
      isLoading: false
    });

    const { result } = renderHook(() => useNotebookPermissions('notebook-1', 'user-1'));

    expect(result.current.role).toBe('editor');
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canDelete).toBe(false); // Only owner/admin can delete
    expect(result.current.canInvite).toBe(false); // Only owner/admin can invite
    expect(result.current.isOwner).toBe(false);
    expect(result.current.isMember).toBe(true);
  });

  it('grants viewer permissions if user is an accepted member with viewer role', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'user-3' }
    });
    (useNotebookMembers as any).mockReturnValue({
      data: [
        { user_id: 'user-3', status: 'accepted', role: 'viewer' }
      ],
      isLoading: false
    });

    const { result } = renderHook(() => useNotebookPermissions('notebook-1', 'user-1'));

    expect(result.current.role).toBe('viewer');
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canInvite).toBe(false);
    expect(result.current.canView).toBe(true);
    expect(result.current.isMember).toBe(true);
  });

  it('returns null role and no permissions for uninvited/non-member users', () => {
    (useAuth as any).mockReturnValue({
      user: { id: 'user-4' }
    });
    // Pending member or not in member list
    (useNotebookMembers as any).mockReturnValue({
      data: [
        { user_id: 'user-4', status: 'pending', role: 'viewer' }
      ],
      isLoading: false
    });

    const { result } = renderHook(() => useNotebookPermissions('notebook-1', 'user-1'));

    expect(result.current.role).toBeNull();
    expect(result.current.canEdit).toBe(false);
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canInvite).toBe(false);
    expect(result.current.canView).toBe(false);
    expect(result.current.isMember).toBe(false);
  });
});
