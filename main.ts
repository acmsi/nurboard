import { startScheduler } from "./src/lib/scheduler.ts";
import { startRotation } from "./src/lib/tab-rotator.ts";

console.log("[nurboard] starting...");

// Start CEC TV power scheduler
startScheduler();

// Start CDP tab rotation (connects to Chrome when ready)
startRotation();

// Start the Astro HTTP server (auto-starts on import)
await import("./dist/server/entry.mjs");
