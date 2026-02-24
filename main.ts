import { startScheduler } from "./src/lib/scheduler.ts";
import { startRotation } from "./src/lib/tab-rotator.ts";
import { formatScheduleLog, getTodaySchedule } from "./src/lib/prayer-times.ts";

console.log("[nurboard] starting...");

// Log today's prayer schedule
try {
  const schedule = await getTodaySchedule();
  console.log(`[nurboard] today: ${formatScheduleLog(schedule)}`);
} catch {
  console.log("[nurboard] could not load prayer schedule");
}

// Start CEC TV power scheduler (prayer-time-based)
startScheduler();

// Start CDP tab rotation (prayer-aware, connects to Chrome when ready)
startRotation();

// Start the Astro HTTP server (auto-starts on import)
await import("./dist/server/entry.mjs");
