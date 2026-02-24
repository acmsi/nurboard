import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import {
  _resetForTesting,
  formatScheduleLog,
  formatTime,
  getCurrentMode,
  getTodaySchedule,
  parseTime,
} from "./prayer-times.ts";
import type { TodaySchedule } from "./prayer-times.ts";

// ── Helpers ─────────────────────────────────────────────────────────────

const minimalTimetable = {
  year: 2026,
  source: "test",
  months: [
    {
      month: 1,
      days: [{
        day: 15,
        imsak: "06:23",
        fajr: "06:43",
        shuruk: "08:13",
        duhr: "12:42",
        asr: "14:50",
        maghrib: "17:10",
        isha: "18:40",
      }],
    },
    {
      month: 2,
      days: [{
        day: 20,
        imsak: "05:44",
        fajr: "06:04",
        shuruk: "07:28",
        duhr: "12:46",
        asr: "15:35",
        maghrib: "18:04",
        isha: "19:34",
      }],
    },
    {
      month: 3,
      days: [{
        day: 20,
        imsak: "04:58",
        fajr: "05:18",
        shuruk: "06:43",
        duhr: "12:41",
        asr: "15:58",
        maghrib: "18:39",
        isha: "20:09",
      }],
    },
  ],
};

const minimalIqama = {
  defaults: { fajr: 10, duhr: 0, asr: 0, maghrib: 0, isha: 0 },
  overrides: [
    { from: "2026-02-19", to: "2026-02-28", isha: "20:10" },
    { from: "2026-03-01", to: "2026-03-10", isha: "20:20" },
  ],
  jumma: { start: "12:15", end: "12:45" },
  estimatedDurations: {
    fajr: 15,
    duhr: 20,
    asr: 15,
    maghrib: 10,
    isha: 20,
    jumma: 30,
  },
};

function stubFiles() {
  return stub(
    Deno,
    "readTextFile",
    (path: string | URL) => {
      const p = String(path);
      if (p.includes("timetable.json")) {
        return Promise.resolve(JSON.stringify(minimalTimetable));
      }
      if (p.includes("iqama-overrides.json")) {
        return Promise.resolve(JSON.stringify(minimalIqama));
      }
      return Promise.reject(new Error(`unexpected read: ${p}`));
    },
  );
}

// ── parseTime / formatTime ──────────────────────────────────────────────

Deno.test("parseTime: parses HH:MM to minutes", () => {
  assertEquals(parseTime("00:00"), 0);
  assertEquals(parseTime("06:30"), 390);
  assertEquals(parseTime("12:00"), 720);
  assertEquals(parseTime("23:59"), 1439);
});

Deno.test("formatTime: formats minutes to HH:MM", () => {
  assertEquals(formatTime(0), "00:00");
  assertEquals(formatTime(390), "06:30");
  assertEquals(formatTime(720), "12:00");
  assertEquals(formatTime(1439), "23:59");
});

// ── getTodaySchedule ────────────────────────────────────────────────────

Deno.test("getTodaySchedule: loads and computes for a normal weekday", async () => {
  _resetForTesting();
  const fileStub = stubFiles();
  const statStub = stub(Deno, "statSync", () => {
    throw new Error("no data dir");
  });
  try {
    // Jan 15, 2026 is a Thursday
    const schedule = await getTodaySchedule(new Date(2026, 0, 15, 10, 0));
    assertEquals(schedule.date, "2026-01-15");
    assertEquals(schedule.prayers.length, 5);

    // Fajr: adhan 06:43 (403), iqama = 403+10 = 413, end = 413+15 = 428
    const fajr = schedule.prayers[0];
    assertEquals(fajr.name, "fajr");
    assertEquals(fajr.adhan, 403);
    assertEquals(fajr.iqama, 413);
    assertEquals(fajr.estimatedEnd, 428);

    // Duhr: adhan 12:42 (762), iqama = 762+0 = 762, end = 762+20 = 782
    const duhr = schedule.prayers[1];
    assertEquals(duhr.name, "duhr");
    assertEquals(duhr.adhan, 762);
    assertEquals(duhr.iqama, 762);

    // TV on = fajr adhan - 30 = 403-30 = 373 (06:13)
    assertEquals(schedule.tvOn, 373);

    // TV off = isha iqama + 90 = 1120+90 = 1210
    // Isha adhan = 18:40 = 1120, iqama = 1120+0 = 1120
    assertEquals(schedule.tvOff, 1210);
  } finally {
    statStub.restore();
    fileStub.restore();
  }
});

Deno.test("getTodaySchedule: replaces duhr with jumma on Friday", async () => {
  _resetForTesting();
  const fileStub = stubFiles();
  const statStub = stub(Deno, "statSync", () => {
    throw new Error("no data dir");
  });
  try {
    // Feb 20, 2026 is a Friday
    const schedule = await getTodaySchedule(new Date(2026, 1, 20, 10, 0));
    assertEquals(schedule.date, "2026-02-20");
    const duhrSlot = schedule.prayers[1];
    assertEquals(duhrSlot.name, "jumma");
    assertEquals(duhrSlot.adhan, parseTime("12:15")); // jumma start
    assertEquals(duhrSlot.estimatedEnd, parseTime("12:15") + 30);
  } finally {
    statStub.restore();
    fileStub.restore();
  }
});

Deno.test("getTodaySchedule: applies Ramadan isha override", async () => {
  _resetForTesting();
  const fileStub = stubFiles();
  const statStub = stub(Deno, "statSync", () => {
    throw new Error("no data dir");
  });
  try {
    // Feb 20, 2026 — in Ramadan override range (isha: "20:10")
    const schedule = await getTodaySchedule(new Date(2026, 1, 20, 10, 0));
    const isha = schedule.prayers.find((p) => p.name === "isha")!;
    assertEquals(isha.iqama, parseTime("20:10"));
    // TV off should be isha iqama + 90
    assertEquals(schedule.tvOff, parseTime("20:10") + 90);
  } finally {
    statStub.restore();
    fileStub.restore();
  }
});

Deno.test("getTodaySchedule: returns fallback on file error", async () => {
  _resetForTesting();
  const fileStub = stub(
    Deno,
    "readTextFile",
    () => Promise.reject(new Error("file not found")),
  );
  const statStub = stub(Deno, "statSync", () => {
    throw new Error("no data dir");
  });
  const errStub = stub(console, "error");
  try {
    const schedule = await getTodaySchedule(new Date(2026, 0, 15, 10, 0));
    assertEquals(schedule.tvOn, 300); // 05:00
    assertEquals(schedule.tvOff, 1380); // 23:00
    assertEquals(schedule.prayers.length, 0);
  } finally {
    errStub.restore();
    statStub.restore();
    fileStub.restore();
  }
});

Deno.test("getTodaySchedule: caches per day", async () => {
  _resetForTesting();
  let readCount = 0;
  const fileStub = stub(
    Deno,
    "readTextFile",
    (path: string | URL) => {
      readCount++;
      const p = String(path);
      if (p.includes("timetable.json")) {
        return Promise.resolve(JSON.stringify(minimalTimetable));
      }
      if (p.includes("iqama-overrides.json")) {
        return Promise.resolve(JSON.stringify(minimalIqama));
      }
      return Promise.reject(new Error(`unexpected read: ${p}`));
    },
  );
  const statStub = stub(Deno, "statSync", () => {
    throw new Error("no data dir");
  });
  try {
    await getTodaySchedule(new Date(2026, 0, 15, 10, 0));
    const firstReads = readCount;
    await getTodaySchedule(new Date(2026, 0, 15, 14, 0)); // same day
    assertEquals(readCount, firstReads); // no new reads
  } finally {
    statStub.restore();
    fileStub.restore();
  }
});

// ── getCurrentMode ──────────────────────────────────────────────────────

Deno.test("getCurrentMode: returns 'between' outside prayer windows", () => {
  const schedule: TodaySchedule = {
    date: "2026-01-15",
    imsak: "06:23",
    tvOn: 373,
    tvOff: 1210,
    prayers: [
      { name: "fajr", adhan: 403, iqama: 413, estimatedEnd: 428 },
      { name: "duhr", adhan: 762, iqama: 762, estimatedEnd: 782 },
    ],
  };
  // 10:00 — between fajr end and duhr start
  const result = getCurrentMode(schedule, new Date(2026, 0, 15, 10, 0));
  assertEquals(result.mode, "between");
  assertEquals(result.prayer, undefined);
});

Deno.test("getCurrentMode: returns 'prayer' during iqama window", () => {
  const schedule: TodaySchedule = {
    date: "2026-01-15",
    imsak: "06:23",
    tvOn: 373,
    tvOff: 1210,
    prayers: [
      { name: "duhr", adhan: 762, iqama: 762, estimatedEnd: 782 },
    ],
  };
  // 12:45 (765 min) — within duhr iqama (762) to end (782)
  const result = getCurrentMode(schedule, new Date(2026, 0, 15, 12, 45));
  assertEquals(result.mode, "prayer");
  assertEquals(result.prayer, "duhr");
});

Deno.test("getCurrentMode: returns 'prayer' in 5-min lead before iqama", () => {
  const schedule: TodaySchedule = {
    date: "2026-01-15",
    imsak: "06:23",
    tvOn: 373,
    tvOff: 1210,
    prayers: [
      { name: "duhr", adhan: 762, iqama: 762, estimatedEnd: 782 },
    ],
  };
  // 12:38 (758 min) — 4 min before iqama (762-5 = 757 start)
  const result = getCurrentMode(schedule, new Date(2026, 0, 15, 12, 58));
  assertEquals(result.mode, "prayer");
});

Deno.test("getCurrentMode: returns 'between' just after prayer ends", () => {
  const schedule: TodaySchedule = {
    date: "2026-01-15",
    imsak: "06:23",
    tvOn: 373,
    tvOff: 1210,
    prayers: [
      { name: "duhr", adhan: 762, iqama: 762, estimatedEnd: 782 },
    ],
  };
  // 13:02 (782 min) — exactly at estimatedEnd
  const result = getCurrentMode(schedule, new Date(2026, 0, 15, 13, 2));
  assertEquals(result.mode, "between");
});

// ── formatScheduleLog ───────────────────────────────────────────────────

Deno.test("formatScheduleLog: formats readable schedule", () => {
  const schedule: TodaySchedule = {
    date: "2026-01-15",
    imsak: "06:23",
    tvOn: 373,
    tvOff: 1210,
    prayers: [
      { name: "fajr", adhan: 403, iqama: 413, estimatedEnd: 428 },
      { name: "duhr", adhan: 762, iqama: 762, estimatedEnd: 782 },
    ],
  };
  const log = formatScheduleLog(schedule);
  assertEquals(log, "Fajr 06:43, Duhr 12:42 | TV on 06:13, off 20:10");
});
