export const INITIAL_SYNC_RETRY_MS = 3500;
export const MAX_SYNC_RETRY_MS = 30000;

export function syncRetryDelayMs(attempt: number) {
  return Math.min(
    MAX_SYNC_RETRY_MS,
    INITIAL_SYNC_RETRY_MS * 2 ** Math.max(0, attempt),
  );
}

export function newestPendingState<T>(
  inFlightState: T,
  queuedState: T | null,
  currentState: T | null,
) {
  return queuedState ?? currentState ?? inFlightState;
}
