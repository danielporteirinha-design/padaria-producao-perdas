/**
 * src/lib/notificacoes.ts
 * ---------------------------------------------------------------
 * Avisos de fornada pronta, via Firebase Cloud Messaging (ago/2026).
 *
 * O objetivo, nas palavras do dono do negócio: a filial saber que o
 * produto ficou pronto e poder pedir reposição enquanto ainda dá tempo de
 * entregar hoje.
 *
 * DUAS RESTRIÇÕES DE APARELHO QUE MOLDAM O DESENHO
 * -------------------------------------------------
 * 1. No iPhone, aviso na tela só funciona com o app INSTALADO na tela de
 *    início (iOS 16.4+). Instalado pelo navegador, não funciona. Por isso
 *    a tela explica isso antes de pedir permissão, em vez de pedir e
 *    falhar em silêncio.
 *
 * 2. A permissão precisa ser pedida a partir de um TOQUE do usuário —
 *    pedir ao abrir o app é bloqueado em alguns navegadores e, onde não
 *    é, cria o reflexo de negar sem ler. Daí o botão "Ativar avisos".
 *
 * O token identifica o APARELHO, não a pessoa: o mesmo funcionário em
 * dois celulares gera dois tokens, e é isso que se quer — o aviso tem que
 * chegar em qualquer aparelho que a loja esteja usando.
 */

import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { app, db } from "./firebase";
import { estaInstalado, plataformaAtual } from "./plataforma";

/**
 * Chave pública do Web Push, gerada no console do Firebase em
 * Configurações do projeto → Cloud Messaging → Certificados push da Web.
 * É pública por desenho, como o resto da configuração do Firebase.
 *
 * Vazia = avisos ainda não configurados. Nesse caso o app não quebra: o
 * botão explica o que falta em vez de dar erro técnico.
 */
export const CHAVE_VAPID = "BHcEUH922avwC9HfttGYgMjBn3mV1hoGsqus0Tf5YVcSStTAe5KUlJL53_khCnZ-Yigt-qIW87k1DVF2ZcDBR3M";

export type EstadoAviso =
  | "nao-suportado" // navegador sem push, ou iPhone com o app fora da tela de início
  | "nao-configurado" // falta a CHAVE_VAPID
  | "negado" // usuário recusou; só reverte nas configurações do aparelho
  | "desligado" // suportado, ainda não ativado
  | "ligado";

export class ErroNotificacao extends Error {}

/**
 * Detecção de aparelho vive em src/lib/plataforma.ts — mesma fonte usada
 * pelo cartão de avisos para montar as instruções. Duas cópias da mesma
 * regra acabariam discordando no dia em que uma delas mudasse.
 */

export async function estadoDosAvisos(): Promise<EstadoAviso> {
  if (!(await isSupported().catch(() => false))) return "nao-suportado";
  // No iPhone o push exige o app na tela de início — instalado pelo
  // navegador, a API existe mas nunca entrega nada.
  if (plataformaAtual() === "ios" && !estaInstalado()) return "nao-suportado";
  if (!CHAVE_VAPID) return "nao-configurado";
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission === "granted") return "ligado";
  return "desligado";
}

/**
 * Pede permissão e registra este aparelho para receber os avisos da loja.
 * Precisa ser chamada a partir de um toque do usuário.
 */
export async function ativarAvisos(lojaId: string, operador: string): Promise<void> {
  if (!CHAVE_VAPID) {
    throw new ErroNotificacao(
      "Os avisos ainda não foram configurados no projeto. Me avise para eu concluir."
    );
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new ErroNotificacao(
      "Permissão negada. Para reverter, é preciso liberar as notificações nas configurações do aparelho."
    );
  }

  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: CHAVE_VAPID });
  if (!token) {
    throw new ErroNotificacao("Não foi possível registrar este aparelho para receber avisos.");
  }

  await gravarAparelho(token, lojaId, operador);
}

/**
 * Grava o aparelho para a loja informada.
 *
 * O id do documento é o próprio token: reativar no mesmo aparelho
 * atualiza o registro em vez de criar um duplicado, e o envio nunca manda
 * o mesmo aviso duas vezes para o mesmo celular. Regravar também CORRIGE
 * o `lojaId` — é o que faz um aparelho que já foi filial passar a contar
 * como matriz quando alguém troca de conta nele.
 */
async function gravarAparelho(token: string, lojaId: string, operador: string): Promise<void> {
  await setDoc(doc(db, "dispositivos", token), {
    token,
    lojaId,
    registradoPor: operador,
    atualizadoEm: new Date().toISOString(),
  });
}

export type ResultadoRegistroSilencioso =
  | "registrado"
  | "sem-permissao"
  | "nao-suportado"
  | "falhou";

/**
 * Registra este aparelho SEM pedir nada ao usuário, quando a permissão já
 * está concedida.
 *
 * DEFEITO QUE ISTO CORRIGE (ago/2026)
 * ------------------------------------
 * O app tratava "permissão do navegador concedida" como "aparelho
 * registrado", e são coisas diferentes. O documento em `dispositivos` —
 * que é o que diz PARA ONDE o push vai — só nascia quando alguém tocava
 * em "Ativar". Só que o cartão de ativação some assim que a permissão
 * está concedida. Resultado, no aparelho que já tinha permissão de antes:
 * o cartão nunca aparecia, nenhum token era gravado, e o aviso não tinha
 * destino — em silêncio absoluto, que é o pior jeito de falhar.
 *
 * Pior ainda na troca de conta: um celular registrado uma vez como filial
 * continuava com `lojaId` de filial. Ele recebia os avisos de fornada e
 * NUNCA os de reposição, mesmo logado como matriz.
 *
 * Chamar isto na abertura é seguro: com a permissão já concedida,
 * `getToken` não abre prompt nenhum. Sem permissão, ele nem é chamado —
 * quem pede permissão continua sendo o toque no botão.
 */
export async function registrarAparelhoSePermitido(
  lojaId: string,
  operador: string
): Promise<ResultadoRegistroSilencioso> {
  if ((await estadoDosAvisos()) !== "ligado") {
    // `Notification` como identificador solto lança ReferenceError onde a
    // API não existe — nem o encadeamento opcional salva disso.
    const permitido =
      typeof Notification !== "undefined" && Notification.permission === "granted";
    return permitido ? "nao-suportado" : "sem-permissao";
  }
  try {
    const token = await getToken(getMessaging(app), { vapidKey: CHAVE_VAPID });
    if (!token) return "falhou";
    await gravarAparelho(token, lojaId, operador);
    return "registrado";
  } catch (erro) {
    console.warn("Não foi possível registrar este aparelho para avisos:", erro);
    return "falhou";
  }
}

/**
 * Avisos que chegam com o app ABERTO. O service worker não é chamado
 * nesse caso, então sem isto o aviso simplesmente não apareceria para
 * quem está justamente usando o app.
 */
export function ouvirAvisosEmPrimeiroPlano(
  aoReceber: (titulo: string, corpo: string) => void
): () => void {
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      const dados = payload.data ?? {};
      const titulo = dados.titulo ?? "Padaria Pão de Mel";
      const corpo = dados.corpo ?? "";
      aoReceber(titulo, corpo);
      // Além da faixa dentro do app, a notificação do sistema. Com o app
      // aberto o service worker não é acionado, e uma faixa interna não
      // resolve o caso real: no PC do caixa a janela está atrás da
      // planilha ou do PDV, e ninguém vê aviso nenhum.
      void mostrarNotificacaoLocal(titulo, corpo, dados.tag);
    });
  } catch (erro) {
    console.warn("Avisos em primeiro plano indisponíveis:", erro);
    return () => {};
  }
}

/**
 * Mostra uma notificação do sistema a partir da própria página.
 *
 * Vai pelo `registration.showNotification` do service worker, e não pelo
 * `new Notification(...)`: o construtor direto é ignorado no Android e
 * some sozinho em alguns navegadores de desktop, enquanto pelo service
 * worker o aviso entra na bandeja do sistema, aceita `tag` (o aviso do
 * mesmo produto substitui o anterior em vez de empilhar) e sobrevive à
 * janela do app estar atrás de outra.
 */
export async function mostrarNotificacaoLocal(
  titulo: string,
  corpo: string,
  tag?: string
): Promise<void> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const registro = await navigator.serviceWorker?.getRegistration();
    if (!registro) return;
    await registro.showNotification(titulo, {
      body: corpo,
      icon: "/pwa-192x192.png",
      // Silhueta monocromática — ver o comentário em
      // public/firebase-messaging-sw.js sobre por que não é a logomarca.
      badge: "/badge-96x96.png",
      tag: tag ?? "padaria",
      silent: false,
    });
  } catch (erro) {
    // Notificação é acessório: se não der, a faixa dentro do app continua
    // valendo e a operação não pode parar por causa disso.
    console.warn("Não foi possível mostrar a notificação local:", erro);
  }
}
