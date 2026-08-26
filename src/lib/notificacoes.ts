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

function ehIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** True quando o app está rodando instalado na tela de início. */
export function estaInstalado(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export async function estadoDosAvisos(): Promise<EstadoAviso> {
  if (!(await isSupported().catch(() => false))) return "nao-suportado";
  // No iPhone o push exige o app na tela de início — instalado pelo
  // navegador, a API existe mas nunca entrega nada.
  if (ehIos() && !estaInstalado()) return "nao-suportado";
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

  // O id do documento é o próprio token: reativar no mesmo aparelho
  // atualiza o registro em vez de criar um duplicado, e o envio nunca
  // manda o mesmo aviso duas vezes para o mesmo celular.
  await setDoc(doc(db, "dispositivos", token), {
    token,
    lojaId,
    registradoPor: operador,
    atualizadoEm: new Date().toISOString(),
  });
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
      aoReceber(dados.titulo ?? "Padaria Pão de Mel", dados.corpo ?? "");
    });
  } catch (erro) {
    console.warn("Avisos em primeiro plano indisponíveis:", erro);
    return () => {};
  }
}
