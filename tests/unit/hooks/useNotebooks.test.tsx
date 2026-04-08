import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Supabase mock ---
let realtimeCallback: ((payload: unknown) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const mockChannel = {
    on: vi.fn((_event: string, _opts: unknown, cb: (payload: unknown) => void) => {
      // Store callback in a module-level closure
      realtimeCallback = cb;
      return mockChannel;
    }),
    subscribe: vi.fn().mockReturnThis(),
  };

  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: {}, error: null }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        }),
      }),
      channel: vi.fn((_name: string) => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

// --- Auth mock ---
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: { id: 'user-123' },
    isAuthenticated: true,
    loading: false,
  }),
}));

// --- TanStack React Query mock ---
const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
    getQueryData: vi.fn(),
  })),
  useQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
    isError: false,
  })),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

import { supabase } from '@/integrations/supabase/client';
import { useNotebooks } from '@/hooks/useNotebooks';

describe('useNotebooks — Realtime Cache Update & Channel Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    realtimeCallback = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Task 1: Optimistic setQueryData (AC #1, #4, #5)', () => {
    it('should call setQueryData (not invalidateQueries) on INSERT event', () => {
      renderHook(() => useNotebooks());

      expect(realtimeCallback).not.toBeNull();

      // Simulate INSERT event
      act(() => {
        realtimeCallback!({
          eventType: 'INSERT',
          new: { id: 'nb-new', title: 'New Notebook', user_id: 'user-123' },
          old: {},
        });
      });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['notebooks', 'user-123'],
        expect.any(Function)
      );
    });

    it('should deduplicate INSERT events (AC #5)', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'INSERT',
          new: { id: 'nb-dup', title: 'Dup Notebook' },
          old: {},
        });
      });

      // Get the updater function passed to setQueryData
      const updaterFn = mockSetQueryData.mock.calls[0]?.[1];
      expect(updaterFn).toBeInstanceOf(Function);

      // When existing item already in cache, should return unchanged
      const existingData = [{ id: 'nb-dup', title: 'Existing' }];
      const result = updaterFn(existingData);
      expect(result).toBe(existingData); // Same reference = no change
    });

    it('should prepend new item on INSERT when not duplicate', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'INSERT',
          new: { id: 'nb-new', title: 'New' },
          old: {},
        });
      });

      const updaterFn = mockSetQueryData.mock.calls[0]?.[1];
      const existingData = [{ id: 'nb-old', title: 'Old' }];
      const result = updaterFn(existingData);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('nb-new');
      expect(result[1].id).toBe('nb-old');
    });

    it('should merge UPDATE events into existing cache items', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'UPDATE',
          new: { id: 'nb-1', title: 'Updated Title' },
          old: { id: 'nb-1', title: 'Old Title' },
        });
      });

      const updaterFn = mockSetQueryData.mock.calls[0]?.[1];
      const existingData = [
        { id: 'nb-1', title: 'Old Title', description: 'Desc' },
        { id: 'nb-2', title: 'Other' },
      ];
      const result = updaterFn(existingData);

      expect(result[0].title).toBe('Updated Title');
      expect(result[0].description).toBe('Desc'); // Preserved from merge
      expect(result[1].title).toBe('Other'); // Unchanged
    });

    it('should remove DELETE events from cache', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'DELETE',
          new: {},
          old: { id: 'nb-del' },
        });
      });

      const updaterFn = mockSetQueryData.mock.calls[0]?.[1];
      const existingData = [
        { id: 'nb-keep', title: 'Keep' },
        { id: 'nb-del', title: 'Delete Me' },
      ];
      const result = updaterFn(existingData);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('nb-keep');
    });

    it('should fire soft refetch after 2s for computed fields (AC #4)', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'INSERT',
          new: { id: 'nb-soft', title: 'Soft Refetch' },
          old: {},
        });
      });

      // Before 2s, invalidateQueries should NOT have been called
      expect(mockInvalidateQueries).not.toHaveBeenCalled();

      // Advance timer by 2s
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['notebooks', 'user-123'],
      });
    });

    it('should handle empty/undefined old data gracefully', () => {
      renderHook(() => useNotebooks());

      act(() => {
        realtimeCallback!({
          eventType: 'INSERT',
          new: { id: 'nb-first', title: 'First' },
          old: {},
        });
      });

      const updaterFn = mockSetQueryData.mock.calls[0]?.[1];
      // Pass undefined to simulate empty cache
      const result = updaterFn(undefined);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('nb-first');
    });
  });

  describe('Task 2: Scoped channel name (AC #2)', () => {
    it('should create channel with user-scoped name', () => {
      renderHook(() => useNotebooks());

      expect(supabase.channel).toHaveBeenCalledWith('notebooks-changes-user-123');
    });

    it('should NOT use the global unscoped channel name', () => {
      renderHook(() => useNotebooks());

      expect(supabase.channel).not.toHaveBeenCalledWith('notebooks-changes');
    });
  });
});
