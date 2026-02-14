import {
  activateTab,
  closeTab,
  createTab,
  isConnected,
  listTabs,
} from "./cdp.ts";

const MAWAQIT_URL = Deno.env.get("MAWAQIT_URL") ??
  "https://mawaqit.net/fr/mosquee-nur-2610-saint-imier-switzerland";
const DASHBOARD_URL = Deno.env.get("DASHBOARD_URL") ??
  "http://localhost:3000";
const TAB_ROTATION_SECS = parseInt(
  Deno.env.get("TAB_ROTATION_SECS") ?? "120",
  10,
);

interface ManagedTab {
  name: string;
  url: string;
  targetId: string | null;
}

const managedTabs: ManagedTab[] = [
  { name: "dashboard", url: DASHBOARD_URL, targetId: null },
  { name: "mawaqit", url: MAWAQIT_URL, targetId: null },
];

let currentIndex = 0;
let rotationInterval: ReturnType<typeof setInterval> | null = null;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let connected = false;

export function urlMatches(tabUrl: string, targetUrl: string): boolean {
  // Chrome may add trailing slash or normalize the URL
  try {
    const a = new URL(tabUrl);
    const b = new URL(targetUrl);
    return a.origin === b.origin &&
      a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "");
  } catch {
    return tabUrl.startsWith(targetUrl);
  }
}

async function setupTabs(): Promise<void> {
  const existing = await listTabs();

  for (const managed of managedTabs) {
    // Try to find an existing tab matching this URL
    const match = existing.find((t) => urlMatches(t.url, managed.url));
    if (match) {
      console.log(`[tab-rotator] reusing tab "${managed.name}": ${match.id}`);
      managed.targetId = match.id;
    } else {
      try {
        console.log(
          `[tab-rotator] creating tab "${managed.name}": ${managed.url}`,
        );
        const tab = await createTab(managed.url);
        managed.targetId = tab.id;
        console.log(
          `[tab-rotator] created tab "${managed.name}": ${tab.id}`,
        );
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

async function rotate(): Promise<void> {
  if (managedTabs.length === 0) return;

  currentIndex = (currentIndex + 1) % managedTabs.length;
  const tab = managedTabs[currentIndex];

  if (!tab.targetId) {
    console.log(`[tab-rotator] tab "${tab.name}" lost, re-setting up`);
    await setupTabs();
    return;
  }

  try {
    await activateTab(tab.targetId);
    console.log(`[tab-rotator] switched to "${tab.name}"`);
  } catch {
    console.log(
      `[tab-rotator] activate failed for "${tab.name}", re-setting up`,
    );
    tab.targetId = null;
    await setupTabs();
  }
}

export async function showTab(name: string): Promise<boolean> {
  const tab = managedTabs.find((t) => t.name === name);
  if (!tab || !tab.targetId) return false;

  try {
    await activateTab(tab.targetId);
    currentIndex = managedTabs.indexOf(tab);
    console.log(`[tab-rotator] manual switch to "${name}"`);
    return true;
  } catch {
    return false;
  }
}

export function getStatus(): {
  connected: boolean;
  currentTab: string | null;
  tabs: { name: string; url: string; targetId: string | null }[];
  rotationSecs: number;
} {
  return {
    connected,
    currentTab: managedTabs[currentIndex]?.name ?? null,
    tabs: managedTabs.map((t) => ({
      name: t.name,
      url: t.url,
      targetId: t.targetId,
    })),
    rotationSecs: TAB_ROTATION_SECS,
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

  // Show mawaqit first (it's the main content)
  const mawaqit = managedTabs.find((t) => t.name === "mawaqit");
  if (mawaqit?.targetId) {
    await activateTab(mawaqit.targetId);
    currentIndex = managedTabs.indexOf(mawaqit);
  }

  if (TAB_ROTATION_SECS > 0) {
    console.log(
      `[tab-rotator] rotation every ${TAB_ROTATION_SECS}s`,
    );
    rotationInterval = setInterval(rotate, TAB_ROTATION_SECS * 1000);
  } else {
    console.log("[tab-rotator] rotation disabled");
  }
}

export function startRotation(): void {
  console.log("[tab-rotator] starting...");
  connectAndSetup();
}

export function stopRotation(): void {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
  }
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  connected = false;
}
