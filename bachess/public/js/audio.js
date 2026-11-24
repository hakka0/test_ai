// WebAudio 합성 효과음 + 가벼운 BGM (외부 파일 없음)
let ac = null, master = null, sfxG = null, musG = null, noiseBuf = null;
let muted = false, musicOn = false, musicTimer = null, step = 0, nextT = 0, mode = 'prep';
let vol = { sfx: 0.8, music: 0.5 };

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
  sfxG = ac.createGain(); sfxG.gain.value = 0.55 * vol.sfx; sfxG.connect(master);
  musG = ac.createGain(); musG.gain.value = 0.16 * vol.music; musG.connect(master);
  const len = ac.sampleRate * 0.6;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 1; }
export function isMuted() { return muted; }
export function setVolumes(s, m) { vol.sfx = s; vol.music = m; if (sfxG) sfxG.gain.value = 0.55 * s; if (musG) musG.gain.value = 0.16 * m; }

function noise(dur, type, freq, gain, q = 1, sweepTo) {
  if (!ac || muted) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur); f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxG);
  src.start(t, Math.random() * 0.2); src.stop(t + dur + 0.02);
}
function tone(type, f0, f1, dur, gain, delay = 0, dest) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + dur + 0.02);
}

export function sfx(name) {
  if (!ac || muted) return;
  switch (name) {
    case 'shot': noise(0.06, 'highpass', 1800, 0.18); tone('square', 180, 70, 0.05, 0.05); break;
    case 'sg': noise(0.16, 'lowpass', 2400, 0.32, 1, 500); tone('sawtooth', 120, 50, 0.1, 0.1); break;
    case 'sr': noise(0.22, 'bandpass', 2600, 0.3, 2, 600); tone('sawtooth', 300, 60, 0.18, 0.08); break;
    case 'big': noise(0.3, 'bandpass', 2000, 0.35, 1.5, 300); tone('sawtooth', 500, 80, 0.25, 0.12); break;
    case 'hit': noise(0.04, 'bandpass', 900, 0.1, 2); break;
    case 'crit': noise(0.07, 'bandpass', 1400, 0.18, 2); tone('triangle', 900, 1500, 0.08, 0.06); break;
    case 'boom': noise(0.45, 'lowpass', 900, 0.5, 1, 90); tone('sine', 140, 40, 0.4, 0.3); break;
    case 'skill': tone('triangle', 420, 1300, 0.28, 0.1); tone('sine', 840, 2000, 0.28, 0.04, 0.03); break;
    case 'heal': tone('sine', 880, 880, 0.12, 0.08); tone('sine', 1320, 1320, 0.2, 0.08, 0.09); break;
    case 'barrier': noise(0.06, 'highpass', 4000, 0.1); tone('sine', 1500, 1100, 0.1, 0.05); break;
    case 'break': noise(0.2, 'highpass', 3000, 0.25); tone('triangle', 900, 200, 0.2, 0.08); break;
    case 'down': tone('sine', 360, 70, 0.3, 0.12); break;
    case 'click': tone('square', 900, 700, 0.04, 0.05); break;
    case 'buy': tone('triangle', 660, 660, 0.08, 0.1); tone('triangle', 990, 990, 0.14, 0.1, 0.07); break;
    case 'sell': tone('triangle', 800, 500, 0.14, 0.1); break;
    case 'roll': tone('triangle', 500, 800, 0.06, 0.07); tone('triangle', 700, 1000, 0.06, 0.07, 0.06); break;
    case 'merge': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.16, 0.12, i * 0.07)); break;
    case 'deny': tone('square', 200, 150, 0.12, 0.07); break;
    case 'start': tone('sawtooth', 220, 440, 0.25, 0.1); tone('triangle', 660, 660, 0.2, 0.1, 0.15); break;
    case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => tone('triangle', f, f, 0.22, 0.14, i * 0.1)); break;
    case 'lose': [440, 392, 330, 262].forEach((f, i) => tone('triangle', f, f, 0.26, 0.12, i * 0.14)); break;
  }
}

// ---- BGM ----
const CHORDS = [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]]; // Fmaj7 G Em7 Am
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function schedule() {
  if (!ac || !musicOn) return;
  const bpm = mode === 'battle' ? 128 : 104;
  const stepDur = 60 / bpm / 4;
  while (nextT < ac.currentTime + 0.4) {
    const bar = Math.floor(step / 16) % 4, s16 = step % 16;
    const ch = CHORDS[bar];
    const t = Math.max(nextT, ac.currentTime) - ac.currentTime;
    if (s16 % 2 === 0 || mode === 'battle') {
      const n = ch[(s16 >> 1) % 4] + (s16 % 8 >= 4 ? 12 : 0);
      tone('triangle', mtof(n + 12), mtof(n + 12), 0.2, 0.5, t, musG);
    }
    if (s16 === 0) { tone('sine', mtof(ch[0] - 12), mtof(ch[0] - 12), stepDur * 14, 0.9, t, musG); }
    if (s16 === 0 || s16 === 8) { ch.forEach((n) => tone('sine', mtof(n), mtof(n), stepDur * 7, 0.18, t, musG)); }
    if (mode === 'battle' && s16 % 4 === 2) {
      // 하이햇
      const src = ac.createBufferSource(); src.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ac.createGain(); const tt = ac.currentTime + t; g.gain.setValueAtTime(0.4, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
      src.connect(f); f.connect(g); g.connect(musG); src.start(tt); src.stop(tt + 0.06);
    }
    if (mode === 'battle' && s16 % 8 === 0) tone('sine', 120, 45, 0.18, 1.2, t, musG);
    step++; nextT += stepDur;
  }
}
export function startMusic() {
  if (!ac || musicOn) return;
  musicOn = true; step = 0; nextT = ac.currentTime + 0.1;
  musicTimer = setInterval(schedule, 120);
}
export function stopMusic() { musicOn = false; clearInterval(musicTimer); }
export function setMusicMode(m) { mode = m; }
export function musicRunning() { return musicOn; }
