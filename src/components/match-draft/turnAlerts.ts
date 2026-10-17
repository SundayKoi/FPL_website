/** Short sine ping for "it's your turn". Best-effort: browsers may refuse
 *  audio before any user gesture, and that's fine. */
export function playTurnPing() {
  try {
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    // audio is polish, never an error
  }
}

/** Blink the tab title a few times so an alt-tabbed captain notices.
 *  Returns a function that stops the blink early and restores the title;
 *  call it when the board unmounts so the blink never outlives the page. */
export function flashTitle(): () => void {
  if (typeof document === "undefined") return () => {};
  const original = document.title;
  let on = false;
  let count = 0;
  const stop = () => {
    clearInterval(interval);
    if (typeof document !== "undefined") document.title = original;
  };
  const interval = setInterval(() => {
    if (typeof document === "undefined") return clearInterval(interval);
    on = !on;
    count += 1;
    document.title = on ? "🔔 Your turn to draft!" : original;
    if (count >= 8 || document.hasFocus()) stop();
  }, 900);
  return stop;
}
