import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Point a Whop webhook (payment succeeded) at:
//   https://<your-deployment>.convex.site/whop/webhook?token=<WHOP_WEBHOOK_TOKEN>
// Set WHOP_WEBHOOK_TOKEN in the Convex dashboard (Settings > Environment Variables).
http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = process.env.WHOP_WEBHOOK_TOKEN;
    const given = new URL(request.url).searchParams.get("token");
    if (!token || given !== token) return new Response("forbidden", { status: 403 });

    const body: any = await request.json().catch(() => null);
    const type = String(body?.type ?? body?.action ?? "").toLowerCase();
    if (!type.includes("payment") || !type.includes("succeeded")) {
      return new Response("ignored", { status: 200 });
    }
    const d = body?.data ?? {};
    const amount = Number(d.total ?? d.final_amount ?? d.subtotal ?? 1) || 1;
    await ctx.runMutation(internal.demo.recordSale, { amount });
    return new Response("ok", { status: 200 });
  }),
});

export default http;
