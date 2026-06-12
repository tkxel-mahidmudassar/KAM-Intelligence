"use client";

const AMBIENT_MUSIC_MUTED_KEY = "kamazing:ambient-music-muted";
const AMBIENT_TRACK_SRC = "/AXIS1130_09_Turf%20War_Full.wav";
const TARGET_VOLUME = 0.18;

declare global {
  interface Window {
    __kamazingAmbientAudio?: HTMLAudioElement;
    __kamazingAmbientFadeTimer?: number;
    __kamazingAmbientPrimerAttached?: boolean;
  }
}

export function isAmbientMusicMuted() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(AMBIENT_MUSIC_MUTED_KEY) === "true";
}

function clearFadeTimer() {
  if (typeof window === "undefined" || !window.__kamazingAmbientFadeTimer) return;
  window.clearInterval(window.__kamazingAmbientFadeTimer);
  window.__kamazingAmbientFadeTimer = undefined;
}

function getAmbientAudio() {
  if (typeof window === "undefined") return null;
  if (window.__kamazingAmbientAudio) return window.__kamazingAmbientAudio;

  const audio = new Audio(AMBIENT_TRACK_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  window.__kamazingAmbientAudio = audio;
  return audio;
}

function fadeAudio(audio: HTMLAudioElement, targetVolume: number, durationMs = 1600) {
  clearFadeTimer();
  const startVolume = audio.volume;
  const startedAt = Date.now();

  window.__kamazingAmbientFadeTimer = window.setInterval(() => {
    const progress = Math.min((Date.now() - startedAt) / durationMs, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = startVolume + (targetVolume - startVolume) * eased;

    if (progress >= 1) {
      audio.volume = targetVolume;
      clearFadeTimer();
    }
  }, 50);
}

export function startAmbientMusic() {
  if (typeof window === "undefined" || isAmbientMusicMuted()) return;
  try {
    const audio = getAmbientAudio();
    if (!audio) return;

    void audio
      .play()
      .then(() => fadeAudio(audio, TARGET_VOLUME))
      .catch(() => {
        // Browser audio policies can defer playback until the next user gesture.
      });
  } catch {
    // Keep audio failures non-blocking.
  }
}

export function stopAmbientMusic() {
  if (typeof window === "undefined") return;
  const audio = window.__kamazingAmbientAudio;
  if (!audio) return;

  fadeAudio(audio, 0, 700);
  window.setTimeout(() => {
    if (audio.volume <= 0.01) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, 760);
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
    const audio = getAmbientAudio();
    startAmbientMusic();
    if (audio && !audio.paused) cleanup();
  };

  window.addEventListener("pointerdown", start, { passive: true });
  window.addEventListener("click", start, { passive: true });
  window.addEventListener("touchstart", start, { passive: true });
  window.addEventListener("keydown", start);
  start();
}
