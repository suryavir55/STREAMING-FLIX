// Firebase Messaging Service Worker for background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(
  apiKey: "AIzaSyCC6Y8BUIW4r5S5KDyVOar46LzWmvJ18G8",
  authDomain: "nextgen-cinema2.firebaseapp.com",
  databaseURL: "https://nextgen-cinema2-default-rtdb.firebaseio.com",
  projectId: "nextgen-cinema2",
  storageBucket: "nextgen-cinema2.firebasestorage.app",
  messagingSenderId: "815514025460",
  appId: "1:815514025460:web:62f51737fe564b63eecda1"
};

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'ICF ANIME';
  const notificationBody = payload.notification?.body || payload.data?.body || '';
  const brandIcon = 'https://i.ibb.co/VpwCTQ1W/1774431400079.png';
  
  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || brandIcon,
    badge: brandIcon,
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || '/',
      ...payload.data
    },
    tag: `icfanime-bg-${Date.now()}`,
  };
  
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  const fullUrl = urlToOpen.startsWith('http') ? urlToOpen : `${self.location.origin}${urlToOpen}`;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client && client.url !== fullUrl) {
            return client.navigate(fullUrl);
          }
          return client;
        }
      }
      return self.clients.openWindow(fullUrl);
    })
  );
});