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
  const shimmerBus = context.createGain();
  const now = context.currentTime;
  const nodes: AmbientMusicState["nodes"] = [master, lowpass, shimmerBus];
  const timers: number[] = [];

  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(1120, now);
  lowpass.Q.setValueAtTime(0.65, now);

  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.058, now + 2.8);
  shimmerBus.gain.setValueAtTime(0.34, now);
  lowpass.connect(master);
  shimmerBus.connect(master);
  master.connect(context.destination);

  const voices = [
    { frequency: 65.41, type: "sine" as OscillatorType, gain: 0.34, pan: -0.18 },
    { frequency: 130.81, type: "triangle" as OscillatorType, gain: 0.22, pan: -0.32 },
    { frequency: 196.0, type: "triangle" as OscillatorType, gain: 0.18, pan: 0.2 },
    { frequency: 261.63, type: "sine" as OscillatorType, gain: 0.11, pan: 0.38 },
    { frequency: 392.0, type: "sine" as OscillatorType, gain: 0.045, pan: -0.06 },
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
    lfo.frequency.setValueAtTime(0.045 + index * 0.01, now);
    lfoGain.gain.setValueAtTime(voice.gain * 0.24, now);
    lfo.connect(lfoGain);
    lfoGain.connect(voiceGain.gain);

    detuneLfo.type = "sine";
    detuneLfo.frequency.setValueAtTime(0.02 + index * 0.005, now);
    detuneGain.gain.setValueAtTime(5 + index, now);
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
    [65.41, 130.81, 196.0, 261.63, 392.0],
    [87.31, 174.61, 220.0, 329.63, 440.0],
    [73.42, 146.83, 220.0, 293.66, 392.0],
    [98.0, 196.0, 246.94, 392.0, 493.88],
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
      voice.gain.gain.setTargetAtTime(voice.baseGain * (chordIndex === 1 ? 1.12 : 0.9), changeAt, 1.2);
      voice.gain.gain.setTargetAtTime(voice.baseGain, changeAt + 3.4, 1.8);
      voice.pan.pan.setTargetAtTime((index % 2 === 0 ? -0.22 : 0.22) * (chordIndex + 1), changeAt, 2.8);
    });

    lowpass.frequency.cancelScheduledValues(changeAt);
    lowpass.frequency.setTargetAtTime(chordIndex === 1 ? 1480 : chordIndex === 3 ? 980 : 1180, changeAt, 2.2);
    shimmerBus.gain.setTargetAtTime(chordIndex === 1 ? 0.48 : 0.31, changeAt, 1.4);
  };

  const motifVariants = [
    [523.25, 659.25, 783.99, 1046.5, 987.77, 783.99],
    [392.0, 493.88, 659.25, 783.99, 739.99, 587.33],
    [440.0, 554.37, 659.25, 880.0, 830.61, 659.25],
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
      const start = base + index * 0.42;
      const end = start + 1.25;

      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -2 : 3, start);

      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.085, start + 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(index % 2 === 0 ? -0.34 : 0.34, start);

      oscillator.connect(noteGain);
      noteGain.connect(panner);
      panner.connect(shimmerBus);
      oscillator.start(start);
      oscillator.stop(end + 0.08);
      nodes.push(oscillator, noteGain, panner);
    });
  };

  const playPulse = () => {
    const start = context.currentTime + 0.03;
    const oscillator = context.createOscillator();
    const pulseGain = context.createGain();
    const pulseFilter = context.createBiquadFilter();
    const root = chordProgression[chordIndex][0];

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(root / 2, start);
    oscillator.frequency.exponentialRampToValueAtTime(root / 2.5, start + 0.42);
    pulseFilter.type = "lowpass";
    pulseFilter.frequency.setValueAtTime(180, start);
    pulseGain.gain.setValueAtTime(0.0001, start);
    pulseGain.gain.exponentialRampToValueAtTime(0.2, start + 0.04);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.15);

    oscillator.connect(pulseFilter);
    pulseFilter.connect(pulseGain);
    pulseGain.connect(lowpass);
    oscillator.start(start);
    oscillator.stop(start + 1.25);
    nodes.push(oscillator, pulseFilter, pulseGain);
  };

  const playSparkRun = () => {
    const base = context.currentTime + 0.03;
    const root = chordProgression[chordIndex][0];
    const run = [root * 4, root * 5, root * 6, root * 8, root * 10, root * 12, root * 16, root * 12];

    run.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      const panner = context.createStereoPanner();
      const start = base + index * 0.105;
      const end = start + 0.28;

      oscillator.type = index % 3 === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(Math.min(frequency, 1567.98), start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -5 : 5, start);
      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.11, start + 0.018);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(index % 2 === 0 ? -0.42 : 0.42, start);

      oscillator.connect(noteGain);
      noteGain.connect(panner);
      panner.connect(shimmerBus);
      oscillator.start(start);
      oscillator.stop(end + 0.04);
      nodes.push(oscillator, noteGain, panner);
    });
  };

  const playCinematicLift = () => {
    const start = context.currentTime + 0.02;
    const root = chordProgression[chordIndex][0];
    const oscillator = context.createOscillator();
    const liftGain = context.createGain();
    const liftFilter = context.createBiquadFilter();
    const panner = context.createStereoPanner();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(root * 1.5, start);
    oscillator.frequency.exponentialRampToValueAtTime(root * 8, start + 2.6);
    liftFilter.type = "lowpass";
    liftFilter.frequency.setValueAtTime(320, start);
    liftFilter.frequency.exponentialRampToValueAtTime(2400, start + 2.6);
    liftFilter.Q.setValueAtTime(0.75, start);
    liftGain.gain.setValueAtTime(0.0001, start);
    liftGain.gain.exponentialRampToValueAtTime(0.085, start + 1.4);
    liftGain.gain.exponentialRampToValueAtTime(0.0001, start + 2.9);
    panner.pan.setValueAtTime(chordIndex % 2 === 0 ? -0.22 : 0.22, start);

    oscillator.connect(liftFilter);
    liftFilter.connect(liftGain);
    liftGain.connect(panner);
    panner.connect(shimmerBus);
    oscillator.start(start);
    oscillator.stop(start + 3.05);
    nodes.push(oscillator, liftFilter, liftGain, panner);
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

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(root * (index === hits.length - 1 ? 1.5 : 1), hitAt);
      oscillator.frequency.exponentialRampToValueAtTime(root * 0.42, hitAt + 0.22);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(index === hits.length - 1 ? 620 : 360, hitAt);
      filter.Q.setValueAtTime(0.9, hitAt);
      gain.gain.setValueAtTime(0.0001, hitAt);
      gain.gain.exponentialRampToValueAtTime(index === hits.length - 1 ? 0.16 : 0.095, hitAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, hitAt + 0.34);

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
    const notes = [root * 4, root * 6, root * 8, root * 10, root * 12, root * 16];

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const start = base + index * 0.18;
      const end = start + 1.5;

      oscillator.type = index % 2 === 0 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(Math.min(frequency, 1760), start);
      oscillator.detune.setValueAtTime(index % 2 === 0 ? -4 : 4, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      panner.pan.setValueAtTime(-0.48 + index * 0.19, start);

      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(shimmerBus);
      oscillator.start(start);
      oscillator.stop(end + 0.08);
      nodes.push(oscillator, gain, panner);
    });
  };

  playMotif();
  window.setTimeout(playSparkRun, 1800);
  window.setTimeout(playCinematicLift, 4200);
  window.setTimeout(playHeroFlourish, 5800);
  timers.push(window.setInterval(advanceChord, 8500));
  timers.push(window.setInterval(playMotif, 12200));
  timers.push(window.setInterval(playPulse, 6400));
  timers.push(window.setInterval(playSparkRun, 7200));
  timers.push(window.setInterval(playCinematicLift, 17800));
  timers.push(window.setInterval(playPercussiveAccent, 5200));
  timers.push(window.setInterval(playHeroFlourish, 21400));

  return { context, master, nodes, timers };
}

export function startAmbientMusic() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;
  try {
    const existing = window.__kamazingAmbientMusic;
    if (existing) {
      void existing.context.resume().catch(() => undefined);
      existing.master.gain.setTargetAtTime(0.058, existing.context.currentTime, 0.9);
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
