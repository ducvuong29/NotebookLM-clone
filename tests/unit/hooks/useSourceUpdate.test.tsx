import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- TanStack React Query mock ---
const mockInvalidateQueries = vi.fn();
let capturedMutationOptions: Record<string, unknown> | null = null;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
  useMutation: vi.fn((options: Record<string, unknown>) => {
    capturedMutationOptions = options;
    return {
      mutate: vi.fn(),
      isPending: false,
    };
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'source-1', title: 'Updated' }, error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

import { useSourceUpdate } from '@/hooks/useSourceUpdate';

describe('useSourceUpdate — Scoped Invalidation (AC #3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMutationOptions = null;
  });

  it('should accept notebookId parameter without error', () => {
    expect(() => useSourceUpdate('notebook-123')).not.toThrow();
  });

  it('should accept no parameter (backwards compatibility)', () => {
    expect(() => useSourceUpdate()).not.toThrow();
  });

  it('should use scoped invalidation key with notebookId', () => {
    useSourceUpdate('notebook-abc');

    // Manually invoke the onSuccess callback captured from useMutation
    expect(capturedMutationOptions).not.toBeNull();
    const onSuccess = capturedMutationOptions!.onSuccess as () => void;
    expect(onSuccess).toBeDefined();

    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sources', 'notebook-abc'],
    });
  });

  it('should NOT use global unscoped sources key', () => {
    useSourceUpdate('notebook-xyz');

    const onSuccess = capturedMutationOptions!.onSuccess as () => void;
    onSuccess();

    // Should NOT use the global unscoped key
    expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['sources'],
    });
  });

  it('should pass undefined notebookId when no parameter given', () => {
    useSourceUpdate();

    const onSuccess = capturedMutationOptions!.onSuccess as () => void;
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sources', undefined],
    });
  });
});
