// Real time, independent of game pause/speed. Keep server seats and client
// retry windows in agreement, including mobile background/foreground changes.
export const RECONNECT_GRACE_SECONDS = 5 * 60;
export const CONNECTION_STALE_MS = 15_000;
export const HEARTBEAT_INTERVAL_MS = 2_000;
