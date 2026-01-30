"use client";

export async function trackEvent(params: {
  name: string;
  companyId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await fetch("/api/telemetry/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // Ignore telemetry errors to avoid UX regressions.
  }
}
