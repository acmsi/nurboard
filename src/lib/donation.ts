const API_URL = "https://acmsi.ch/api/projet-xhamia-nur";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5000;

export interface DonationData {
  objectif: number;
  montant_leve: number;
  pourcentage: number;
  derniere_maj: string;
}

const DEFAULTS: DonationData = {
  objectif: 630_000,
  montant_leve: 330_000,
  pourcentage: 52,
  derniere_maj: "2025-02-13T00:00:00.000Z",
};

let cached: DonationData | null = null;
let cachedAt = 0;

export async function fetchDonationData(): Promise<DonationData> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(API_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DonationData = await res.json();
    cached = data;
    cachedAt = Date.now();
    return data;
  } catch (err) {
    console.error("[donation] fetch failed, using fallback:", err);
    return cached ?? DEFAULTS;
  }
}
