import type { APIRoute } from "astro";
import { tvOff, tvOn, tvStatus } from "../../lib/cec.ts";

export const GET: APIRoute = async () => {
  const status = await tvStatus();
  return new Response(JSON.stringify({ status }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const { action } = await request.json();

  switch (action) {
    case "on":
      await tvOn();
      return Response.json({ ok: true, action: "on" });
    case "off":
      await tvOff();
      return Response.json({ ok: true, action: "off" });
    default:
      return Response.json(
        { ok: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
  }
};
