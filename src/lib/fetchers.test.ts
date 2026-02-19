import { assertEquals, assertExists } from "@std/assert";
import { FakeTime } from "@std/testing/time";
import { assertSpyCalls, stub } from "@std/testing/mock";
import {
  _resetForTesting as resetDonation,
  fetchDonationData,
} from "./donation.ts";
import {
  _resetForTesting as resetMembership,
  fetchMembershipData,
} from "./membership.ts";

// --- helpers ---

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const HOUR = 60 * 60 * 1000;

const fakeDonation = {
  objectif: 630_000,
  montant_leve: 400_000,
  pourcentage: 63.5,
  derniere_maj: "2026-02-01T00:00:00.000Z",
};

const fakeMembership = {
  annee: 2026,
  membres_actifs: 50,
  membres_a_jour: 42,
  cotisations_esperees: 18000,
  cotisations_recoltees: 15000,
  taux_recolte: 83.3,
  cotisation_minimale: 360,
};

// --- donation tests ---

Deno.test("donation: returns fresh data from API", async () => {
  resetDonation();
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(jsonResponse(fakeDonation)),
  );
  try {
    const result = await fetchDonationData();
    assertEquals(result.data, fakeDonation);
    assertEquals(result.isStale, false);
    assertEquals(result.isFallback, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("donation: serves cached data within 1h", async () => {
  resetDonation();
  const time = new FakeTime();
  try {
    const fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(jsonResponse(fakeDonation)),
    );
    try {
      // Prime the cache
      await fetchDonationData();
      assertSpyCalls(fetchStub, 1);

      // 30 min later — should use cache
      time.tick(30 * 60 * 1000);
      const result = await fetchDonationData();
      assertSpyCalls(fetchStub, 1); // no new fetch
      assertEquals(result.data, fakeDonation);
      assertEquals(result.isFallback, false);
    } finally {
      fetchStub.restore();
    }
  } finally {
    time.restore();
  }
});

Deno.test("donation: re-fetches after 1h cache expires", async () => {
  resetDonation();
  const time = new FakeTime();
  try {
    const fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(jsonResponse(fakeDonation)),
    );
    try {
      await fetchDonationData();
      assertSpyCalls(fetchStub, 1);

      time.tick(HOUR + 1);
      await fetchDonationData();
      assertSpyCalls(fetchStub, 2); // new fetch after TTL
    } finally {
      fetchStub.restore();
    }
  } finally {
    time.restore();
  }
});

Deno.test("donation: falls back to DEFAULTS when no cache", async () => {
  resetDonation();
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.reject(new Error("network down")),
  );
  const errStub = stub(console, "error");
  try {
    const result = await fetchDonationData();
    assertEquals(result.isFallback, true);
    assertExists(result.data.objectif);
    assertEquals(result.data.montant_leve, 323_619); // hardcoded default
  } finally {
    errStub.restore();
    fetchStub.restore();
  }
});

Deno.test("donation: marks cached data stale after 24h", async () => {
  resetDonation();
  const time = new FakeTime();
  try {
    // Prime cache
    let fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(jsonResponse(fakeDonation)),
    );
    await fetchDonationData();
    fetchStub.restore();

    // Advance 25h, make fetch fail so it uses stale cache
    time.tick(25 * HOUR);
    fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.reject(new Error("down")),
    );
    const errStub = stub(console, "error");
    try {
      const result = await fetchDonationData();
      assertEquals(result.isStale, true);
      assertEquals(result.isFallback, false);
      assertEquals(result.data, fakeDonation);
    } finally {
      errStub.restore();
      fetchStub.restore();
    }
  } finally {
    time.restore();
  }
});

// --- membership tests ---

Deno.test("membership: returns fresh data from API", async () => {
  resetMembership();
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(jsonResponse(fakeMembership)),
  );
  try {
    const result = await fetchMembershipData();
    assertEquals(result.data, fakeMembership);
    assertEquals(result.isStale, false);
    assertEquals(result.isFallback, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("membership: returns null when API fails and no cache", async () => {
  resetMembership();
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.reject(new Error("network down")),
  );
  const errStub = stub(console, "error");
  try {
    const result = await fetchMembershipData();
    assertEquals(result.data, null);
    assertEquals(result.isFallback, true);
  } finally {
    errStub.restore();
    fetchStub.restore();
  }
});

Deno.test("membership: returns stale cached data when API fails after prior success", async () => {
  resetMembership();
  const time = new FakeTime();
  try {
    // Prime cache
    let fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.resolve(jsonResponse(fakeMembership)),
    );
    await fetchMembershipData();
    fetchStub.restore();

    // 25h later, API fails — should return stale cache, NOT null
    time.tick(25 * HOUR);
    fetchStub = stub(
      globalThis,
      "fetch",
      () => Promise.reject(new Error("down")),
    );
    const errStub = stub(console, "error");
    try {
      const result = await fetchMembershipData();
      assertEquals(result.data, fakeMembership);
      assertEquals(result.isStale, true);
      assertEquals(result.isFallback, false);
    } finally {
      errStub.restore();
      fetchStub.restore();
    }
  } finally {
    time.restore();
  }
});
