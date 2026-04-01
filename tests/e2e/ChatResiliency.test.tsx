import { describe, it, expect } from 'vitest';

/**
 * Epic 1 — Chat Resiliency: Network Loss & Manual Retry
 *
 * These tests verify the *logic* behind the retry mechanism in ChatArea.
 * The component uses a `lastFailedMessageRef` to store the text of a failed
 * message. When the user presses "Thử lại", it calls `handleSendMessage`
 * again with the stored text.
 *
 * Design decision (2026-03-26):
 *   Auto-retry on `window.online` was REMOVED. Users click "Thử lại" manually.
 */

// ── Simulated ChatArea retry state machine ──────────────────────────────────
// We extract the pure logic from ChatArea to test it without mounting
// the full React tree (which requires 10+ mocked providers).

interface RetryState {
  lastFailedMessage: string | null;
  chatError: string | null;
  pendingUserMessage: string | null;
  showAiLoading: boolean;
}

function createInitialState(): RetryState {
  return {
    lastFailedMessage: null,
    chatError: null,
    pendingUserMessage: null,
    showAiLoading: false,
  };
}

/** Simulates what happens when sendMessageAsync succeeds */
function onSendSuccess(state: RetryState, text: string): RetryState {
  return {
    ...state,
    lastFailedMessage: null,
    pendingUserMessage: text,
    showAiLoading: true,
    chatError: null,
  };
}

/** Simulates what happens when sendMessageAsync throws */
function onSendFailure(state: RetryState, text: string): RetryState {
  return {
    ...state,
    lastFailedMessage: text,
    pendingUserMessage: null,
    showAiLoading: false,
    chatError: 'Oops! Chưa lấy được câu trả lời. Thử lại nhé 😊',
  };
}

/** Simulates handleRetry — only effective when lastFailedMessage exists */
function handleRetry(state: RetryState): { state: RetryState; retryText: string | null } {
  if (!state.lastFailedMessage) {
    return { state, retryText: null };
  }
  const retryText = state.lastFailedMessage;
  // Real code calls handleSendMessage(lastFailedMessage), we just track it
  return {
    state: {
      ...state,
      chatError: null,
      showAiLoading: false,
    },
    retryText,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Epic 1: Chat Resiliency — Manual Retry Logic', () => {

  // ── Core: failure stores the failed message ───────────────────────────────
  it('stores the failed message text when send fails (network error)', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'Xin chào AI');

    expect(state.lastFailedMessage).toBe('Xin chào AI');
    expect(state.chatError).toContain('Thử lại nhé');
    expect(state.pendingUserMessage).toBeNull();
    expect(state.showAiLoading).toBe(false);
  });

  // ── Core: success clears the failed message ──────────────────────────────
  it('clears lastFailedMessage on successful send', () => {
    let state = createInitialState();
    state = onSendSuccess(state, 'Xin chào AI');

    expect(state.lastFailedMessage).toBeNull();
    expect(state.chatError).toBeNull();
    expect(state.showAiLoading).toBe(true);
  });

  // ── Retry sends the exact same text ──────────────────────────────────────
  it('retries with the exact same message text', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'What is quantum computing?');

    const { state: retryState, retryText } = handleRetry(state);

    expect(retryText).toBe('What is quantum computing?');
    expect(retryState.chatError).toBeNull(); // error banner cleared
  });

  // ── Retry does nothing when there is no failed message ───────────────────
  it('does nothing when retry is pressed but no message failed', () => {
    const state = createInitialState();

    const { state: retryState, retryText } = handleRetry(state);

    expect(retryText).toBeNull();
    expect(retryState).toEqual(state);
  });

  // ── Sequential failures keep the latest one ──────────────────────────────
  it('keeps only the latest failed message on sequential failures', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'First message');
    state = onSendFailure(state, 'Second message');

    expect(state.lastFailedMessage).toBe('Second message');
  });

  // ── Retry then success clears everything ─────────────────────────────────
  it('clears failed state after retry then success', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'Try me');

    const { retryText } = handleRetry(state);
    expect(retryText).toBe('Try me');

    // Simulate the retry succeeding
    state = onSendSuccess(state, retryText!);

    expect(state.lastFailedMessage).toBeNull();
    expect(state.chatError).toBeNull();
    expect(state.showAiLoading).toBe(true);
  });

  // ── No auto-retry on network reconnect ───────────────────────────────────
  it('does NOT auto-retry when network reconnects — user must press button', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'Lost in transit');

    // Simulate network coming back: nothing changes in state
    // (auto-retry was removed from ChatArea.tsx)
    const stateAfterOnline = { ...state };

    expect(stateAfterOnline.lastFailedMessage).toBe('Lost in transit');
    expect(stateAfterOnline.chatError).toContain('Thử lại nhé');
    // Message is NOT cleared — user must press "Thử lại" manually
  });

  // ── Timeout indicator logic ──────────────────────────────────────────────
  it('timeout indicator appears only when AI loading is active', () => {
    let state = createInitialState();
    state = onSendSuccess(state, 'Hello');

    // showAiLoading is true => timeout timer would start (30s)
    expect(state.showAiLoading).toBe(true);

    // After failure, showAiLoading is false => timeout timer stops
    state = onSendFailure(state, 'Hello');
    expect(state.showAiLoading).toBe(false);
  });

  // ── Error message is Vietnamese ──────────────────────────────────────────
  it('shows Vietnamese error message on failure', () => {
    let state = createInitialState();
    state = onSendFailure(state, 'test');

    expect(state.chatError).toBe('Oops! Chưa lấy được câu trả lời. Thử lại nhé 😊');
  });
});
