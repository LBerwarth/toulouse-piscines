import "server-only";
import webpush from "web-push";
import { removeSubscription, type StoredSubscription } from "./push-store";

export { exceptionalSignature } from "./parse-schedule";

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:lena.berw@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  slug: string;
}

/** Envoie une notification ; supprime l'abonnement s'il a expiré (404/410). */
export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<boolean> {
  configure();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) await removeSubscription(sub.endpoint);
    return false;
  }
}

