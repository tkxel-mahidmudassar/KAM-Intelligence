"use client";

const AMBIENT_MUSIC_MUTED_KEY = "kamazing:ambient-music-muted";

type AmbientMusicState = {
  context: AudioContext;
  master: GainNode;
  nodes: Array<OscillatorNode | GainNode | BiquadFilterNode | StereoPannerNode>;
  timers: number[];
};

declare global {
  interface Window {
    __kamazingAmbientMusic?: AmbientMusicState;
    __kamazingAmbientPrimerAttached?: boolean;
  }
}

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || null;
}

export function isAmbientMusicMuted() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AMBIENT_MUSIC_MUTED_KEY) === "true";
}

function buildAmbientMusic() {
  const AudioContextClass = audioContextClass();
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  const lowpass = context.createBiquadFilter();
  const orchestraBus = context.createGain();
  const now = context.currentTime;
  const nodes: AmbientMusicState["nodes"] = [master, lowpass, orchestraBus];
  const timers: number[] = [];

  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(940, now);
  lowpass.Q.setValueAtTime(0.42, now);

  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.052, now + 3.6);
  orchestraBus.gain.setValueAtTime(0.24, now);
  lowpass.connect(master);
  orchestraBus.connect(master);
  master.connect(context.destination);

  const voices = [
    { frequency: 73.42, type: "sine" as OscillatorType, gain: 0.3, pan: -0.2 },
    { frequency: 146.83, type: "triangle" as OscillatorType, gain: 0.19, pan: -0.34 },
    { frequency: 220.0, type: "triangle" as OscillatorType, gain: 0.15, pan: 0.18 },
    { frequency: 293.66, type: "sine" as OscillatorType, gain: 0.075, pan: 0.34 },
    { frequency: 440.0, type: "sine" as OscillatorType, gain: 0.032, pan: -0.08 },
  ];
  const activeVoices: Array<{ oscillator: OscillatorNode; gain: GainNode; baseGain: number; pan: StereoPannerNode }> = [];

  voices.forEach((voice, index) => {
    const oscillator = context.createOscillator();
    const voiceGain = context.createGain();
    const panner = context.createStereoPanner();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const detuneLfo = context.createOscillator();
    const detuneGain = context.createGain();

    oscillator.type = voice.type;
    oscillator.frequency.setValueAtTime(voice.frequency, now);
    oscillator.detune.setValueAtTime(index % 2 === 0 ? -3 : 4, now);

    voiceGain.gain.setValueAtTime(voice.gain, now);
    panner.pan.setValueAtTime(voice.pan, now);

    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.028 + index * 0.007, now);
    lfoGain.gain.setValueAtTime(voice.gain * 0.18, now);
    lfo.connect(lfoGain);
    lfoGain.connect(voiceGain.gain);

    detuneLfo.type = "sine";
    detuneLfo.frequency.setValueAtTime(0.014 + index * 0.004, now);
    detuneGain.gain.setValueAtTime(3.5 + index * 0.5, now);
    detuneLfo.connect(detuneGain);
    detuneGain.connect(oscillator.detune);

    oscillator.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(lowpass);

    oscillator.start(now);
    lfo.start(now);
    detuneLfo.start(now);
    activeVoices.push({ oscillator, gain: voiceGain, baseGain: voice.gain, pan: panner });
    nodes.push(oscillator, voiceGain, panner, lfo, lfoGain, detuneLfo, detuneGain);
  });

  const chordProgression = [
    [73.42, 146.83, 220.0, 293.66, 440.0],
    [58.27, 116.54, 174.61, 233.08, 349.23],
    [87.31, 174.61, 261.63, 349.23, 523.25],
    [65.41, 130.81, 196.0, 261.63, 392.0],
    [69.3, 138.59, 207.65, 277.18, 415.3],
  ];
  let chordIndex = 0;
  const advanceChord = () => {
    chordIndex = (chordIndex + 1) % chordProgression.length;
    const changeAt = context.currentTime + 0.1;
    const nextChord = chordProgression[chordIndex];

    activeVoices.forEach((voice, index) => {
      voice.oscillator.frequency.cancelScheduledValues(changeAt);
      voice.oscillator.frequency.setTargetAtTime(nextChord[index], changeAt, 2.3);
      voice.gain.gain.cancelScheduledValues(changeAt);
      voice.gain.gain.setTargetAtTime(voice.baseGain * (chordIndex === 2 ? 1.18 : 0.92), changeAt, 1.6);
      voice.gain.gain.setTargetAtTime(voice.baseGain, changeAt + 4.2, 2.4);
      voice.pan.pan.setTargetAtTime((index % 2 === 0 ? -0.18 : 0.18) * Math.min(chordIndex + 1, 3), changeAt, 3.1);
    });

    lowpass.frequency.cancelScheduledValues(changeAt);
    lowpass.frequency.setTargetAtTime(chordIndex === 2 ? 1380 : chordIndex === 4 ? 820 : 980, changeAt, 2.8);
    orchestraBus.gain.setTargetAtTime(chordIndex === 2 ? 0.33 : 0.22, changeAt, 1.9);
  };

  const motifVariants = [
    [293.66, 440.0, 523.25, 587.33, 523.25, 440.0],
    [261.63, 392.0, 493.88, 523.25, 493.88, 392.0],
    [349.23, 440.0, 523.25, 659.25, 587.33, 440.0],
  ];
  let motifIndex = 0;
  const playMotif = () => {
    const base = context.currentTime + 0.04;
    const motif = motifVariants[motifIndex % motifVariants.length];
    motifIndex += 1;
    motif.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const panner = context.createStereoPanner();
      const start = base + index * 0.58;
      const end = start + 1.65;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -2 : 3, start);

      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.062, start + 0.035);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(index % 2 === 0 ? -0.24 : 0.24, start);

      oscillator.connect(noteGain);
      noteGain.connect(panner);
      panner.connect(orchestraBus);
      oscillator.start(start);
      oscillator.stop(end + 0.08);
      nodes.push(oscillator, noteGain, panner);
    });
  };

  const playCelloOstinato = () => {
    const start = context.currentTime + 0.03;
    const root = chordProgression[chordIndex][0];
    const pattern = [0, 0.82, 1.64, 2.46, 3.7, 4.52];

    pattern.forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const pulseGain = context.createGain();
      const pulseFilter = context.createBiquadFilter();
      const noteAt = start + offset;
      const frequency = root / (index % 3 === 2 ? 1.5 : 2);

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteAt);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, noteAt + 0.56);
      pulseFilter.type = "lowpass";
      pulseFilter.frequency.setValueAtTime(210, noteAt);
      pulseGain.gain.setValueAtTime(0.0001, noteAt);
      pulseGain.gain.exponentialRampToValueAtTime(index === 0 ? 0.15 : 0.09, noteAt + 0.035);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, noteAt + 0.72);

      oscillator.connect(pulseFilter);
      pulseFilter.connect(pulseGain);
      pulseGain.connect(lowpass);
      oscillator.start(noteAt);
      oscillator.stop(noteAt + 0.82);
      nodes.push(oscillator, pulseFilter, pulseGain);
    });
  };

  const playPianoArpeggio = () => {
    const base = context.currentTime + 0.03;
    const root = chordProgression[chordIndex][0];
    const run = [root * 4, root * 6, root * 8, root * 12, root * 8, root * 6, root * 5, root * 4];

    run.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const panner = context.createStereoPanner();
      const start = base + index * 0.22;
      const end = start + 1.15;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(Math.min(frequency, 1318.51), start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -3 : 3, start);
      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.07, start + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(index % 2 === 0 ? -0.28 : 0.28, start);

      oscillator.connect(noteGain);
      noteGain.connect(panner);
      panner.connect(orchestraBus);
      oscillator.start(start);
      oscillator.stop(end + 0.04);
      nodes.push(oscillator, noteGain, panner);
    });
  };

  const playStringSwell = () => {
    const start = context.currentTime + 0.02;
    const root = chordProgression[chordIndex][0];
    [root * 2, root * 3, root * 4].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const liftGain = context.createGain();
      const liftFilter = context.createBiquadFilter();
      const panner = context.createStereoPanner();

      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.setTargetAtTime(frequency * 1.005, start + 0.4, 3.5);
      liftFilter.type = "lowpass";
      liftFilter.frequency.setValueAtTime(420, start);
      liftFilter.frequency.exponentialRampToValueAtTime(1450, start + 4.6);
      liftFilter.Q.setValueAtTime(0.38, start);
      liftGain.gain.setValueAtTime(0.0001, start);
      liftGain.gain.exponentialRampToValueAtTime(0.055 / (index + 1), start + 2.1);
      liftGain.gain.exponentialRampToValueAtTime(0.0001, start + 5.5);
      panner.pan.setValueAtTime(index === 0 ? -0.28 : index === 1 ? 0 : 0.28, start);

      oscillator.connect(liftFilter);
      liftFilter.connect(liftGain);
      liftGain.connect(panner);
      panner.connect(orchestraBus);
      oscillator.start(start);
      oscillator.stop(start + 5.7);
      nodes.push(oscillator, liftFilter, liftGain, panner);
    });
  };

  const playPercussiveAccent = () => {
    const start = context.currentTime + 0.02;
    const root = chordProgression[chordIndex][0];
    const hits = [0, 0.36, 0.72, 1.34];

    hits.forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const hitAt = start + offset;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(root * (index === hits.length - 1 ? 1.5 : 1), hitAt);
      oscillator.frequency.exponentialRampToValueAtTime(root * 0.42, hitAt + 0.22);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(index === hits.length - 1 ? 390 : 250, hitAt);
      filter.Q.setValueAtTime(0.9, hitAt);
      gain.gain.setValueAtTime(0.0001, hitAt);
      gain.gain.exponentialRampToValueAtTime(index === hits.length - 1 ? 0.18 : 0.11, hitAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, hitAt + 0.46);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(lowpass);
      oscillator.start(hitAt);
      oscillator.stop(hitAt + 0.4);
      nodes.push(oscillator, filter, gain);
    });
  };

  const playHeroFlourish = () => {
    const base = context.currentTime + 0.04;
    const root = chordProgression[chordIndex][0];
    const notes = [root * 3, root * 4, root * 6, root * 8, root * 6, root * 4];

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const start = base + index * 0.34;
      const end = start + 2.1;

      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(Math.min(frequency, 1174.66), start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -4 : 4, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(-0.32 + index * 0.13, start);

      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(orchestraBus);
      oscillator.start(start);
      oscillator.stop(end + 0.08);
      nodes.push(oscillator, gain, panner);
    });
  };

  playMotif();
  window.setTimeout(playPianoArpeggio, 2200);
  window.setTimeout(playStringSwell, 4400);
  window.setTimeout(playHeroFlourish, 9800);
  timers.push(window.setInterval(advanceChord, 11200));
  timers.push(window.setInterval(playMotif, 16800));
  timers.push(window.setInterval(playCelloOstinato, 5600));
  timers.push(window.setInterval(playPianoArpeggio, 9400));
  timers.push(window.setInterval(playStringSwell, 22400));
  timers.push(window.setInterval(playPercussiveAccent, 7200));
  timers.push(window.setInterval(playHeroFlourish, 31200));

  return { context, master, nodes, timers };
}

export function startAmbientMusic() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;
  try {
    const existing = window.__kamazingAmbientMusic;
    if (existing) {
      void existing.context.resume().catch(() => undefined);
      existing.master.gain.setTargetAtTime(0.052, existing.context.currentTime, 0.9);
      return;
    }

    const state = buildAmbientMusic();
    if (!state) return;
    window.__kamazingAmbientMusic = state;
    void state.context.resume().catch(() => undefined);
  } catch {
    // Browser audio policies can defer playback until the next user gesture.
  }
}

export function stopAmbientMusic() {
  if (typeof window === "undefined") return;
  const state = window.__kamazingAmbientMusic;
  if (!state) return;
  const now = state.context.currentTime;
  state.timers.forEach((timer) => window.clearInterval(timer));
  state.master.gain.cancelScheduledValues(now);
  state.master.gain.setTargetAtTime(0.0001, now, 0.35);
  window.setTimeout(() => {
    state.nodes.forEach((node) => {
      if ("stop" in node) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    });
    void state.context.close();
    if (window.__kamazingAmbientMusic === state) window.__kamazingAmbientMusic = undefined;
  }, 900);
}

export function setAmbientMusicMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AMBIENT_MUSIC_MUTED_KEY, String(muted));
  if (muted) stopAmbientMusic();
  else {
    primeAmbientMusicOnInteraction();
    startAmbientMusic();
  }
}

export function primeAmbientMusicOnInteraction() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;

  if (window.__kamazingAmbientPrimerAttached) {
    startAmbientMusic();
    return;
  }

  window.__kamazingAmbientPrimerAttached = true;

  const cleanup = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("click", start);
    window.removeEventListener("touchstart", start);
    window.removeEventListener("keydown", start);
    window.__kamazingAmbientPrimerAttached = false;
  };

  const start = () => {
    startAmbientMusic();
    const state = window.__kamazingAmbientMusic;
    if (!state) return;

    void state.context
      .resume()
      .then(() => {
        if (state.context.state === "running") cleanup();
      })
      .catch(() => undefined);
  };

  window.addEventListener("pointerdown", start, { passive: true });
  window.addEventListener("click", start, { passive: true });
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("keydown", start);
  start();
}
