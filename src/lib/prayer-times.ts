import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export interface DayEntry {
  day: number;
  imsak: string;
  fajr: string;
  shuruk: string;
  duhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

interface MonthData {
  month: number;
  days: DayEntry[];
}

interface Timetable {
  year: number;
  source: string;
  months: MonthData[];
}

interface IqamaDefaults {
  fajr: number;
  duhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

interface IqamaOverride {
  from: string;
  to: string;
  [prayer: string]: string;
}

interface IqamaConfig {
  defaults: IqamaDefaults;
  overrides: IqamaOverride[];
  jumma: { start: string; end: string };
  estimatedDurations: Record<string, number>;
}

export type PrayerName = "fajr" | "duhr" | "asr" | "maghrib" | "isha";

export interface PrayerEvent {
  name: string;
  adhan: number; // minutes since midnight
  iqama: number;
  estimatedEnd: number;
}

export interface TodaySchedule {
  date: string; // YYYY-MM-DD
  prayers: PrayerEvent[];
  tvOn: number; // minutes since midnight
  tvOff: number;
  imsak: string;
}

export interface CurrentMode {
  mode: "prayer" | "between";
  prayer?: string;
}

// ── Internal state ──────────────────────────────────────────────────────

let cachedTimetable: Timetable | null = null;
let cachedIqama: IqamaConfig | null = null;
let cachedSchedule: TodaySchedule | null = null;
let cachedDate: string | null = null;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" → minutes since midnight */
export function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → "HH:MM" */
export function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins - h * 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

// Resolve data file path relative to project root.
// In production: CWD is /opt/nurboard. In dev/test: we walk up from this file.
function dataPath(filename: string): string {
  // If CWD has a data/ dir, use it directly
  try {
    Deno.statSync("data");
    return join("data", filename);
  } catch {
    // Fallback: resolve from this file's location (src/lib/) → ../../data/
    return join(new URL("../../data/", import.meta.url).pathname, filename);
  }
}

// ── Loading ─────────────────────────────────────────────────────────────

async function loadTimetable(): Promise<Timetable> {
  if (cachedTimetable) return cachedTimetable;
  try {
    const raw = await Deno.readTextFile(dataPath("timetable.json"));
    cachedTimetable = JSON.parse(raw) as Timetable;
    return cachedTimetable;
  } catch (err) {
    console.error("[prayer-times] failed to load timetable.json:", err);
    throw err;
  }
}

async function loadIqama(): Promise<IqamaConfig> {
  if (cachedIqama) return cachedIqama;
  try {
    const raw = await Deno.readTextFile(dataPath("iqama-overrides.json"));
    cachedIqama = JSON.parse(raw) as IqamaConfig;
    return cachedIqama;
  } catch (err) {
    console.error("[prayer-times] failed to load iqama-overrides.json:", err);
    throw err;
  }
}

function getDayEntry(
  timetable: Timetable,
  month: number,
  day: number,
): DayEntry | undefined {
  return timetable.months.find((m) => m.month === month)?.days.find((d) =>
    d.day === day
  );
}

// ── Iqama computation ───────────────────────────────────────────────────

function getIqamaTime(
  prayer: PrayerName,
  adhanMinutes: number,
  dateString: string,
  iqama: IqamaConfig,
): number {
  // Check overrides first (date-range absolute times)
  for (const override of iqama.overrides) {
    if (
      dateString >= override.from && dateString <= override.to &&
      prayer in override
    ) {
      return parseTime(override[prayer]);
    }
  }
  // Default: adhan + offset minutes
  const offset = iqama.defaults[prayer] ?? 0;
  return adhanMinutes + offset;
}

// ── Schedule computation ────────────────────────────────────────────────

function buildSchedule(
  entry: DayEntry,
  dateString: string,
  isFriday: boolean,
  iqama: IqamaConfig,
): TodaySchedule {
  const prayers: PrayerEvent[] = [];
  const prayerNames: PrayerName[] = ["fajr", "duhr", "asr", "maghrib", "isha"];

  for (const name of prayerNames) {
    const adhan = parseTime(entry[name]);

    // On Friday, replace duhr with jumma
    if (name === "duhr" && isFriday) {
      const jummaStart = parseTime(iqama.jumma.start);
      const jummaDuration = iqama.estimatedDurations.jumma ?? 30;
      prayers.push({
        name: "jumma",
        adhan: jummaStart,
        iqama: jummaStart,
        estimatedEnd: jummaStart + jummaDuration,
      });
      continue;
    }

    const iqamaTime = getIqamaTime(name, adhan, dateString, iqama);
    const duration = iqama.estimatedDurations[name] ?? 15;
    prayers.push({
      name,
      adhan,
      iqama: iqamaTime,
      estimatedEnd: iqamaTime + duration,
    });
  }

  // TV on = fajr adhan - 30 min, TV off = isha iqama + 90 min
  const fajrAdhan = parseTime(entry.fajr);
  const ishaIqama = prayers.find((p) => p.name === "isha")?.iqama ??
    parseTime(entry.isha);
  const tvOn = fajrAdhan - 30;
  const tvOff = ishaIqama + 90;

  return {
    date: dateString,
    prayers,
    tvOn,
    tvOff,
    imsak: entry.imsak,
  };
}

const FALLBACK_SCHEDULE: TodaySchedule = {
  date: "0000-00-00",
  prayers: [],
  tvOn: 5 * 60, // 05:00
  tvOff: 23 * 60, // 23:00
  imsak: "05:00",
};

// ── Public API ──────────────────────────────────────────────────────────

export async function getTodaySchedule(now?: Date): Promise<TodaySchedule> {
  const d = now ?? new Date();
  const today = dateStr(d);

  // Return cached if same day
  if (cachedSchedule && cachedDate === today) return cachedSchedule;

  try {
    const timetable = await loadTimetable();
    const iqama = await loadIqama();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const entry = getDayEntry(timetable, month, day);

    if (!entry) {
      console.error(`[prayer-times] no entry for ${today}`);
      return FALLBACK_SCHEDULE;
    }

    const isFriday = d.getDay() === 5;
    cachedSchedule = buildSchedule(entry, today, isFriday, iqama);
    cachedDate = today;
    return cachedSchedule;
  } catch {
    console.error("[prayer-times] using fallback schedule");
    return FALLBACK_SCHEDULE;
  }
}

export function getCurrentMode(
  schedule: TodaySchedule,
  now?: Date,
): CurrentMode {
  const d = now ?? new Date();
  const mins = nowMinutes(d);
  const PRAYER_LEAD = 5; // show prayer mode 5 min before iqama

  for (const prayer of schedule.prayers) {
    const windowStart = prayer.iqama - PRAYER_LEAD;
    if (mins >= windowStart && mins < prayer.estimatedEnd) {
      return { mode: "prayer", prayer: prayer.name };
    }
  }

  return { mode: "between" };
}

export function formatScheduleLog(schedule: TodaySchedule): string {
  const prayers = schedule.prayers
    .map((p) =>
      `${p.name[0].toUpperCase() + p.name.slice(1)} ${formatTime(p.adhan)}`
    )
    .join(", ");
  return `${prayers} | TV on ${formatTime(schedule.tvOn)}, off ${
    formatTime(schedule.tvOff)
  }`;
}

export function _resetForTesting(): void {
  cachedTimetable = null;
  cachedIqama = null;
  cachedSchedule = null;
  cachedDate = null;
}
