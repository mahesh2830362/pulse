"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Notification {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly url: string | null;
  readonly is_read: boolean;
  readonly created_at: string;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?limit=20");
      const data = await response.json();
      if (response.ok) {
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // Silently fail
    }
  }, []);

  // Check push subscription status
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setPushEnabled(!!sub);
        });
      });
    }
  }, []);

  // Poll for notifications every 60 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  async function handleTogglePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported in this browser.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      if (pushEnabled) {
        // Unsubscribe
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/notifications/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        // Subscribe
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          alert("Push notifications not configured yet. Add VAPID keys to .env.local");
          return;
        }

        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });

        const subJson = sub.toJSON();

        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: {
              endpoint: subJson.endpoint,
              keys: subJson.keys,
            },
          }),
        });

        setPushEnabled(true);
      }
    } catch (error) {
      console.error("Push toggle error:", error);
      alert("Failed to toggle push notifications. Check browser permissions.");
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true }))
    );
    setUnreadCount(0);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      fetchNotifications();
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          padding: "6px 8px",
          color: "var(--color-text-secondary)",
          position: "relative",
        }}
      >
        {"\uD83D\uDD14"}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: "50%",
              backgroundColor: "var(--color-unread)",
              color: "white",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 340,
            maxHeight: 440,
            backgroundColor: "white",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "-0.02em",
                color: "var(--color-text)",
              }}
            >
              Notifications
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--color-accent)",
                    fontWeight: 500,
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={handleTogglePush}
                title={
                  pushEnabled
                    ? "Push notifications ON — click to disable"
                    : "Push notifications OFF — click to enable"
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  color: pushEnabled
                    ? "var(--color-success)"
                    : "var(--color-text-tertiary)",
                }}
              >
                {pushEnabled ? "\uD83D\uDD14" : "\uD83D\uDD15"}
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "40px 16px",
                  textAlign: "center",
                  color: "var(--color-text-tertiary)",
                  fontSize: 14,
                }}
              >
                No notifications yet.
                <br />
                <span style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                  Mark sources as high-priority to get alerts.
                </span>
              </div>
            ) : (
              notifications.map((notif) => (
                <a
                  key={notif.id}
                  href={notif.url ?? "/dashboard"}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "12px 16px",
                    borderBottom: "1px solid rgba(0,0,0,0.03)",
                    textDecoration: "none",
                    backgroundColor: notif.is_read
                      ? "transparent"
                      : "rgba(0,113,227,0.02)",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Unread dot */}
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      marginTop: 6,
                      flexShrink: 0,
                      backgroundColor: notif.is_read
                        ? "transparent"
                        : "var(--color-accent)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: notif.is_read ? 400 : 600,
                        fontSize: 14,
                        color: "var(--color-text)",
                        letterSpacing: "-0.016em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {notif.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-secondary)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        letterSpacing: "-0.016em",
                      }}
                    >
                      {notif.body}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-tertiary)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {formatTimeAgo(notif.created_at)}
                  </span>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
