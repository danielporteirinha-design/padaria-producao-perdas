/**
 * public/firebase-messaging-sw.js
 * ---------------------------------------------------------------
 * Service worker que recebe os avisos de fornada pronta quando o app
 * está FECHADO ou em segundo plano.
 *
 * Fica separado do service worker do PWA (sw.js, gerado pelo
 * vite-plugin-pwa) de propósito: o Firebase registra este arquivo com um
 * escopo próprio (/firebase-cloud-messaging-push-scope), então os dois
 * convivem sem um sobrescrever o registro do outro.
 *
 * As credenciais abaixo são as mesmas de src/lib/firebase.ts e são
 * públicas por desenho — ver o comentário longo naquele arquivo. Elas
 * precisam estar repetidas aqui porque um service worker não consegue
 * importar módulos do app.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAWQq1TVzd9ycS8tpwl-lxmj7SPek0Pyuc",
  authDomain: "producao-padaria-pao-de-mel.firebaseapp.com",
  projectId: "producao-padaria-pao-de-mel",
  storageBucket: "producao-padaria-pao-de-mel.firebasestorage.app",
  messagingSenderId: "387803878936",
  appId: "1:387803878936:web:26ab9179bb813e114fd56d",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const dados = payload.data || {};
  self.registration.showNotification(dados.titulo || "Padaria Pão de Mel", {
    body: dados.corpo || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    /**
     * A tag faz o aviso do MESMO produto substituir o anterior em vez de
     * empilhar. Pão francês sai seis vezes por dia; sem isso a filial
     * receberia seis avisos do mesmo item e aprenderia a ignorar todos —
     * que é como uma notificação perde a função.
     */
    tag: dados.tag || "fornada",
    renotify: true,
    data: { url: "/" },
  });
});

// Tocar no aviso abre o app já aberto, em vez de uma aba nova.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) return janela.focus();
      }
      return clients.openWindow("/");
    })
  );
});
