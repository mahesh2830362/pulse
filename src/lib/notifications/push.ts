export interface PushSubscriptionData {
  readonly endpoint: string;
  readonly keys: {
    readonly p256dh: string;
    readonly auth: string;
  };
}

export interface NotificationPayload {
  readonly title: string;
  readonly body: string;
  readonly url?: string;
  readonly icon?: string;
  readonly tag?: string;
}

/**
 * Send a push notification to a subscription.
 * Uses dynamic import to avoid crashing when web-push native bindings fail.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: NotificationPayload
): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@pulse.app";

  if (!publicKey || !privateKey) {
    // Push not configured — skip silently
    return false;
  }

  try {
    // Dynamic import to avoid top-level crash if web-push fails to load
    const webpush = await import("web-push");
    webpush.default.setVapidDetails(subject, publicKey, privateKey);

    await webpush.default.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify(payload),
      { TTL: 3600 }
    );
    return true;
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      console.warn("Push subscription expired:", subscription.endpoint);
    } else {
      console.error("Push notification failed:", error);
    }
    return false;
  }
}

/**
 * Send notifications for new items from high-priority sources.
 */
export async function notifyNewItems(
  items: ReadonlyArray<{
    title: string;
    url: string;
    sourceName: string;
  }>,
  subscriptions: ReadonlyArray<PushSubscriptionData>
): Promise<number> {
  let sent = 0;

  for (const item of items) {
    const payload: NotificationPayload = {
      title: `New from ${item.sourceName}`,
      body: item.title,
      url: item.url,
      icon: "/icon-192.png",
      tag: `pulse-${item.url}`,
    };

    for (const sub of subscriptions) {
      const success = await sendPushNotification(sub, payload);
      if (success) sent++;
    }
  }

  return sent;
}
