const API_URL =
  "https://script.google.com/macros/s/AKfycbwwzqgZUiQEICX8wtM-hlE69H8t6Ht64w4lnByRL8fy6BBib3zzdo8OTfCrQyUAWNfKAw/exec";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
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

const DEFAULTS: MembershipData = {
  annee: 2025,
  membres_actifs: 40,
  membres_a_jour: 15,
  cotisations_esperees: 14_400,
  cotisations_recoltees: 5_400,
  taux_recolte: 37.5,
  cotisation_minimale: 360,
};

let cached: MembershipData | null = null;
let cachedAt = 0;

export async function fetchMembershipData(): Promise<MembershipData> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(API_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: MembershipData = await res.json();
    cached = data;
    cachedAt = Date.now();
    return data;
  } catch (err) {
    console.error("[membership] fetch failed, using fallback:", err);
    return cached ?? DEFAULTS;
  }
}
