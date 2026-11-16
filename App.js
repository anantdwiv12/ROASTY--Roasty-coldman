import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Speech from 'expo-speech';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';

// ---- Fill these in -------------------------------------------------------
// Your Whop checkout link for the $1 product. The store card shows a QR for it.
const WHOP_CHECKOUT_URL = '';
// Set by `npx convex dev` in .env.local. Leave empty to run fully offline.
const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || '';
// --------------------------------------------------------------------------

const BOT = 'Sergeant Hater';
const TEAM = 'Lumen Drops';

const VOICE_TEXT =
  "Oi. Three in the arvo and one of you still isn't up. Read the report. " +
  "You're not gonna make it. Prove me wrong, ya muppets.";

const CALL_LINES = [
  "Finally. Sam's asleep, Aryan's asleep, so you get the plan.",
  "GlowDesk dropped to twenty-four dollars last night. What's your excuse?",
];

const CALL_CANNED = [
  "That's an excuse, not a plan. Match the price at twenty-four and promise three-day shipping. Say it back to me.",
  'Better. Now post the store link in both Discords before you put this phone down.',
  "Good. I hang up when you make a sale. Go.",
];

const CALL_CLOSE = "That's an excuse, not a plan. Match the price, promise three-day shipping, post the link. Call me when you've made a sale.";

const toBase64 = async (uri) => {
  const res = await fetch(uri);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result || '').split(',').pop() || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
};

const THREAT = "Declined? Decline again and I DM your ex that you still have zero customers.";
const DRAFT_POSTED = 'posted the link in both discords';

const CANNED = [
  "That's a feeling, not a result. What did you ship today? One sentence.",
  'Your competitor did that last week. Pick one customer and message them in the next ten minutes.',
  "I've heard that before. Put a price on it and send me the link, or stop typing.",
  'Talking in here is not selling out there. Go get one reply from a real buyer within the hour.',
];

const C = {
  bg: '#000000', bar: '#111113', line: '#26262A', bubble: '#262629',
  text: '#FFFFFF', soft: '#EBEBF0', muted: '#A1A1A8', red: '#FF453A',
  redSoft: '#FF6961', green: '#30D158', blue: '#0A60D8',
};

const hush = () => { try { Speech.stop(); } catch (e) { /* no speech on this device */ } };

let nextId = 1;
const make = (kind, who, text) => ({ id: String(nextId++), kind, who, text: text || '' });

export default function App() {
  const [screen, setScreen] = useState('home'); // home | chat
  const [mode, setMode] = useState('demo'); // demo | live
  const [messages, setMessages] = useState([]);
  const [hate, setHate] = useState(88);
  const [revenue, setRevenue] = useState(0);
  const [paid, setPaid] = useState(false);
  const [draft, setDraft] = useState('');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [call, setCall] = useState(null); // null | ring | live
  const [callIdx, setCallIdx] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [turn, setTurn] = useState('sergeant'); // sergeant | you | thinking
  const [caption, setCaption] = useState('');
  const [heardYou, setHeardYou] = useState('');
  const [recording, setRecording] = useState(false);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const pollRef = useRef(null);
  const recState = useRef('idle'); // idle | starting | on
  const callCanned = useRef(0);

  const timers = useRef([]);
  const scroller = useRef(null);
  const convex = useRef(null);
  const paidRef = useRef(false);
  const callRun = useRef(0);
  const cannedIdx = useRef(0);
  const history = useRef([]);

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const post = useCallback((kind, who, text) => {
    const m = make(kind, who, text);
    setMessages((prev) => prev.concat([m]));
    if (convex.current) {
      convex.current.mutation(anyApi.demo.log, { kind, who, text: text || '' }).catch(() => {});
    }
  }, []);

  const sale = useCallback((amount) => {
    if (paidRef.current) return;
    paidRef.current = true;
    const amt = amount > 0 ? amount : 1;
    setPaid(true); setRevenue(amt); setHate(2);
    post('payment', 'Whop', '$' + amt.toFixed(2) + ' · first sale');
    later(() => post('hater', BOT, "Fine. That's a customer. I've got nothing. Don't get comfortable."), 1500);
    later(() => { setHate(14); post('hater', BOT, "It's been five seconds. Where's the second one?"); }, 8000);
  }, [post]);

  const wipe = () => {
    clearTimers(); hush(); callRun.current += 1; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    paidRef.current = false; history.current = [];
    setMessages([]); setHate(88); setRevenue(0); setPaid(false);
    setDraft(''); setStep(0); setPlaying(false); setHeard(false);
    setShowQr(false); setCall(null); setCallIdx(0); setThinking(false);
    setTurn('sergeant'); setCaption(''); setHeardYou(''); setRecording(false);
    recState.current = 'idle'; callCanned.current = 0;
    if (convex.current) convex.current.mutation(anyApi.demo.reset, {}).catch(() => {});
  };

  const startDemo = () => {
    wipe(); setMode('demo'); setScreen('chat');
    later(() => post('voice', BOT, VOICE_TEXT), 300);
    later(() => post('report', BOT, ''), 1900);
    later(() => post('hater', BOT, "Sam isn't up. Aryan isn't up. That leaves you."), 3800);
    later(() => setCall('ring'), 5400);
  };

  const startLive = () => {
    wipe(); setMode('live'); setScreen('chat');
    later(() => post('hater', BOT, 'Sergeant Hater. Tell me what your business is and what you did for it today.'), 300);
  };

  const goHome = () => { wipe(); setScreen('home'); };

  useEffect(() => {
    if (CONVEX_URL) {
      try {
        convex.current = new ConvexClient(CONVEX_URL);
        convex.current.onUpdate(anyApi.demo.state, {}, (s) => {
          if (s && s.paid) sale(Number(s.amount) || 1);
        });
      } catch (e) { convex.current = null; }
    }
    return () => { clearTimers(); hush(); if (convex.current) convex.current.close(); };
  }, []);

  // ---- the call ----------------------------------------------------------
  const afterCall = () => {
    callRun.current += 1; hush(); stopPolling(); setCall(null); setRecording(false);
    if (recState.current === 'on') { recorder.stop().catch(() => {}); }
    recState.current = 'idle';
    if (mode === 'live') { later(() => post('hater', BOT, 'Call over. Now type what you actually did.'), 400); return; }
    later(() => post('hater', BOT, "That's the plan. Price at $24, ship in 3 days, post the link. I built the store."), 500);
    later(() => post('store', BOT, ''), 1900);
    later(() => post('mate', 'Aryan', 'im up'), 3300);
    later(() => { post('hater', BOT, 'At 3 pm. Inspiring.'); setDraft(DRAFT_POSTED); setStep(3); }, 4500);
  };

  // Say one thing on the call, keep it on screen long enough to read, then run `done`.
  const sayOnCall = (text, run, done) => {
    if (run !== callRun.current) return;
    setTurn('sergeant'); setCaption(text);
    let moved = false;
    const began = Date.now();
    const next = () => {
      if (moved) return; moved = true;
      later(() => { if (run === callRun.current) done(); }, Math.max(0, 2800 - (Date.now() - began)));
    };
    try { Speech.speak(text, { language: 'en-AU', rate: 1.05, pitch: 0.8, onDone: next, onError: next }); }
    catch (e) { /* timer below still advances */ }
    later(next, 9000);
  };

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // After the Sergeant speaks, the phone listens on its own and stops when you go quiet.
  const yourTurn = async () => {
    const run = callRun.current;
    setTurn('you'); setRecording(true);
    recState.current = 'starting';
    let ok = false;
    try {
      hush();
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('no mic');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (run !== callRun.current) return;
      recorder.record();
      ok = true;
    } catch (e) { ok = false; }
    if (run !== callRun.current) return;
    recState.current = ok ? 'on' : 'failed';
    const began = Date.now();
    let spoke = false; let quietSince = 0;
    stopPolling();
    pollRef.current = setInterval(() => {
      if (run !== callRun.current) { stopPolling(); return; }
      const elapsed = Date.now() - began;
      let level;
      try { level = ok ? recorder.getStatus().metering : undefined; } catch (e) { level = undefined; }
      if (typeof level === 'number') {
        if (level > -35) { spoke = true; quietSince = 0; }
        else if (spoke && level < -45) { if (!quietSince) quietSince = Date.now(); }
        if (spoke && quietSince && Date.now() - quietSince > 1200) { doneListening(run); return; }
        if (elapsed > 8000) { doneListening(run); return; }
      } else if (elapsed > (ok ? 5000 : 2600)) { doneListening(run); }
    }, 250);
  };

  const doneListening = async (run) => {
    stopPolling();
    if (run !== callRun.current || turn === 'thinking') return;
    const was = recState.current;
    recState.current = 'idle'; setRecording(false); setTurn('thinking');
    let audio = '';
    if (was === 'on') {
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) audio = await toBase64(recorder.uri);
      } catch (e) { audio = ''; }
    }
    let heard = ''; let reply = '';
    if (mode === 'demo') {
      // Scripted demo: he calls, you answer once, he gives the order and hangs up.
      await new Promise((r) => setTimeout(r, 500));
      if (run !== callRun.current) return;
      sayOnCall(CALL_CLOSE, run, afterCall);
      return;
    }
    if (convex.current && audio) {
      try {
        const r = await convex.current.action(anyApi.hater.voice, {
          audio, filename: Platform.OS === 'web' ? 'speech.webm' : 'speech.m4a', history: history.current.slice(-8),
        });
        heard = (r && r.heard) || ''; reply = (r && r.reply) || '';
      } catch (e) { reply = ''; }
    }
    if (!reply) { reply = CALL_CANNED[callCanned.current % CALL_CANNED.length]; callCanned.current += 1; }
    if (run !== callRun.current) return;
    history.current.push({ role: 'user', content: heard || '(spoke on the call)' }, { role: 'assistant', content: reply });
    setHeardYou(heard ? 'You: ' + heard : '');
    sayOnCall(reply, run, yourTurn);
  };

  const sayLine = (i, run) => {
    if (run !== callRun.current) return;
    if (i >= CALL_LINES.length) { yourTurn(); return; }
    setCallIdx(i);
    sayOnCall(CALL_LINES[i], run, () => sayLine(i + 1, run));
  };

  const acceptCall = () => {
    hush(); callRun.current += 1; setCall('live'); setTurn('sergeant'); setHeardYou('');
    sayLine(0, callRun.current);
  };

  const declineCall = () => {
    setCall(null);
    post('hater', BOT, THREAT);
    later(() => setCall('ring'), 2800);
  };

  // ---- sending -----------------------------------------------------------
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    post('mine', 'You', text);
    setDraft('');
    if (mode === 'demo') {
      if (step === 3) {
        setStep(4);
        later(() => post('hater', BOT, '600 people just saw it. Now we wait. I hate waiting.'), 1100);
      }
      return;
    }
    setThinking(true);
    let reply = '';
    if (convex.current) {
      try { reply = await convex.current.action(anyApi.hater.reply, { text, history: history.current.slice(-8) }); }
      catch (e) { reply = ''; }
    }
    if (!reply) {
      reply = CANNED[cannedIdx.current % CANNED.length];
      cannedIdx.current += 1;
      await new Promise((r) => setTimeout(r, 900));
    }
    history.current.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    setThinking(false);
    post('hater', BOT, reply);
  };

  const playVoice = () => {
    if (playing) { hush(); setPlaying(false); return; }
    setPlaying(true); setHeard(true);
    try {
      Speech.speak(VOICE_TEXT, {
        language: 'en-AU', rate: 1.02, pitch: 0.8,
        onDone: () => setPlaying(false), onStopped: () => setPlaying(false), onError: () => setPlaying(false),
      });
    } catch (e) { /* transcript still shows */ }
    later(() => setPlaying(false), 12000);
  };

  const simulateSale = () => {
    if (convex.current) convex.current.mutation(anyApi.demo.simulateSale, {}).catch(() => sale(1));
    else sale(1);
  };

  const hateLabel = paid ? (hate > 5 ? 'Warming up' : 'Quiet') : 'Sergeant';
  const hateColor = paid ? C.green : C.red;

  if (screen === 'home') {
    return (
      <View style={[s.root, s.home]}>
        <StatusBar barStyle="light-content" />
        <View style={s.flex} />
        <Text style={s.wordmark}>ROASTY</Text>
        <Text style={s.tagline}>Sergeant Hater, in your business group chat.{'\n'}He shuts up when you make a sale.</Text>
        <View style={s.flex} />
        <Pressable style={s.homeBtn} onPress={startDemo}>
          <Text style={s.homeBtnText}>Play the morning</Text>
        </Pressable>
        <Pressable style={[s.homeBtn, s.homeBtnAlt]} onPress={startLive}>
          <Text style={[s.homeBtnText, { color: C.text }]}>Talk to the Sergeant</Text>
        </Pressable>
        <Text style={s.homeFoot}>Convex · Whop · OpenAI</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View style={s.header}>
          <Pressable onPress={goHome} accessibilityLabel="Back to start">
            <Text style={s.title}>{mode === 'demo' ? TEAM : BOT}</Text>
            <Text style={s.subtitle}>{mode === 'demo' ? 'Sam, Aryan, you and ' + BOT : 'live · tap here to go back'}</Text>
          </Pressable>
          {mode === 'live' && (
            <Pressable style={s.callNow} onPress={() => setCall('ring')} accessibilityLabel="Get a call from the Sergeant">
              <Text style={s.callNowText}>Call me</Text>
            </Pressable>
          )}
          <View style={s.revRow}>
            <Text style={[s.revenue, paid && { color: C.green }]}>${revenue}</Text>
            <Text style={s.revCaption}>{paid ? 'first sale · paid through Whop' : 'revenue · day 9'}</Text>
          </View>
          <Pressable onLongPress={simulateSale} delayLongPress={600} style={s.meterRow} accessibilityLabel="Hate level">
            <Text style={s.meterTag}>HATE</Text>
            <View style={s.meterTrack}>
              <View style={[s.meterFill, { width: Math.max(2, hate) + '%', backgroundColor: hateColor }]} />
            </View>
            <Text style={[s.meterLabel, { color: hateColor }]}>{hateLabel}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller} style={s.flex} contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current && scroller.current.scrollToEnd({ animated: true })}
        >
          {messages.map((m) => (
            <Message key={m.id} m={m} playing={playing} heard={heard} onPlay={playVoice}
              onStore={() => WHOP_CHECKOUT_URL && setShowQr(true)} hasLink={!!WHOP_CHECKOUT_URL} />
          ))}
          {thinking && (
            <View style={s.left}>
              <Text style={[s.name, { color: C.redSoft }]}>{BOT}</Text>
              <View style={[s.bubble, s.theirs]}><Text style={[s.bubbleText, { color: C.muted }]}>typing…</Text></View>
            </View>
          )}
        </ScrollView>

        <View style={s.composer}>
          <TextInput
            style={s.input} value={draft} onChangeText={setDraft}
            placeholder={mode === 'live' ? 'Tell the Sergeant' : 'Message'} placeholderTextColor="#8E8E93"
            returnKeyType="send" onSubmitEditing={send}
          />
          <Pressable onPress={send} style={[s.send, { backgroundColor: draft.trim() ? C.blue : '#3A3A3C' }]}
            accessibilityLabel="Send message">
            <Text style={s.sendArrow}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={call !== null} animationType="fade" onRequestClose={() => {}}>
        {call === 'ring' && (
          <View style={s.callWrap}>
            <Text style={s.callSmall}>incoming call</Text>
            <Text style={s.callName}>{BOT}</Text>
            <Text style={s.callSmall}>about {TEAM}</Text>
            <View style={s.flex} />
            <View style={s.callBtns}>
              <View style={s.callCol}>
                <Pressable style={[s.callBtn, { backgroundColor: C.red }]} onPress={declineCall} accessibilityLabel="Decline call">
                  <Text style={s.callBtnIcon}>✕</Text>
                </Pressable>
                <Text style={s.callBtnLabel}>Decline</Text>
              </View>
              <View style={s.callCol}>
                <Pressable style={[s.callBtn, { backgroundColor: C.green }]} onPress={acceptCall} accessibilityLabel="Accept call">
                  <Text style={s.callBtnIcon}>✓</Text>
                </Pressable>
                <Text style={s.callBtnLabel}>Accept</Text>
              </View>
            </View>
          </View>
        )}
        {call === 'live' && (
          <View style={s.callWrap}>
            <Text style={s.callSmall}>on call</Text>
            <Text style={s.callName}>{BOT}</Text>
            <View style={s.flex} />
            <Text style={s.caption}>{turn === 'thinking' ? '…' : caption}</Text>
            {!!heardYou && <Text style={s.heard}>{heardYou}</Text>}
            <View style={s.flex} />
            <View style={[s.talk, recording ? { backgroundColor: C.green } : { backgroundColor: '#1C1C1E' }]} accessibilityLabel="Call status">
              <Text style={[s.talkText, !recording && { color: C.soft }]}>{recording ? 'Listening… just talk' : turn === 'thinking' ? 'Thinking…' : 'Sergeant is talking'}</Text>
            </View>
            <Pressable style={[s.callBtn, { backgroundColor: C.red, alignSelf: 'center', marginTop: 22 }]} onPress={afterCall} accessibilityLabel="End call">
              <Text style={s.callBtnIcon}>✕</Text>
            </Pressable>
          </View>
        )}
      </Modal>

      <Modal visible={showQr} animationType="slide" onRequestClose={() => setShowQr(false)}>
        <View style={s.qrWrap}>
          <Text style={s.qrTitle}>{TEAM} on Whop</Text>
          <Text style={s.qrSub}>Scan to buy. The Sergeant is watching.</Text>
          {!!WHOP_CHECKOUT_URL && (
            <Image style={s.qr}
              source={{ uri: 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' + encodeURIComponent(WHOP_CHECKOUT_URL) }} />
          )}
          <Pressable style={s.qrBtn} onPress={() => Linking.openURL(WHOP_CHECKOUT_URL).catch(() => {})}>
            <Text style={s.qrBtnText}>Open checkout</Text>
          </Pressable>
          <Pressable style={s.qrClose} onPress={() => setShowQr(false)}>
            <Text style={s.qrCloseText}>Back to chat</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const BARS = [8, 16, 24, 12, 28, 20, 10, 26, 18, 30, 14, 22, 9, 25, 17, 29, 13, 21, 11, 19, 7];

function Message({ m, playing, heard, onPlay, onStore, hasLink }) {
  if (m.kind === 'mine') {
    return <View style={[s.bubble, s.mine]}><Text style={s.bubbleText}>{m.text}</Text></View>;
  }
  if (m.kind === 'payment') {
    return (
      <View style={s.pay}>
        <Text style={s.payTitle}>Whop · payment received</Text>
        <Text style={s.paySub}>{m.text}</Text>
      </View>
    );
  }
  if (m.kind === 'voice') {
    return (
      <View style={s.left}>
        <Text style={[s.name, { color: C.redSoft }]}>{BOT}</Text>
        <View style={[s.bubble, s.voice]}>
          <View style={s.voiceRow}>
            <Pressable onPress={onPlay} style={s.play} accessibilityLabel="Play voice message">
              <Text style={s.playIcon}>{playing ? '■' : '▶'}</Text>
            </Pressable>
            <View style={s.wave}>
              {BARS.map((h, i) => (
                <View key={i} style={[s.waveBar, { height: playing ? Math.max(6, (h * ((i % 3) + 2)) / 4) : h }]} />
              ))}
            </View>
            <Text style={s.dur}>0:07</Text>
          </View>
          {heard && <Text style={s.transcript}>{m.text}</Text>}
        </View>
      </View>
    );
  }
  if (m.kind === 'report') {
    return (
      <View style={s.report}>
        <Text style={s.repTag}>SERGEANT HATER · MARKET REPORT · 3:12 AM</Text>
        <Text style={s.repBig}>$0</Text>
        <Text style={s.repCap}>{TEAM} revenue · day 9</Text>
        <View style={s.repRule} />
        <Text style={s.repTag}>GLOWDESK, LAST NIGHT</Text>
        <Row a="Team" b="hired 4 engineers" />
        <Row a="Price" b="$29 → $24" />
        <Row a="Orders" b="212 this week" />
        <Row a="Ads" b="3 new TikToks live" />
        <View style={s.repRule} />
        <Text style={s.repTag}>THE GAP</Text>
        <Text style={s.repLine}>Nobody ships in under 5 days. You can.</Text>
        <Text style={[s.repTag, { marginTop: 6 }]}>TONIGHT'S FUNNEL</Text>
        <Text style={s.repLine}>2 Discords · 600 people → 30 clicks → 3 sales</Text>
        <View style={s.repRule} />
        <Row a={TEAM} b="no price · no store" bold />
      </View>
    );
  }
  if (m.kind === 'store') {
    return (
      <View style={s.left}>
        <Text style={[s.name, { color: C.redSoft }]}>{BOT}</Text>
        <Pressable onPress={onStore} style={s.store} accessibilityLabel="Open the store on Whop">
          <Text style={s.storeTag}>WHOP STORE · LIVE</Text>
          <Text style={s.storeTitle}>Aura desk lamp</Text>
          <Text style={s.storeSub}>{TEAM} · ships in 3 days</Text>
          <View style={s.storeBtn}><Text style={s.storeBtnText}>{hasLink ? 'Show checkout code' : 'Open store'}</Text></View>
        </Pressable>
      </View>
    );
  }
  const isBot = m.who === BOT;
  return (
    <View style={s.left}>
      <Text style={[s.name, isBot && { color: C.redSoft }]}>{m.who}</Text>
      <View style={[s.bubble, s.theirs]}><Text style={s.bubbleText}>{m.text}</Text></View>
    </View>
  );
}

function Row({ a, b, bold }) {
  return (
    <View style={s.repRow}>
      <Text style={[s.repCell, bold && s.repBold]}>{a}</Text>
      <Text style={[s.repCell, s.repRight, bold && s.repBold]}>{b}</Text>
    </View>
  );
}

const TOP = Platform.OS === 'android' ? 40 : 58;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  home: { paddingHorizontal: 24, paddingTop: TOP, paddingBottom: 40 },
  wordmark: { color: C.text, fontSize: 72, fontWeight: '900', letterSpacing: -3 },
  tagline: { color: C.soft, fontSize: 19, lineHeight: 26, marginTop: 10 },
  homeBtn: { minHeight: 56, borderRadius: 16, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  homeBtnAlt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#5A5A5F' },
  homeBtnText: { color: '#000000', fontSize: 17, fontWeight: '700' },
  homeFoot: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 18, letterSpacing: 1 },

  header: { paddingHorizontal: 16, paddingTop: TOP, paddingBottom: 10,
    backgroundColor: C.bar, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { color: C.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  subtitle: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 1 },
  callNow: { position: 'absolute', right: 14, top: TOP - 4, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  callNowText: { color: '#000000', fontSize: 14, fontWeight: '800' },
  revRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  revenue: { color: C.text, fontSize: 64, fontWeight: '800', letterSpacing: -2, lineHeight: 68 },
  revCaption: { color: C.muted, fontSize: 14, flexShrink: 1 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  meterTag: { color: C.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  meterTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#2C2C2E', overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3 },
  meterLabel: { fontSize: 12, fontWeight: '600', minWidth: 78, textAlign: 'right' },

  list: { paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  left: { alignSelf: 'flex-start', maxWidth: '84%', gap: 4 },
  name: { color: C.muted, fontSize: 12, fontWeight: '600', paddingLeft: 12 },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  theirs: { backgroundColor: C.bubble },
  mine: { alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: C.blue },
  bubbleText: { color: C.text, fontSize: 16, lineHeight: 21 },

  voice: { backgroundColor: C.bubble, paddingLeft: 10, paddingVertical: 10, gap: 10 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#000000', fontSize: 16, fontWeight: '700' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 30 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: C.soft },
  dur: { color: '#C7C7CC', fontSize: 13 },
  transcript: { color: C.soft, fontSize: 15, lineHeight: 20, paddingLeft: 4, maxWidth: 270 },

  report: { alignSelf: 'flex-start', width: '90%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 5 },
  repTag: { color: '#4A4A4F', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  repBig: { color: '#0A0A0A', fontSize: 96, fontWeight: '800', letterSpacing: -4, lineHeight: 96 },
  repCap: { color: '#3A3A3E', fontSize: 14, fontWeight: '500' },
  repRule: { height: 2, backgroundColor: '#0A0A0A', marginVertical: 6 },
  repRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  repCell: { color: '#0A0A0A', fontSize: 15, flexShrink: 1 },
  repRight: { textAlign: 'right' },
  repBold: { fontWeight: '800' },
  repLine: { color: '#0A0A0A', fontSize: 16, fontWeight: '600', lineHeight: 21 },

  store: { backgroundColor: '#1C1C1E', borderRadius: 18, padding: 14, gap: 3, minWidth: 250 },
  storeTag: { color: C.green, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  storeTitle: { color: C.text, fontSize: 19, fontWeight: '700', marginTop: 4 },
  storeSub: { color: C.muted, fontSize: 14 },
  storeBtn: { marginTop: 10, minHeight: 44, borderRadius: 12, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  storeBtnText: { color: '#000000', fontSize: 15, fontWeight: '700' },

  pay: { alignSelf: 'center', backgroundColor: '#0E2A16', borderColor: '#1F5A30', borderWidth: 1,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginVertical: 6, alignItems: 'center' },
  payTitle: { color: '#D3F9DC', fontSize: 14, fontWeight: '600' },
  paySub: { color: '#A8E6B7', fontSize: 13, marginTop: 1 },

  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 30 : 12 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: '#3A3A3C', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, color: C.text, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sendArrow: { color: C.text, fontSize: 22, fontWeight: '800', lineHeight: 26 },

  callWrap: { flex: 1, backgroundColor: '#0B0B0D', paddingHorizontal: 28, paddingTop: 110, paddingBottom: 70, alignItems: 'center' },
  callSmall: { color: '#C7C7CC', fontSize: 17 },
  callName: { color: C.text, fontSize: 40, fontWeight: '700', marginVertical: 8, textAlign: 'center' },
  callBtns: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingHorizontal: 18 },
  callCol: { alignItems: 'center', gap: 10 },
  callBtn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  callBtnIcon: { color: '#000000', fontSize: 30, fontWeight: '800' },
  callBtnLabel: { color: C.soft, fontSize: 14 },
  caption: { color: C.text, fontSize: 26, fontWeight: '700', lineHeight: 32, textAlign: 'center' },
  heard: { color: C.muted, fontSize: 15, lineHeight: 20, textAlign: 'center', marginTop: 14 },
  talk: { alignSelf: 'stretch', minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  talkText: { color: '#000000', fontSize: 18, fontWeight: '800' },

  qrWrap: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  qrTitle: { color: '#0A0A0A', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  qrSub: { color: '#3A3A3E', fontSize: 16 },
  qr: { width: 280, height: 280, marginVertical: 18 },
  qrBtn: { minHeight: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' },
  qrBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  qrClose: { minHeight: 44, justifyContent: 'center' },
  qrCloseText: { color: '#3A3A3E', fontSize: 15, fontWeight: '600' },
});
