const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const BANGKOK_OFFSET = 7 * 60 * MINUTE;

// This is only a display hint. Never close games, rewrite match status or
// exclude an older game from /latest: it may have been prepared in advance.
export function isOlderOpenGame(
  game: {
    createdAt: string;
    closedAt?: string;
    closed?: boolean;
    startTime?: string;
    availableTimeMinutes?: number;
  },
  now = Date.now(),
) {
  if (game.closed || game.closedAt) return false;
  const created = Date.parse(game.createdAt);
  if (!Number.isFinite(created) || !Number.isFinite(now)) return false;
  const createdDay = Math.floor((created + BANGKOK_OFFSET) / DAY);
  if (createdDay >= Math.floor((now + BANGKOK_OFFSET) / DAY)) return false;
  // A 23:00–02:00 session is still tonight's game after midnight. Full game
  // state has its duration; a list summary only gets a factual age badge.
  if (
    game.startTime &&
    /^\d{2}:\d{2}$/.test(game.startTime) &&
    game.availableTimeMinutes
  ) {
    const [hours, minutes] = game.startTime.split(':').map(Number);
    const scheduledEnd =
      createdDay * DAY -
      BANGKOK_OFFSET +
      (hours * 60 + minutes + game.availableTimeMinutes) * MINUTE;
    if (now <= scheduledEnd) return false;
  }
  return true;
}
