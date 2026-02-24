import {
  activateTab,
  closeTab,
  createTab,
  isConnected,
  listTabs,
} from "./cdp.ts";
import { getCurrentMode, getTodaySchedule } from "./prayer-times.ts";
import type { CurrentMode, TodaySchedule } from "./prayer-times.ts";

const MAWAQIT_URL = Deno.env.get("MAWAQIT_URL") ??
  "https://mawaqit.net/fr/mosquee-nur-2610-saint-imier-switzerland";
const MAWAQIT_MESSAGE_URL = Deno.env.get("MAWAQIT_MESSAGE_URL") ??
  "https://mawaqit.net/en/messages/id/41189";
const DASHBOARD_URL = Deno.env.get("DASHBOARD_URL") ??
  "http://localhost:3000";

// Tab refresh thresholds (ms)
const MAWAQIT_REFRESH_MS = 30 * 60_000; // 30 min
const DASHBOARD_REFRESH_MS = 2 * 3600_000; // 2h

interface ManagedTab {
  name: string;
  url: string;
  targetId: string | null;
  lastRefreshAt: number;
}

// Rotation sequences per mode: [tabName, durationSecs]
type RotationEntry = [string, number];

const PRAYER_SEQUENCE: RotationEntry[] = [
  ["mawaqit", 90],
  ["mawaqit-message", 30],
];

const BETWEEN_SEQUENCE: RotationEntry[] = [
  ["dashboard", 180],
  ["mawaqit", 45],
  ["mawaqit-message", 30],
];

const managedTabs: ManagedTab[] = [
  { name: "dashboard", url: DASHBOARD_URL, targetId: null, lastRefreshAt: 0 },
  { name: "mawaqit", url: MAWAQIT_URL, targetId: null, lastRefreshAt: 0 },
  {
    name: "mawaqit-message",
    url: MAWAQIT_MESSAGE_URL,
    targetId: null,
    lastRefreshAt: 0,
  },
];

let currentMode: "prayer" | "between" = "between";
let sequenceIndex = 0;
let rotationTimeout: ReturnType<typeof setTimeout> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let connected = false;

export function urlMatches(tabUrl: string, targetUrl: string): boolean {
  try {
    const a = new URL(tabUrl);
    const b = new URL(targetUrl);
    return a.origin === b.origin &&
      a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
  } catch {
    return tabUrl.startsWith(targetUrl);
  }
}

function getTab(name: string): ManagedTab | undefined {
  return managedTabs.find((t) => t.name === name);
}

function getSequence(): RotationEntry[] {
  return currentMode === "prayer" ? PRAYER_SEQUENCE : BETWEEN_SEQUENCE;
}

function refreshThreshold(name: string): number {
  return name === "dashboard" ? DASHBOARD_REFRESH_MS : MAWAQIT_REFRESH_MS;
}

async function refreshTab(tab: ManagedTab): Promise<void> {
  if (!tab.targetId) return;

  console.log(`[tab-rotator] refreshing "${tab.name}" (close+recreate)`);
  try {
    await closeTab(tab.targetId);
  } catch {
    // tab might already be gone
  }

  try {
    const newTab = await createTab(tab.url);
    tab.targetId = newTab.id;
    tab.lastRefreshAt = Date.now();
    console.log(`[tab-rotator] recreated "${tab.name}": ${newTab.id}`);
  } catch (err) {
    console.error(`[tab-rotator] failed to recreate "${tab.name}":`, err);
    tab.targetId = null;
  }
}

async function setupTabs(): Promise<void> {
  const existing = await listTabs();

  for (const managed of managedTabs) {
    const match = existing.find((t) => urlMatches(t.url, managed.url));
    if (match) {
      console.log(`[tab-rotator] reusing tab "${managed.name}": ${match.id}`);
      managed.targetId = match.id;
      if (managed.lastRefreshAt === 0) managed.lastRefreshAt = Date.now();
    } else {
      try {
        console.log(
          `[tab-rotator] creating tab "${managed.name}": ${managed.url}`,
        );
        const tab = await createTab(managed.url);
        managed.targetId = tab.id;
        managed.lastRefreshAt = Date.now();
        console.log(`[tab-rotator] created tab "${managed.name}": ${tab.id}`);
      } catch (err) {
        console.error(
          `[tab-rotator] failed to create tab "${managed.name}":`,
          err,
        );
      }
    }
  }

  // Close any extra tabs not managed by us
  const managedIds = new Set(managedTabs.map((t) => t.targetId));
  for (const tab of existing) {
    if (!managedIds.has(tab.id)) {
      console.log(`[tab-rotator] closing unmanaged tab: ${tab.url}`);
      await closeTab(tab.id);
    }
  }
}

function scheduleNext(): void {
  if (rotationTimeout) clearTimeout(rotationTimeout);
  const seq = getSequence();
  const [, durationSecs] = seq[sequenceIndex % seq.length];
  rotationTimeout = setTimeout(rotate, durationSecs * 1000);
}

async function rotate(): Promise<void> {
  const seq = getSequence();
  if (seq.length === 0) return;

  // Check current mode
  let schedule: TodaySchedule;
  try {
    schedule = await getTodaySchedule();
  } catch {
    scheduleNext();
    return;
  }

  const modeInfo: CurrentMode = getCurrentMode(schedule);
  const newMode = modeInfo.mode;

  // Mode changed — reset to first entry in new sequence
  if (newMode !== currentMode) {
    console.log(
      `[tab-rotator] mode: ${currentMode} → ${newMode}${
        modeInfo.prayer ? ` (${modeInfo.prayer})` : ""
      }`,
    );
    currentMode = newMode;
    sequenceIndex = 0;
  } else {
    sequenceIndex = (sequenceIndex + 1) % getSequence().length;
  }

  const currentSeq = getSequence();
  const [tabName, durationSecs] = currentSeq[sequenceIndex % currentSeq.length];
  const tab = getTab(tabName);

  if (!tab || !tab.targetId) {
    console.log(`[tab-rotator] tab "${tabName}" lost, re-setting up`);
    await setupTabs();
    scheduleNext();
    return;
  }

  // Check if tab needs refresh
  const age = Date.now() - tab.lastRefreshAt;
  if (age > refreshThreshold(tab.name)) {
    await refreshTab(tab);
    // Wait for page to load before activating
    if (tab.targetId) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  if (!tab.targetId) {
    await setupTabs();
    scheduleNext();
    return;
  }

  try {
    await activateTab(tab.targetId);
    console.log(
      `[tab-rotator] ${currentMode}: "${tabName}" (${durationSecs}s)`,
    );
  } catch {
    console.log(
      `[tab-rotator] activate failed for "${tabName}", re-setting up`,
    );
    tab.targetId = null;
    await setupTabs();
  }

  scheduleNext();
}

export async function showTab(name: string): Promise<boolean> {
  const tab = getTab(name);
  if (!tab || !tab.targetId) return false;

  try {
    await activateTab(tab.targetId);
    const seq = getSequence();
    const idx = seq.findIndex(([n]) => n === name);
    if (idx >= 0) sequenceIndex = idx;
    console.log(`[tab-rotator] manual switch to "${name}"`);
    return true;
  } catch {
    return false;
  }
}

export function getStatus(): {
  connected: boolean;
  currentTab: string | null;
  mode: string;
  tabs: { name: string; url: string; targetId: string | null }[];
} {
  const seq = getSequence();
  const [tabName] = seq[sequenceIndex % seq.length] ?? [null];
  return {
    connected,
    currentTab: tabName,
    mode: currentMode,
    tabs: managedTabs.map((t) => ({
      name: t.name,
      url: t.url,
      targetId: t.targetId,
    })),
  };
}

async function connectAndSetup(): Promise<void> {
  const ok = await isConnected();
  if (!ok) {
    console.log("[tab-rotator] Chrome not ready, retrying in 5s...");
    retryTimeout = setTimeout(connectAndSetup, 5_000);
    return;
  }

  connected = true;
  console.log("[tab-rotator] connected to Chrome CDP");

  await setupTabs();

  // Determine initial mode and show first tab
  try {
    const schedule = await getTodaySchedule();
    const modeInfo = getCurrentMode(schedule);
    currentMode = modeInfo.mode;
    console.log(
      `[tab-rotator] initial mode: ${currentMode}${
        modeInfo.prayer ? ` (${modeInfo.prayer})` : ""
      }`,
    );
  } catch {
    currentMode = "between";
  }

  const seq = getSequence();
  sequenceIndex = 0;
  const [firstTabName] = seq[0];
  const firstTab = getTab(firstTabName);
  if (firstTab?.targetId) {
    await activateTab(firstTab.targetId);
    console.log(`[tab-rotator] showing "${firstTabName}"`);
  }

  scheduleNext();
}

export function startRotation(): void {
  console.log("[tab-rotator] starting...");
  connectAndSetup();
}

export function stopRotation(): void {
  if (rotationTimeout) {
    clearTimeout(rotationTimeout);
    rotationTimeout = null;
  }
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  connected = false;
}
