# Roasty

Sergeant Hater lives in your business group chat. He only shuts up when you make a sale.

Two modes on the start screen:
- **Play the morning**: the scripted demo (voice note, market report, the call, the Whop store, the sale).
- **Talk to the Sergeant**: type anything and Sergeant Hater answers live.

## Run it on your phone

1. Install **Expo Go** on your phone.
2. On a computer with Node, in this folder:
   ```
   npm install
   npx convex dev        # log in, create a project, leave it running
   ```
3. In a second terminal: `npx expo start`, then scan the QR code.

Without Convex the app still runs: the demo plays offline and live mode uses stock replies.

## Keys (all in the Convex dashboard, Settings > Environment Variables)

- `OPENAI_API_KEY`: live replies in "Talk to the Sergeant". Optional `OPENAI_MODEL` (default gpt-5-mini).
- `WHOP_WEBHOOK_TOKEN`: any long random string.

## Whop

1. Create a $1 product and paste its checkout link into `WHOP_CHECKOUT_URL` at the top of `App.js`.
2. Add a Whop webhook for "payment succeeded" pointing at
   `https://<your-deployment>.convex.site/whop/webhook?token=<WHOP_WEBHOOK_TOKEN>`.

## Demo controls

- **Long-press the hate bar**: trigger the sale by hand.
- **Tap the title**: back to the start screen.
- In the demo, decline the call once to get the threat, then accept. He speaks, listens to your answer, gives the order and hangs up by himself.
- On the call, just talk when it says Listening. The phone stops listening when you go quiet, and Sergeant Hater answers out loud. This needs Convex and `OPENAI_API_KEY`; without them he uses stock lines.
- In "Talk to the Sergeant", tap **Call me** to get a call.

## What is scripted

Everything in "Play the morning": the lines, the teammates, the competitor report and the funnel numbers are invented for the demo. The voice is the phone's built-in Australian English voice. Nothing is ever sent to anyone outside the app.
