/**
 * api/notificar-atualizacao.ts
 * ---------------------------------------------------------------
 * Avisa TODOS os aparelhos que uma versão nova do app está publicada
 * (set/2026, pedido do dono do negócio).
 *
 * QUEM CHAMA ISTO NÃO É UMA LOJA — É O PRÓPRIO DEPLOY
 * -----------------------------------------------------
 * Todo outro aviso deste projeto nasce de alguém logado apertando um
 * botão, e por isso é autenticado pelo token do Firebase de quem chamou
 * (ver api/notificar-fornada.ts — QUEM PODE CHAMAR). Aqui não tem
 * ninguém logado: quem chama é o GitHub Actions, alguns segundos depois
 * de um `git push` para `main` terminar de subir na Vercel. A prova de
 * identidade não pode ser "sou a matriz" — tem que ser um segredo que só
 * o pipeline de deploy conhece.
 *
 * POR QUE GITHUB ACTIONS, E NÃO O WEBHOOK NATIVO DA VERCEL
 * -----------------------------------------------------------
 * A Vercel tem um recurso pronto para isto — um webhook de "Deployment
 * Succeeded", com assinatura HMAC — mas ele só existe nos planos Pro e
 * Enterprise. Este projeto foi construído para rodar no plano gratuito.
 * O GitHub Actions já observa o mesmo `push` que aciona o deploy da
 * Vercel (ver .github/workflows/notificar-atualizacao.yml), e chamar
 * este endereço de lá não custa nada.
 *
 * O SEGREDO: UMA VARIÁVEL, EM DOIS LUGARES
 * -------------------------------------------
 * `CHAVE_NOTIFICAR_ATUALIZACAO` precisa existir IGUAL nos dois lados:
 *
 *   - na Vercel, em Settings -> Environment Variables (é o que este
 *     arquivo lê em process.env);
 *   - no GitHub, em Settings -> Secrets and variables -> Actions (é o
 *     que o workflow manda no cabeçalho da chamada).
 *
 * Qualquer texto longo e aleatório serve — ninguém digita isso na mão,
 * então não precisa ser memorizável. Sem a variável configurada nos dois
 * lados, o endereço responde 401 e nenhum aviso sai — o comportamento
 * seguro para um esquecimento de configuração é NÃO notificar sozinho,
 * não o contrário.
 *
 * PARA TODO MUNDO, SEM DISTINÇÃO DE LOJA
 * -------------------------------------------
 * Diferente de todo outro aviso deste arquivo — que fala com um lado só
 * (matriz avisa filiais, filial avisa matriz) —, uma versão nova vale
 * para quem estiver com o app instalado, sem exceção. Por isso a lista de
 * destinatários aqui é a coleção `dispositivos` inteira, sem filtro de
 * `lojaId`.
 */

import { timingSafeEqual } from "node:crypto";

type ModulosAdmin = {
  app: typeof import("firebase-admin/app");
  firestore: typeof import("firebase-admin/firestore");
  messaging: typeof import("firebase-admin/messaging");
};

async function carregarAdmin(): Promise<ModulosAdmin> {
  try {
    const [app, firestore, messaging] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/firestore"),
      import("firebase-admin/messaging"),
    ]);
    return { app, firestore, messaging };
  } catch (erro) {
    throw new ErroNotificacao(
      `O servidor não conseguiu carregar a biblioteca do Firebase: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
      500
    );
  }
}

/** Erro de domínio — sempre com mensagem apresentável no log do Actions. */
class ErroNotificacao extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Inicializa uma vez só. Funções serverless reaproveitam o processo entre
 * chamadas, e inicializar de novo lança erro de app duplicado.
 */
function aplicativoAdmin(modulos: ModulosAdmin) {
  const { cert, getApp, getApps, initializeApp } = modulos.app;
  if (getApps().length > 0) return getApp();

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    throw new ErroNotificacao(
      "Os avisos não estão configurados no servidor (falta FIREBASE_SERVICE_ACCOUNT).",
      503
    );
  }
  let credencial: import("firebase-admin/app").ServiceAccount;
  try {
    credencial = JSON.parse(bruto) as import("firebase-admin/app").ServiceAccount;
  } catch {
    throw new ErroNotificacao(
      "A chave de serviço configurada no servidor está inválida — confira se o JSON foi colado inteiro.",
      503
    );
  }
  return initializeApp({ credential: cert(credencial) });
}

/**
 * COMPARAÇÃO EM TEMPO CONSTANTE.
 *
 * `a === b` numa string vaza, pelo tempo que a comparação leva, quantos
 * caracteres do começo já bateram. Pouco em uma chamada só — mas é
 * exatamente a fresta que um script tentando adivinhar por tentativa e
 * erro exploraria. `timingSafeEqual` fecha essa fresta, e não custa nada
 * usá-lo aqui.
 */
function chaveConfere(recebida: string | undefined): boolean {
  const esperada = process.env.CHAVE_NOTIFICAR_ATUALIZACAO;
  if (!esperada || !recebida) return false;
  const bufA = Buffer.from(recebida);
  const bufB = Buffer.from(esperada);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  try {
    const chaveRecebida = (req.headers?.["x-chave-atualizacao"] as string | undefined) ?? undefined;
    if (!chaveConfere(chaveRecebida)) {
      throw new ErroNotificacao("Chave de atualização ausente ou incorreta.", 401);
    }

    const modulos = await carregarAdmin();
    const app = aplicativoAdmin(modulos);

    const snapshot = await modulos.firestore.getFirestore(app).collection("dispositivos").get();
    const tokens = snapshot.docs
      .map((documento) => documento.get("token") as string)
      .filter((token): token is string => Boolean(token));

    if (tokens.length === 0) {
      res.status(200).json({ enviados: 0, registrados: 0, aviso: "Nenhum aparelho registrado ainda." });
      return;
    }

    /**
     * O TEXTO DIZ O QUE FAZER, NÃO SÓ O QUE ACONTECEU (set/2026, pedido
     * do dono do negócio: "o usuário deve ser orientado a clicar no
     * botão de atualização"). Quem recebe "Atualização disponível" sem
     * mais nada não sabe se precisa fazer alguma coisa — o corpo do
     * aviso é a instrução completa, porque não existe uma segunda tela
     * de ajuda depois dele.
     */
    const titulo = "Atualização disponível";
    const corpo = 'Toque aqui e depois no botão "Atualizar agora" para aplicar a versão nova.';

    const resultado = await modulos.messaging.getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title: titulo, body: corpo },
      // O toque abre a raiz do app: a faixa de atualização mora fora das
      // abas (ver src/main.tsx) e aparece em qualquer tela, então não
      // existe uma rota mais certa que outra para levar a pessoa.
      data: { titulo, corpo, tag: "atualizacao-disponivel", url: "/" },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          title: titulo,
          body: corpo,
          icon: "/pwa-192x192.png",
          badge: "/badge-96x96.png",
          /**
           * UMA TAG SÓ, SEM `renotify` — diferente de todo outro aviso
           * deste projeto. Dois deploys no mesmo dia não precisam
           * empilhar dois avisos nem tocar duas vezes: o segundo
           * substitui o primeiro em silêncio, porque a informação
           * continua sendo a mesma — "tem versão nova esperando".
           */
          tag: "atualizacao-disponivel",
          renotify: false,
          /**
           * FICA NA TELA ATÉ ALGUÉM TOCAR (set/2026, pedido do dono do
           * negócio: "o som só para depois de abrir"). O navegador não
           * nos deixa controlar se o SOM repete — quem decide isso é o
           * sistema operacional do celular —, mas `requireInteraction`
           * é o que garante que o AVISO em si não some sozinho da tela
           * antes de alguém tocar nele.
           */
          requireInteraction: true,
          silent: false,
        },
      },
    });

    const invalidos = resultado.responses
      .map((resposta, indice) => ({ resposta, token: tokens[indice] }))
      .filter(
        ({ resposta }) =>
          resposta.error?.code === "messaging/registration-token-not-registered" ||
          resposta.error?.code === "messaging/invalid-registration-token"
      );
    for (const { token } of invalidos) {
      await modulos.firestore.getFirestore(app).collection("dispositivos").doc(token).delete();
    }

    res.status(200).json({
      enviados: resultado.successCount,
      falharam: resultado.failureCount,
      removidos: invalidos.length,
      registrados: tokens.length,
    });
  } catch (erro) {
    if (erro instanceof ErroNotificacao) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    console.error("Falha ao avisar sobre a atualização:", erro);
    res.status(500).json({
      erro: `Não foi possível avisar sobre a atualização. Motivo técnico: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    });
  }
}
