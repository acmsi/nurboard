import type { FetchResult } from "./fetch-result.ts";

const API_URL = "https://acmsi.ch/api/projet-xhamia-nur";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 5000;

export interface DonationData {
  objectif: number;
  montant_leve: number;
  pourcentage: number;
  derniere_maj: string;
}

const DEFAULTS: DonationData = {
  objectif: 630_000,
  montant_leve: 323_619,
  pourcentage: 51.4,
  derniere_maj: "2026-01-07T20:33:00.000Z",
};

let cached: DonationData | null = null;
let cachedAt = 0;

export async function fetchDonationData(): Promise<
  FetchResult<DonationData>
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
    const data: DonationData = await res.json();
    cached = data;
    cachedAt = Date.now();
    return { data, isStale: false, isFallback: false };
  } catch (err) {
    console.error("[donation] fetch failed, using fallback:", err);
    if (cached) {
      return {
        data: cached,
        isStale: Date.now() - cachedAt > STALE_THRESHOLD_MS,
        isFallback: false,
      };
    }
    return { data: DEFAULTS, isStale: false, isFallback: true };
  }
}
