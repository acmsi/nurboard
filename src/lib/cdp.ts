const CDP_PORT = parseInt(Deno.env.get("CDP_PORT") ?? "9222", 10);
const CDP_BASE = `http://127.0.0.1:${CDP_PORT}`;

export interface CdpTab {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpVersion {
  Browser: string;
  "Protocol-Version": string;
  "User-Agent": string;
  "V8-Version": string;
  "WebKit-Version": string;
}

async function cdpFetch(path: string): Promise<Response> {
  return await fetch(`${CDP_BASE}${path}`);
}

export async function listTabs(): Promise<CdpTab[]> {
  const res = await cdpFetch("/json/list");
  const tabs: CdpTab[] = await res.json();
  return tabs.filter((t) => t.type === "page");
}

export async function createTab(url: string): Promise<CdpTab> {
  const res = await fetch(`${CDP_BASE}/json/new?${url}`, { method: "PUT" });
  return await res.json();
}

export async function activateTab(targetId: string): Promise<void> {
  await cdpFetch(`/json/activate/${targetId}`);
}

export async function closeTab(targetId: string): Promise<void> {
  await cdpFetch(`/json/close/${targetId}`);
}

export async function isConnected(): Promise<boolean> {
  try {
    const res = await cdpFetch("/json/version");
    const info: CdpVersion = await res.json();
    return !!info.Browser;
  } catch {
    return false;
  }
}
