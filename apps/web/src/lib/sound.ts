/**
 * Kumaran Chits — Audio Feedback Utility
 * Uses the native Web Audio API to synthesize a subtle, elegant financial alert chime.
 * Zero external MP3/WAV assets, zero network requests, and zero latency.
 */

let lastChimeTime = 0;
const MIN_CHIME_INTERVAL_MS = 3_000;

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastChimeTime < MIN_CHIME_INTERVAL_MS) {
    return;
  }
  lastChimeTime = now;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const t0 = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz) — Initial chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, t0);
    gain1.gain.setValueAtTime(0.04, t0);
    gain1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t0);
    osc1.stop(t0 + 0.35);

    // Tone 2: B5 (987.77 Hz) — Uplifting confirmation tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(987.77, t0 + 0.12);
    gain2.gain.setValueAtTime(0.04, t0 + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t0 + 0.12);
    osc2.stop(t0 + 0.55);

    // Auto-close context after tones finish to prevent audio resource leaks
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Silently ignore if autoplay is restricted by browser policy
  }
}
