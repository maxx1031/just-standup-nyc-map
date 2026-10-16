/* Motion core — sensor input, punch / shot detection, sounds, haptics, device identity.
   Used by play.html (player UI). motion-lab.html (developer UI) keeps its own copy of the
   detectors but shares the same localStorage keys, so teaching on one page carries over. */
window.Motion = (() => {
  const G = 9.81;
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const TH = { punch: 16, up: 8, flick: 450, ff: 0.35 };
  const S = { running: false, mode: 'off', buf: [], gLP: null, got: 0, teach: null,
    p: { pending: null, last: -1e9 }, s: { pending: null, last: -1e9 } };
  const on = { punch: null, shot: null, sample: null };

  /* ---------- punch: trigger on linear accel, classify by nearest taught sample ---------- */
  let TPL = (o => ({ straight: o.straight || [], upper: o.upper || [] }))(store.get('punchTpl', {}));
  const taught = () => TPL.straight.length >= 2 && TPL.upper.length >= 2;

  function punchStep(s) {
    const P = S.p;
    if (!P.pending) {
      // 650 ms lockout after a punch starts: pulling the fist back would otherwise count as a second punch
      if (s.la > TH.punch && s.t - P.last > 650) P.pending = { t0: s.t, peak: s.la, on: norm(s.a) };
      return;
    }
    if (s.la > P.pending.peak) P.pending.peak = s.la;
    if (s.t - P.pending.t0 < 200) return;
    const { t0, peak } = P.pending, dir = P.pending.on; P.pending = null; P.last = t0;
    // features: direction at onset (3) + total rotation around onset in device axes (3) + up/down component (1)
    const rot = [0, 0, 0]; let prev = null;
    for (const q of S.buf) {
      if (q.t < t0 - 150 || q.t > s.t) continue;
      if (prev != null) for (let i = 0; i < 3; i++) rot[i] += q.w[i] * (q.t - prev) / 1000;
      prev = q.t;
    }
    const up = dot(dir, norm(s.g));   // > 0 = moving up (gravity reading points up on both iOS and Android)
    const f = [...dir, ...rot.map(v => v / 180), -up];
    const dist = k => TPL[k].length ? Math.min(...TPL[k].map(x => Math.hypot(...x.map((v, i) => v - f[i])))) : null;
    const d = { straight: dist('straight'), upper: dist('upper') };
    let kind = S.teach, how;
    if (kind) {
      TPL[kind].push(f.map(v => +v.toFixed(3)));
      if (TPL[kind].length > 8) TPL[kind].shift();
      store.set('punchTpl', TPL); how = 'teach';
    } else if (taught()) {
      kind = d.straight <= d.upper ? 'straight' : 'upper'; how = 'nearest';
    } else {
      kind = up > 0.4 ? 'upper' : 'straight'; how = 'rule';
    }
    const info = { g: +(peak / G).toFixed(2), how, d, up: +up.toFixed(2), turn: Math.round(len(rot)) };
    emit({ type: 'punch', kind, ...info });
    on.punch && on.punch(kind, info);
  }

  /* ---------- shot: upward push, then look back for dip / wrist flick / airtime ---------- */
  function shotStep(s) {
    const T = S.s;
    if (!T.pending) {
      if (s.v > TH.up && s.t - T.last > 1000) T.pending = { t0: s.t };
      return;
    }
    if (s.t - T.pending.t0 < 700) return;
    const t0 = T.pending.t0; T.pending = null; T.last = s.t;
    let dip = 0, flick = 0, airStart = null, air = 0;
    for (const q of S.buf) {
      if (q.t < t0 - 600) continue;
      if (q.t <= t0) dip = Math.min(dip, q.v);
      if (q.t >= t0 - 100 && q.t <= t0 + 450) flick = Math.max(flick, q.wm);
      if (q.agm < TH.ff) { if (airStart == null) airStart = q.t; air = Math.max(air, q.t - airStart); } else airStart = null;
    }
    const info = { swish: dip < -3 && flick > TH.flick * 1.4, jump: air > 80, dip: +dip.toFixed(1), flick: Math.round(flick), air: Math.round(air) };
    emit({ type: 'shot', ...info });
    on.shot && on.shot(info);
  }

  function process(raw) {
    const t = raw.t, ag = raw.ag;
    let a = raw.a, g;
    if (a) g = [ag[0] - a[0], ag[1] - a[1], ag[2] - a[2]];
    else {
      S.gLP = S.gLP ? S.gLP.map((v, i) => v + (ag[i] - v) * 0.08) : ag.slice();
      g = S.gLP; a = [ag[0] - g[0], ag[1] - g[1], ag[2] - g[2]];
    }
    const s = { t, a, ag, g, w: raw.w, la: len(a), agm: len(ag) / G, wm: len(raw.w), v: dot(a, norm(g)) };
    S.buf.push(s);
    while (S.buf.length && t - S.buf[0].t > 4500) S.buf.shift();
    S.got++;
    on.sample && on.sample(s);
    // raw sample [t, ax, ay, az, agx, agy, agz, wx, wy, wz] so the laptop can redraw every signal
    if (link.on) link.frames.push([Math.round(t), ...a.map(x => +x.toFixed(3)), ...ag.map(x => +x.toFixed(3)), ...raw.w.map(x => +x.toFixed(1))]);
    if (S.mode === 'punch') punchStep(s);
    else if (S.mode === 'shot') shotStep(s);
  }
  function onMotion(e) {
    const A = e.acceleration, AG = e.accelerationIncludingGravity, R = e.rotationRate;
    if (!AG || AG.x == null) return;
    process({ t: performance.now(), a: A && A.x != null ? [A.x, A.y, A.z] : null, ag: [AG.x, AG.y, AG.z],
      w: R && R.beta != null ? [R.beta, R.gamma, R.alpha] : [0, 0, 0] });
  }

  /* Call from a tap. Resolves to '' on success, or a message saying what went wrong. */
  async function start() {
    initAudio();
    if (typeof DeviceMotionEvent === 'undefined') return 'This browser has no motion sensors. Open the link on your phone in Safari or Chrome.';
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        if (await DeviceMotionEvent.requestPermission() !== 'granted')
          return 'Motion access was denied. iPhone: Settings → Safari → Advanced → Website Data, delete this site, reload and tap Allow.';
      } catch (err) { return 'Permission request failed: ' + err.message; }
    }
    if (!S.running) addEventListener('devicemotion', onMotion);
    S.running = true;
    try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) {}
    const before = S.got;
    await new Promise(r => setTimeout(r, 1500));
    if (S.got === before) return 'No sensor data yet. Make sure you opened the https link on a phone.';
    return '';
  }
  function setMode(m) { S.mode = m; S.p.pending = S.s.pending = null; }

  /* ---------- sounds (synthesised, no files) ---------- */
  let ac = null, noiseBuf = null, master = null;
  function initAudio() {
    // iPhone: play even with the ringer switch on silent (Safari 17+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume();
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (!master) {   // soft-clip limiter: keeps attacks crisp, never distorts harshly
        const pre = ac.createGain(), ws = ac.createWaveShaper(), c = new Float32Array(1025);
        for (let i = 0; i < 1025; i++) c[i] = Math.tanh(2.2 * (i / 512 - 1));
        pre.gain.value = 0.5; ws.curve = c; pre.connect(ws).connect(ac.destination); master = pre;
      }
    } catch (e) {}
  }
  function noise(t, o, { type = 'bandpass', f0 = 1000, f1 = f0, q = 0.8, vol = 1, dur = 0.15 }) {
    const n = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    n.buffer = noiseBuf; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(fl).connect(g).connect(o); n.start(t); n.stop(t + dur + 0.05);
  }
  function tone(t, o, { type = 'sine', f0 = 440, f1 = f0, vol = 0.8, dur = 0.2 }) {
    const x = ac.createOscillator(), g = ac.createGain();
    x.type = type; x.frequency.setValueAtTime(f0, t); x.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    x.connect(g).connect(o); x.start(t); x.stop(t + dur + 0.05);
  }
  function cheer(t, o, speed, pitch) {
    const n = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), d = 1.1 / speed;
    n.buffer = noiseBuf; n.loop = true; fl.type = 'bandpass'; fl.frequency.value = 1100 * pitch; fl.Q.value = 0.6;
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.15 / speed); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    n.connect(fl).connect(g).connect(o); n.start(t); n.stop(t + d + 0.1);
  }
  function hold(t, o, { type = 'sawtooth', f = 440, dur = 0.3, vol = 0.3, lp = 2500, det = 6 }) {   // brass-like sustained note
    const g = ac.createGain(), fl = ac.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = lp;
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
    [0, det].forEach(d => { const x = ac.createOscillator(); x.type = type; x.frequency.value = f; x.detune.value = d; x.connect(fl); x.start(t); x.stop(t + dur + 0.1); });
    fl.connect(g).connect(o);
  }
  const SFX = {
    pa:   (t, o) => { noise(t, o, { f0: 2000, dur: 0.12 }); tone(t, o, { f0: 220, f1: 45, dur: 0.18 }); },
    sou:  (t, o) => { noise(t, o, { f0: 400, f1: 3500, q: 2, vol: 0.6, dur: 0.12 }); noise(t + 0.12, o, { f0: 1800, dur: 0.1 }); tone(t + 0.12, o, { f0: 200, f1: 50, dur: 0.15 }); },
    hey2: (t, o) => cheer(t, o, 2, 2),
    fanfare: (t, o) => [[523, 0, .11], [659, .12, .11], [784, .24, .11], [1047, .36, .6]].forEach(([f, d, l]) => { hold(t + d, o, { f, dur: l }); hold(t + d, o, { f: f / 2, dur: l, vol: .15 }); }),
    done: (t, o) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, o, { type: 'triangle', f0: f, vol: 0.4, dur: i === 3 ? 0.4 : 0.1 }))
  };
  // chosen 2026-10-16: straight = 啪 pa, uppercut = 嗖啪 sou, shot = cheer ×2
  const SND = { straight: 'pa', upper: 'sou', shot: 'hey2', done: 'done', win: 'fanfare' };
  function play(name) {
    if (!ac || !SFX[name]) return;
    const out = ac.createGain(); out.gain.value = 0.9; out.connect(master);
    SFX[name](ac.currentTime, out);
  }

  /* ---------- haptics: Android vibrates; iPhone gets the iOS 18 switch-checkbox tick at best ---------- */
  let hapLabel = null;
  function iosTap() {
    if (!hapLabel) {
      hapLabel = document.createElement('label'); hapLabel.setAttribute('aria-hidden', 'true'); hapLabel.style.display = 'none';
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('switch', '');
      hapLabel.appendChild(inp); document.body.appendChild(hapLabel);
    }
    hapLabel.click();
  }
  function haptic(vib) {
    if (!vib) return;
    try {
      if (navigator.vibrate) { navigator.vibrate(vib); return; }
      const pat = Array.isArray(vib) ? vib : [vib];
      let t = 0;
      pat.forEach((d, i) => { if (i % 2 === 0) setTimeout(iosTap, t); t += d + (i % 2 === 0 ? 40 : 0); });
    } catch (e) {}
  }

  /* ---------- device identity: a random id kept on this phone, plus a name you choose.
     The laptop server logs it, so later the big screen can pair with exactly this phone. ---------- */
  function device() {
    let d = store.get('device', null);
    if (!d) {
      const ua = navigator.userAgent, kind = /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : 'Device';
      d = { id: Math.random().toString(36).slice(2, 6).toUpperCase(), name: kind };
      store.set('device', d);
    }
    return d;
  }
  function rename(name) { const d = device(); d.name = name.trim().slice(0, 24) || d.name; store.set('device', d); return hello(); }
  function hello(page = document.title) {
    const d = device();
    return fetch('/hello', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...d, page, ua: navigator.userAgent }) }).then(r => r.ok).catch(() => false);
  }

  /* ---------- live link to the laptop: frames + events, POSTed every 100 ms ---------- */
  const link = { on: false, frames: [], events: [], busy: false };
  function emit(e) { if (link.on) link.events.push({ ...e, ts: Math.round(performance.now()) }); }   // ts, not t: state events use t for the title
  function flush() {
    if (link.busy || (!link.frames.length && !link.events.length)) return;
    const body = JSON.stringify({ frames: link.frames.splice(0), events: link.events.splice(0), sent: Date.now() });
    link.busy = true;
    fetch('/push?id=' + device().id, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .catch(() => {}).finally(() => { link.busy = false; });
  }
  function startLink() { if (!link.on) { link.on = true; setInterval(flush, 100); } }

  return { TH, S, start, setMode, process, emit, startLink,
    teach(kind) { S.teach = kind; },
    resetTeaching() { TPL = { straight: [], upper: [] }; store.set('punchTpl', TPL); },
    taught, counts: () => ({ straight: TPL.straight.length, upper: TPL.upper.length }),
    on(ev, fn) { on[ev] = fn; },
    templates: () => TPL,
    initAudio, play, SND, haptic, device, rename, hello };
})();
