import { tvOn, tvOff } from "./cec.ts";

const TV_ON_HOUR = parseInt(process.env.TV_ON_HOUR ?? "5", 10);
const TV_OFF_HOUR = parseInt(process.env.TV_OFF_HOUR ?? "23", 10);

let interval: ReturnType<typeof setInterval> | null = null;
let lastAction: "on" | "off" | null = null;

function check(): void {
  const hour = new Date().getHours();
  const shouldBeOn = hour >= TV_ON_HOUR && hour < TV_OFF_HOUR;
  const action = shouldBeOn ? "on" : "off";

  if (action !== lastAction) {
    lastAction = action;
    if (shouldBeOn) {
      tvOn();
    } else {
      tvOff();
    }
  }
}

export function startScheduler(): void {
  console.log(
    `[scheduler] TV on at ${TV_ON_HOUR}:00, off at ${TV_OFF_HOUR}:00`,
  );
  check();
  interval = setInterval(check, 60_000);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
