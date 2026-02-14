import type { FetchResult } from "./fetch-result.ts";

const API_URL =
  "https://script.google.com/macros/s/AKfycbxEPnCPCJ687vzXMDmc8M66COZmco0kuzTOcXXtMRZXG71dkaRTVNwMVoWXDFgrIQQmeQ/exec";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 5000;

export interface MembershipData {
  annee: number;
  membres_actifs: number;
  membres_a_jour: number;
  cotisations_esperees: number;
  cotisations_recoltees: number;
  taux_recolte: number;
  cotisation_minimale: number;
}

let cached: MembershipData | null = null;
let cachedAt = 0;

export function _resetForTesting(): void {
  cached = null;
  cachedAt = 0;
}

export async function fetchMembershipData(): Promise<
  FetchResult<MembershipData | null>
> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return {
      data: cached,
      isStale: Date.now() - cachedAt > STALE_THRESHOLD_MS,
      isFallback: false,
    };
  }

  try {
    const res = await fetch(API_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: MembershipData = await res.json();
    cached = data;
    cachedAt = Date.now();
    return { data, isStale: false, isFallback: false };
  } catch (err) {
    console.error("[membership] fetch failed, using fallback:", err);
    if (cached) {
      return {
        data: cached,
        isStale: Date.now() - cachedAt > STALE_THRESHOLD_MS,
        isFallback: false,
      };
    }
    return { data: null, isStale: false, isFallback: true };
  }
}
