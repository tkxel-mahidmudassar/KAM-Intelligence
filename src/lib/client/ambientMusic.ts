"use client";

const AMBIENT_MUSIC_MUTED_KEY = "kamazing:ambient-music-muted";

type AmbientMusicState = {
  context: AudioContext;
  master: GainNode;
  nodes: Array<OscillatorNode | GainNode | BiquadFilterNode | StereoPannerNode>;
};

declare global {
  interface Window {
    __kamazingAmbientMusic?: AmbientMusicState;
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
  const now = context.currentTime;
  const nodes: AmbientMusicState["nodes"] = [master, lowpass];

  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(780, now);
  lowpass.Q.setValueAtTime(0.8, now);

  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.035, now + 2.5);
  lowpass.connect(master);
  master.connect(context.destination);

  const voices = [
    { frequency: 130.81, type: "sine" as OscillatorType, gain: 0.25, pan: -0.28 },
    { frequency: 196.0, type: "triangle" as OscillatorType, gain: 0.16, pan: 0.18 },
    { frequency: 261.63, type: "sine" as OscillatorType, gain: 0.11, pan: 0.34 },
    { frequency: 329.63, type: "sine" as OscillatorType, gain: 0.045, pan: -0.08 },
  ];

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
    lfo.frequency.setValueAtTime(0.035 + index * 0.012, now);
    lfoGain.gain.setValueAtTime(voice.gain * 0.18, now);
    lfo.connect(lfoGain);
    lfoGain.connect(voiceGain.gain);

    detuneLfo.type = "sine";
    detuneLfo.frequency.setValueAtTime(0.018 + index * 0.006, now);
    detuneGain.gain.setValueAtTime(4 + index, now);
    detuneLfo.connect(detuneGain);
    detuneGain.connect(oscillator.detune);

    oscillator.connect(voiceGain);
    voiceGain.connect(panner);
    panner.connect(lowpass);

    oscillator.start(now);
    lfo.start(now);
    detuneLfo.start(now);
    nodes.push(oscillator, voiceGain, panner, lfo, lfoGain, detuneLfo, detuneGain);
  });

  return { context, master, nodes };
}

export function startAmbientMusic() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;
  try {
    const existing = window.__kamazingAmbientMusic;
    if (existing) {
      void existing.context.resume();
      existing.master.gain.setTargetAtTime(0.035, existing.context.currentTime, 0.9);
      return;
    }

    const state = buildAmbientMusic();
    if (!state) return;
    window.__kamazingAmbientMusic = state;
    void state.context.resume();
  } catch {
    // Browser audio policies can defer playback until the next user gesture.
  }
}

export function stopAmbientMusic() {
  if (typeof window === "undefined") return;
  const state = window.__kamazingAmbientMusic;
  if (!state) return;
  const now = state.context.currentTime;
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
  else startAmbientMusic();
}

export function primeAmbientMusicOnInteraction() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;
  const start = () => startAmbientMusic();
  window.addEventListener("pointerdown", start, { once: true, passive: true });
  window.addEventListener("keydown", start, { once: true });
}
