let ctx;

export function playFlip() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const dur = 0.42;
    const now = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      const env = t < 0.08 ? t / 0.08 : Math.pow(1 - t, 2.2);
      d[i] = (Math.random() * 2 - 1) * env * (0.6 + 0.4 * Math.sin(t * 40));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.exponentialRampToValueAtTime(700, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, now);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
  } catch {
    /* audio unavailable */
  }
}
