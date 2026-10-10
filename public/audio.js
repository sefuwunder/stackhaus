// stackhaus — tiny synthesized sound kit. Zero deps, WebAudio only.
let ctx = null, master = null, muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function env(g, t, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

function tone(freq, { type = "sine", peak = 0.5, decay = 0.3, slide = 0 } = {}) {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + decay);
  env(g, t, peak, decay);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + decay + 0.05);
}

function noise({ peak = 0.5, decay = 0.4, low = 400, high = 4000 } = {}) {
  if (muted) return;
  const c = ac(), t = c.currentTime;
  const len = Math.ceil(c.sampleRate * decay);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "bandpass";
  f.frequency.value = (low + high) / 2; f.Q.value = 0.7;
  const g = c.createGain(); env(g, t, peak, decay);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t);
}

export const sfx = {
  click() { tone(660, { type: "triangle", peak: 0.25, decay: 0.08 }); },
  lock() { tone(95, { peak: 0.7, decay: 0.25, slide: -40 }); noise({ peak: 0.25, decay: 0.12, low: 200, high: 900 }); },
  creak() { tone(180 + Math.random() * 120, { type: "sawtooth", peak: 0.12, decay: 0.5, slide: -60 }); },
  chime() { tone(523, { type: "triangle", peak: 0.4, decay: 0.5 }); setTimeout(() => tone(784, { type: "triangle", peak: 0.4, decay: 0.7 }), 130); },
  crash() {
    noise({ peak: 0.8, decay: 1.2, low: 150, high: 2500 });
    tone(70, { peak: 0.8, decay: 1.0, slide: -30 });
    setTimeout(() => noise({ peak: 0.4, decay: 0.8, low: 300, high: 1800 }), 180);
  },
  toggleMute() { muted = !muted; return muted; },
  get muted() { return muted; },
};
