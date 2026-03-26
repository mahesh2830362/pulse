"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for push notifications.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW registration failed:", err));
    }
  }, []);

  return null;
}
