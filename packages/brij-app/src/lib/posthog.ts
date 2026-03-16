/**
 * PostHog analytics — per Miranda's BRIJ_TRACKING_SPEC.md
 *
 * Init, identify, UTM passthrough, custom events.
 */

import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "phc_80Rk0mhFCUur5J50My0izloLTArbwu9UpkcW1GodUrR";

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;

  posthog.init(POSTHOG_KEY, {
    api_host: "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    persistence: "localStorage",
  });

  // Store UTM params on first load
  const params = new URLSearchParams(window.location.search);
  const utms = {
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    campaign: params.get("utm_campaign") || "",
    content: params.get("utm_content") || "",
    ref: params.get("ref") || "",
  };
  if (utms.source) {
    sessionStorage.setItem("brij_utms", JSON.stringify(utms));
  }

  initialized = true;
}

export function identifyUser(user: {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
}) {
  if (!initialized) return;

  const utms = JSON.parse(sessionStorage.getItem("brij_utms") || "{}");

  posthog.identify(user.id, {
    email: user.email,
    name: user.name,
    created_at: user.createdAt || "",
    utm_source: utms.source || "",
    utm_medium: utms.medium || "",
    utm_campaign: utms.campaign || "",
    utm_ref: utms.ref || "",
  });
}

export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

export function trackSignup() {
  if (!initialized) return;
  const utms = JSON.parse(sessionStorage.getItem("brij_utms") || "{}");
  posthog.capture("signup_complete", utms);
  sessionStorage.removeItem("brij_utms");
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, properties);
}
