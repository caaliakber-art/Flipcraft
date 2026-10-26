// Realistic, quiet page-turn sound, synthesised in the browser (no audio files).
// Three layers, like a real sheet of paper:
//   1. swish  - soft airy rustle while the page travels
//   2. texture - faint paper crackle riding on the swish
//   3. settle - low, soft "flap" as the page lands
// Every turn varies slightly so it never sounds like a loop.

let ctx;
const VOLUME = 0.12; // overall loudness; raise towards 0.2 if too soft

const rand = (a, b) => a + Math.random() * (b - a);

function noiseBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // slightly "pink" noise: softer, less hissy than white noise
    const white = Math.random() * 2 - 1;
    last = 0.97 * last + 0.03 * white;
    d[i] = white * 0.55 + last * 3.2;
  }
  return buf;
}

function crackleBuffer(c, seconds) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  const n = d.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const density = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.0045;
    if (Math.random() < density) {
      const amp = rand(0.25, 1) * (Math.random() < 0.5 ? -1 : 1);
      const len = Math.floor(rand(0.0006, 0.0025) * c.sampleRate);
      for (let k = 0; k < len && i + k < n; k++) d[i + k] += amp * Math.exp(-k / (len / 4));
    }
  }
  return buf;
}

function swell(gain, now, dur, peak, peakAt) {
  const g = gain.gain;
  g.setValueAtTime(0.0001, now);
  g.linearRampToValueAtTime(peak, now + dur * peakAt);
  g.setTargetAtTime(0.0001, now + dur * peakAt, dur * 0.22);
}

export function playFlip() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const c = ctx;
    const now = c.currentTime + 0.005;
    const dur = rand(0.42, 0.55);
    const tone = rand(0.85, 1.15);

    const master = c.createGain();
    master.gain.value = VOLUME;
    master.connect(c.destination);

    // 1. swish
    const sw = c.createBufferSource();
    sw.buffer = noiseBuffer(c, dur + 0.3);
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350 * tone;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(1800 * tone, now);
    lp.frequency.linearRampToValueAtTime(4200 * tone, now + dur * 0.4);
    lp.frequency.exponentialRampToValueAtTime(1200 * tone, now + dur);
    const swG = c.createGain();
    swell(swG, now, dur, 0.9, 0.38);
    sw.connect(hp).connect(lp).connect(swG).connect(master);
    sw.start(now);
    sw.stop(now + dur + 0.3);

    // 2. paper texture
    const cr = c.createBufferSource();
    cr.buffer = crackleBuffer(c, dur);
    const crBp = c.createBiquadFilter();
    crBp.type = "bandpass";
    crBp.frequency.value = 3200 * tone;
    crBp.Q.value = 0.9;
    const crG = c.createGain();
    crG.gain.value = 0.35;
    cr.connect(crBp).connect(crG).connect(master);
    cr.start(now);

    // 3. settle
    const st = c.createBufferSource();
    st.buffer = noiseBuffer(c, 0.25);
    const stLp = c.createBiquadFilter();
    stLp.type = "lowpass";
    stLp.frequency.value = 520 * tone;
    stLp.Q.value = 0.8;
    const stG = c.createGain();
    const at = now + dur * 0.82;
    stG.gain.setValueAtTime(0.0001, at);
    stG.gain.linearRampToValueAtTime(0.55, at + 0.012);
    stG.gain.setTargetAtTime(0.0001, at + 0.012, 0.045);
    st.connect(stLp).connect(stG).connect(master);
    st.start(at);
    st.stop(at + 0.25);
  } catch {
    /* audio unavailable */
  }
}
