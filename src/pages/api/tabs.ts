import type { APIRoute } from "astro";
import { getStatus, showTab } from "../../lib/tab-rotator.ts";

export const GET: APIRoute = () => {
  const status = getStatus();
  return Response.json(status);
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "show": {
      const { tab } = body;
      if (!tab || typeof tab !== "string") {
        return Response.json(
          { ok: false, error: "Missing 'tab' name" },
          { status: 400 },
        );
      }
      const switched = await showTab(tab);
      if (!switched) {
        return Response.json(
          { ok: false, error: `Tab "${tab}" not found or not connected` },
          { status: 404 },
        );
      }
      return Response.json({ ok: true, action: "show", tab });
    }
    default:
      return Response.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
  }
};
