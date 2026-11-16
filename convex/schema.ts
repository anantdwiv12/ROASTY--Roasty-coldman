import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({ kind: v.string(), who: v.string(), text: v.string() }),
  state: defineTable({ paid: v.boolean(), amount: v.number() }),
});
