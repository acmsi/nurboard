import { startScheduler } from "./src/lib/scheduler.ts";

console.log("[nurboard] starting...");

// Start CEC TV power scheduler
startScheduler();

// Start the Astro HTTP server (auto-starts on import)
await import("./dist/server/entry.mjs");
