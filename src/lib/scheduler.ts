import { tvOff, tvOn, tvStatus } from "./cec.ts";
import { isConnected } from "./cdp.ts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  formatScheduleLog,
  formatTime,
  getTodaySchedule,
} from "./prayer-times.ts";
import type { TodaySchedule } from "./prayer-times.ts";

const execAsync = promisify(exec);

let interval: ReturnType<typeof setInterval> | null = null;
let lastAction: "on" | "off" | null = null;
let lastDate: string | null = null;
let checkCount = 0;

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function logSchedule(schedule: TodaySchedule): void {
  console.log(`[scheduler] ${schedule.date}: ${formatScheduleLog(schedule)}`);
}

async function restartKiosk(): Promise<void> {
  try {
    console.log("[scheduler] restarting kiosk service (memory cleanup)");
    await execAsync("sudo systemctl restart nurboard-kiosk");
  } catch (err) {
    console.error("[scheduler] kiosk restart failed:", err);
  }
}

async function startKiosk(): Promise<void> {
  try {
    console.log("[scheduler] starting kiosk service (TV manually on)");
    await execAsync("sudo systemctl start nurboard-kiosk");
  } catch (err) {
    console.error("[scheduler] kiosk start failed:", err);
  }
}

async function check(): Promise<void> {
  const schedule = await getTodaySchedule();
  const mins = nowMinutes();

  // Log schedule on date change
  if (schedule.date !== lastDate) {
    lastDate = schedule.date;
    logSchedule(schedule);
  }

  const shouldBeOn = mins >= schedule.tvOn && mins < schedule.tvOff;
  const action = shouldBeOn ? "on" : "off";

  if (action !== lastAction) {
    lastAction = action;
    if (shouldBeOn) {
      tvOn();
    } else {
      tvOff();
      // Schedule kiosk restart for memory cleanup after TV off
      setTimeout(restartKiosk, 60_000);
    }
    console.log(
      `[scheduler] TV ${action} (${formatTime(mins)}, window ${
        formatTime(schedule.tvOn)
      }–${formatTime(schedule.tvOff)})`,
    );
  }

  // CEC polling: every 5th check (~5 min), verify TV state
  checkCount++;
  if (checkCount % 5 === 0 && !shouldBeOn) {
    const status = await tvStatus();
    if (status === "on") {
      // TV manually turned on outside scheduled hours — ensure Chrome is running
      const chromeOk = await isConnected();
      if (!chromeOk) {
        await startKiosk();
      }
    }
  }
}

export async function startScheduler(): Promise<void> {
  const schedule = await getTodaySchedule();
  logSchedule(schedule);

  // Run first check immediately
  await check();

  interval = setInterval(check, 60_000);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
