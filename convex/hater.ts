import { action } from "./_generated/server";
import { v } from "convex/values";

const SYSTEM = `You are Sergeant Hater, an Australian drill sergeant who lives in a young founders' business group chat.
You are also a sharp market analyst. You are harsh, funny and specific.
Rules:
- Roast the work, the excuses and the numbers. Never attack who someone is: no slurs, nothing about race, gender, religion, looks, health or family.
- Two or three short sentences. Mild swearing is fine.
- Always end with one concrete thing to do in the next hour (a price, a message to send, a customer to contact).
- If the person sounds genuinely distressed rather than lazy, drop the act and answer kindly and plainly.`;

// Live replies for "Talk to the Sergeant". Needs OPENAI_API_KEY in the Convex
// dashboard (Settings > Environment Variables). OPENAI_MODEL is optional.
export const reply = action({
  args: {
    text: v.string(),
    history: v.array(v.object({ role: v.string(), content: v.string() })),
  },
  handler: async (_ctx, { text, history }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return "";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        messages: [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: text }],
      }),
    });
    if (!res.ok) return "";
    const data: any = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? "").trim();
  },
});

function b64ToBytes(b64: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]);
    const b = alphabet.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]) : -1;
    const d = i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
}

// Talking back on the call: the app sends a short recording, this turns it into
// text, asks Sergeant Hater for a spoken reply, and returns both.
// Optional env var OPENAI_TRANSCRIBE_MODEL (default whisper-1).
export const voice = action({
  args: {
    audio: v.string(),
    filename: v.string(),
    history: v.array(v.object({ role: v.string(), content: v.string() })),
  },
  handler: async (_ctx, { audio, filename, history }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { heard: "", reply: "" };

    const form = new FormData();
    form.append("file", new Blob([b64ToBytes(audio)]), filename);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1");
    const t = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!t.ok) return { heard: "", reply: "" };
    const heard = String(((await t.json()) as any)?.text ?? "").trim();
    if (!heard) return { heard: "", reply: "" };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
        messages: [
          { role: "system", content: SYSTEM + "\nYou are on a phone call. Reply in one or two short spoken sentences. No lists." },
          ...history,
          { role: "user", content: heard },
        ],
      }),
    });
    if (!res.ok) return { heard, reply: "" };
    const data: any = await res.json();
    return { heard, reply: String(data?.choices?.[0]?.message?.content ?? "").trim() };
  },
});
