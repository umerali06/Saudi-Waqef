"use client";

const MUTE_KEY = "notifications_muted";

export const isMuted = () => {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setMuted = (muted: boolean) => {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Private windows may refuse storage; the sound then simply stays on.
  }
};

let context: AudioContext | null = null;

/** Browsers only allow sound after the person has touched the page once. */
export const unlockSound = () => {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    context = null;
  }
};

/** Two soft bell tones; urgent notifications repeat them. */
export const playChime = (urgent = false) => {
  if (isMuted()) return;
  unlockSound();
  if (!context || context.state !== "running") return;
  const audio = context;
  const ring = (frequency: number, at: number) => {
    const start = audio.currentTime + at;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.28, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    gain.connect(audio.destination);
    [1, 2.01].forEach((partial, index) => {
      const oscillator = audio.createOscillator();
      const level = audio.createGain();
      level.gain.value = index === 0 ? 1 : 0.25;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency * partial;
      oscillator.connect(level).connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 0.95);
    });
  };
  (urgent ? [0, 0.75] : [0]).forEach((offset) => {
    ring(784, offset);
    ring(1047, offset + 0.16);
  });
};

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const toKey = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

const register = () => navigator.serviceWorker.register("/sw.js");

/** Registers this device. `ask` shows the browser's permission prompt, which needs a click. */
export const enablePush = async (ask: boolean): Promise<"enabled" | "denied" | "unsupported" | "off"> => {
  if (!pushSupported()) return "unsupported";
  let permission = Notification.permission;
  if (permission === "default" && ask) permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const registration = await register();
  await navigator.serviceWorker.ready;
  const keyResponse = await fetch("/api/push");
  if (!keyResponse.ok) throw new Error("PUSH_KEY_UNAVAILABLE");
  const { publicKey } = (await keyResponse.json()) as { publicKey: string };

  let subscription = await registration.pushManager.getSubscription();
  const current = subscription?.options.applicationServerKey;
  const expected = toKey(publicKey);
  if (subscription && current && String(new Uint8Array(current)) !== String(expected)) {
    // Made for another environment's key; pushes to it would be refused.
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected,
  });
  const saved = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!saved.ok) throw new Error("PUSH_NOT_SAVED");
  return "enabled";
};

/** Called before signing out, so the next person on this device gets nothing of ours. */
export const disablePush = async () => {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
};
