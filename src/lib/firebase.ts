// Client-side Firebase initialization for FCM Web Push.
// All values here are publishable (safe to embed).
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from "firebase/messaging";

export const firebaseConfig = {
  apiKey: "AIzaSyDs5JBDtZjFBial4AkKj5zXAPXofbwG-Wc",
  authDomain: "narabou-push.firebaseapp.com",
  projectId: "narabou-push",
  storageBucket: "narabou-push.firebasestorage.app",
  messagingSenderId: "933530490328",
  appId: "1:933530490328:web:47b3ab6a3743847c99cead",
  measurementId: "G-2EPM3FGVS0",
};

export const VAPID_PUBLIC_KEY =
  "BItXhF-0hMGaa9KAB1YbtICA4OMv7VDbIpALtNVmdiZs-tQ8l3pUVTUzbZlomsGgwLU0wHnVsW4ESkVSTkUuUPg";

let appSingleton: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp {
  if (appSingleton) return appSingleton;
  appSingleton = getApps()[0] ?? initializeApp(firebaseConfig);
  return appSingleton;
}

let messagingSingleton: Messaging | null = null;
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (messagingSingleton) return messagingSingleton;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    messagingSingleton = getMessaging(getFirebaseApp());
    return messagingSingleton;
  } catch {
    return null;
  }
}

export async function requestFcmToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return null;

  // Register (or reuse) the dedicated FCM SW at a stable scope.
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    scope: "/firebase-cloud-messaging-push-scope",
  });

  const token = await getToken(messaging, {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration,
  });
  return token ?? null;
}

export async function subscribeForegroundMessages(
  handler: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void,
) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  const unsub = onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: (payload.data ?? {}) as Record<string, string>,
    });
  });
  return unsub;
}
