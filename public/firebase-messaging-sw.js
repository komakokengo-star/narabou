/* Firebase Cloud Messaging Service Worker (background notifications) */
/* global importScripts, firebase, self, clients */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDs5JBDtZjFBial4AkKj5zXAPXofbwG-Wc",
  authDomain: "narabou-push.firebaseapp.com",
  projectId: "narabou-push",
  storageBucket: "narabou-push.firebasestorage.app",
  messagingSenderId: "933530490328",
  appId: "1:933530490328:web:47b3ab6a3743847c99cead",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "ＮＡＲＡＢＯＵ";
  const body = (payload.notification && payload.notification.body) || "";
  const data = payload.data || {};
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    data,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
