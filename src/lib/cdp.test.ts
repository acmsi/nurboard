import { assertEquals } from "@std/assert";
import { assertSpyCalls, stub } from "@std/testing/mock";
import { createTab, isConnected, listTabs } from "./cdp.ts";

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("listTabs filters to page type only", async () => {
  const allTabs = [
    { id: "1", type: "page", title: "Dashboard", url: "http://localhost:3000" },
    {
      id: "2",
      type: "background_page",
      title: "Extension",
      url: "chrome-extension://abc",
    },
    {
      id: "3",
      type: "page",
      title: "Mawaqit",
      url: "https://mawaqit.net/fr/test",
    },
    { id: "4", type: "service_worker", title: "SW", url: "chrome://sw" },
  ];
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(jsonResponse(allTabs)),
  );
  try {
    const tabs = await listTabs();
    assertEquals(tabs.length, 2);
    assertEquals(tabs[0].id, "1");
    assertEquals(tabs[1].id, "3");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("createTab sends PUT to correct URL", async () => {
  const createdTab = {
    id: "new-1",
    type: "page",
    title: "",
    url: "http://localhost:3000",
  };
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(jsonResponse(createdTab)),
  );
  try {
    const tab = await createTab("http://localhost:3000");
    assertEquals(tab.id, "new-1");

    assertSpyCalls(fetchStub, 1);
    const call = fetchStub.calls[0];
    assertEquals(
      call.args[0],
      "http://127.0.0.1:9222/json/new?http://localhost:3000",
    );
    assertEquals((call.args[1] as RequestInit).method, "PUT");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("isConnected returns false when Chrome is down", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.reject(new Error("ECONNREFUSED")),
  );
  try {
    const result = await isConnected();
    assertEquals(result, false);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("isConnected returns true when Chrome responds", async () => {
  const fetchStub = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(jsonResponse({
        Browser: "Chrome/120.0.0.0",
        "Protocol-Version": "1.3",
        "User-Agent": "test",
        "V8-Version": "12.0",
        "WebKit-Version": "537.36",
      })),
  );
  try {
    const result = await isConnected();
    assertEquals(result, true);
  } finally {
    fetchStub.restore();
  }
});
