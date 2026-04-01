import { CalendarSource } from "../models/CalendarSource.js";
import { syncCalendarSourceToInterviews } from "../utils/calendarIcsSync.js";

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

function envEnabled() {
  const raw = String(process.env.CALENDAR_AUTO_SYNC_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function readIntervalMs() {
  const raw = Number(process.env.CALENDAR_AUTO_SYNC_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < MIN_INTERVAL_MS) return DEFAULT_INTERVAL_MS;
  return Math.floor(raw);
}

export function startCalendarAutoSync() {
  if (!envEnabled()) {
    console.log("Calendar auto-sync disabled (CALENDAR_AUTO_SYNC_ENABLED=false)");
    return () => {};
  }

  const intervalMs = readIntervalMs();
  let timer = null;
  let running = false;
  let stopped = false;

  const runOnce = async () => {
    if (running || stopped) return;
    running = true;
    const startedAt = Date.now();
    try {
      const sources = await CalendarSource.find().populate("owner", "email name");
      let totalProcessed = 0;
      let failures = 0;
      for (const src of sources) {
        const ownerId = src.owner?._id ? src.owner._id.toString() : src.owner?.toString?.();
        if (!ownerId) continue;
        try {
          const result = await syncCalendarSourceToInterviews(src, ownerId);
          src.lastSyncedAt = new Date();
          src.lastError = result.errors.length ? result.errors.join("; ").slice(0, 2000) : "";
          src.lastEventCount = result.processed;
          await src.save();
          totalProcessed += result.processed || 0;
        } catch (e) {
          failures += 1;
          src.lastError = String(e?.message || e).slice(0, 2000);
          await src.save();
        }
      }
      const elapsed = Date.now() - startedAt;
      console.log(
        `Calendar auto-sync done: sources=${sources.length} processed=${totalProcessed} failures=${failures} elapsedMs=${elapsed}`
      );
    } catch (e) {
      console.error("Calendar auto-sync failed:", e?.message || e);
    } finally {
      running = false;
    }
  };

  timer = setInterval(runOnce, intervalMs);
  timer.unref?.();
  setTimeout(() => {
    runOnce();
  }, 5000).unref?.();

  console.log(`Calendar auto-sync enabled (interval ${intervalMs}ms)`);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
