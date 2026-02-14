import { assertEquals } from "@std/assert";
import { urlMatches } from "./tab-rotator.ts";

Deno.test("urlMatches: ignores trailing slash added by Chrome", () => {
  assertEquals(
    urlMatches("http://localhost:3000/", "http://localhost:3000"),
    true,
  );
  assertEquals(
    urlMatches("http://localhost:3000", "http://localhost:3000/"),
    true,
  );
});

Deno.test("urlMatches: falls back to startsWith for invalid URLs", () => {
  assertEquals(urlMatches("not-a-url/page", "not-a-url"), true);
  assertEquals(urlMatches("not-a-url/page", "other"), false);
});
