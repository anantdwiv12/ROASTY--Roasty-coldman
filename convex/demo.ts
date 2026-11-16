import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// The app subscribes to this. When `paid` flips, every phone goes quiet.
export const state = query({
  args: {},
  handler: async (ctx) => {
    const s = await ctx.db.query("state").first();
    return s ? { paid: s.paid, amount: s.amount } : { paid: false, amount: 0 };
  },
});

// Every chat message is stored here.
export const log = mutation({
  args: { kind: v.string(), who: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", args);
  },
});

export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    for (const m of await ctx.db.query("messages").collect()) await ctx.db.delete(m._id);
    for (const s of await ctx.db.query("state").collect()) await ctx.db.delete(s._id);
    await ctx.db.insert("state", { paid: false, amount: 0 });
  },
});

async function markPaid(ctx: any, amount: number) {
  const s = await ctx.db.query("state").first();
  if (s) await ctx.db.patch(s._id, { paid: true, amount });
  else await ctx.db.insert("state", { paid: true, amount });
}

// Called by the Whop webhook (convex/http.ts).
export const recordSale = internalMutation({
  args: { amount: v.number() },
  handler: async (ctx, { amount }) => markPaid(ctx, amount),
});

// Fallback: long-press the hate bar in the app.
export const simulateSale = mutation({
  args: {},
  handler: async (ctx) => markPaid(ctx, 1),
});
