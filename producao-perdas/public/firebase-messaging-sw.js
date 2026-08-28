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
    /**
     * O badge é a silhueta que o Android põe na barra de status, e o
     * sistema DESCARTA as cores dela — usa só o formato. Mandar a
     * logomarca colorida aqui produzia um borrão cinza sem leitura; este
     * arquivo é um pão em branco sobre transparente, desenhado para
     * sobreviver aos ~24 px reais da barra (ver scripts/gerar_icones.py).
     */
    badge: "/badge-96x96.png",
    /**
     * A tag faz o aviso do MESMO produto substituir o anterior em vez de
     * empilhar. Pão francês sai seis vezes por dia; sem isso a filial
     * receberia seis avisos do mesmo item e aprenderia a ignorar todos —
     * que é como uma notificação perde a função.
     */
    tag: dados.tag || "fornada",
    renotify: true,
    /**
     * Explícito de propósito. A Web Notifications API não deixa escolher o
     * som — quem toca é o canal padrão do sistema —, mas `silent: true`
     * herdado de alguma configuração deixaria o aviso mudo sem erro
     * nenhum. Declarar false tira essa dúvida da investigação.
     */
    silent: false,
    /**
     * O destino DENTRO do app vem do servidor (api/notificar-fornada.ts).
     * Antes o toque abria o app na última aba usada, e quem recebia "PÃO
     * FRANCÊS disponível" caía no Cronograma sem entender o que fazer.
     */
    data: { url: dados.url || "/" },
  });

  /**
   * O SOM, quando a janela está aberta mas ATRÁS de outra (ago/2026).
   *
   * No PC do balcão o app fica aberto o dia inteiro, atrás do PDV. Nesse
   * estado o FCM entrega o aviso AQUI, no service worker — e não no
   * `onMessage` da página —, então o som que a página gera nunca tocava.
   * A notificação aparecia muda e ninguém percebia.
   *
   * Service worker não toca áudio: não tem WebAudio. Mas ele pode falar
   * com as janelas abertas, e a página, mesmo sem foco, toca normalmente
   * (o contexto de áudio já foi destravado no primeiro toque do dia).
   *
   * `includeUncontrolled` é essencial: a janela pode não estar sob o
   * controle DESTE service worker — ele é o do Firebase, e o do PWA é
   * outro — e sem isso a lista voltaria vazia.
   */
  return clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((janelas) => {
      for (const janela of janelas) janela.postMessage({ tipo: "tocar-aviso" });
    })
    .catch(() => {
      // Sem janela aberta não há quem toque, e tudo bem: o sistema já
      // mostrou a notificação, que é o canal que sempre funciona.
    });
});

/**
 * Tocar no aviso abre o app já aberto, na aba certa.
 *
 * Duas rotas, porque as duas situações são diferentes:
 *
 * - App ABERTO: focar a janela e mandar um recado (`postMessage`). Trocar
 *   a aba por mensagem preserva o estado da tela — recarregar a página
 *   jogaria fora o pedido que a filial estava digitando.
 * - App FECHADO: abrir a janela já com a rota, que o app lê na
 *   inicialização (ver o efeito de rota em src/App.tsx).
 */
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/";
  evento.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) {
          janela.postMessage({ tipo: "abrir-rota", url: destino });
          return janela.focus();
        }
      }
      return clients.openWindow(destino);
    })
  );
});
