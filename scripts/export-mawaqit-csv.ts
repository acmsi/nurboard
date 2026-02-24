#!/usr/bin/env -S deno run --allow-read --allow-write
//
// Export data/timetable.json → 12 CSV files in Mawaqit's import format.
// Output: data/mawaqit-csv/01.csv … data/mawaqit-csv/12.csv
//
// Mawaqit format: Day,Fajr,Shuruk,Duhr,Asr,Maghrib,Isha

import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const timetable = JSON.parse(
  await Deno.readTextFile(join(root, "data/timetable.json")),
);

const outDir = join(root, "data/mawaqit-csv");
await Deno.mkdir(outDir, { recursive: true });

for (const month of timetable.months) {
  const filename = String(month.month).padStart(2, "0") + ".csv";
  const header = "Day,Fajr,Shuruk,Duhr,Asr,Maghrib,Isha";
  const rows = month.days.map(
    (d: Record<string, string | number>) =>
      `${d.day},${d.fajr},${d.shuruk},${d.duhr},${d.asr},${d.maghrib},${d.isha}`,
  );
  await Deno.writeTextFile(
    join(outDir, filename),
    header + "\n" + rows.join("\n") + "\n",
  );
  console.log(`[export] ${filename} (${month.days.length} days)`);
}

console.log(`\nDone — ${timetable.months.length} files in ${outDir}`);
