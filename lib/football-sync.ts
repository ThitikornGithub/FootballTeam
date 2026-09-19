export const INITIAL_SYNC_RETRY_MS = 3500;
export const MAX_SYNC_RETRY_MS = 30000;

export function syncRetryDelayMs(attempt: number) {
  return Math.min(
    MAX_SYNC_RETRY_MS,
    INITIAL_SYNC_RETRY_MS * 2 ** Math.max(0, attempt),
  );
}

// Postgres jsonb stores object keys in its own order, so a game read back from
// the database serializes differently from the same game built in the app.
// Compare through this whenever the question is "is this the same data".
export function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([first], [second]) =>
            first < second ? -1 : first > second ? 1 : 0,
          ),
        )
      : item,
  );
}

export function newestPendingState<T>(
  inFlightState: T,
  queuedState: T | null,
  currentState: T | null,
) {
  return queuedState ?? currentState ?? inFlightState;
}
