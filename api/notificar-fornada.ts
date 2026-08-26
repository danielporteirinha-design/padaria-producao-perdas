/**
 * api/notificar-fornada.ts
 * ---------------------------------------------------------------
 * Avisa as filiais que uma fornada saiu do forno na matriz (ago/2026).
 *
 * Roda no servidor, e não no navegador, por dois motivos que não são
 * negociáveis:
 *
 * 1. Enviar mensagem pelo Firebase Cloud Messaging exige uma CHAVE DE
 *    SERVIÇO. Ela ignora todas as regras de segurança do banco — se
 *    estivesse no bundle do app, qualquer pessoa que abrisse o DevTools
 *    no celular teria acesso total aos dados das três lojas.
 * 2. O celular da matriz não sabe os tokens dos aparelhos das filiais.
 *    Quem lê a lista de dispositivos é o servidor.
 *
 * QUEM PODE CHAMAR
 * ----------------
 * Só a matriz. O app manda o token de identidade do Firebase junto, e
 * aqui ele é verificado de verdade (assinatura e validade) antes de
 * qualquer envio. Sem isso, um endereço público conseguiria disparar
 * notificação para os celulares da padaria inteira.
 *
 * ASSINATURA: (req, res), NÃO Request/Response
 * ---------------------------------------------
 * Esta função nasceu escrita no padrão Web (`Request` -> `Response`) e
 * NUNCA funcionou em produção: o runtime Node do Vercel injeta um
 * `http.IncomingMessage`, onde `headers` é um objeto simples. Chamar
 * `headers.get("authorization")` estourava TypeError, e o `Response`
 * devolvido pelo catch era ignorado pelo runtime — resultado: HTTP 500
 * genérico, sem corpo JSON, indistinguível de "chave de serviço errada".
 *
 * As outras duas funções de /api já usavam (req, res). Esta agora segue a
 * mesma convenção — uma convenção por projeto, e não uma por arquivo.
 *
 * CONFIGURAÇÃO NO VERCEL
 * ----------------------
 * Uma variável de ambiente, `FIREBASE_SERVICE_ACCOUNT`, com o conteúdo
 * do JSON baixado em Configurações do projeto → Contas de serviço →
 * Gerar nova chave privada. Cole o JSON inteiro, numa linha só.
 */

import { cert, getApp, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const EMAIL_MATRIZ = "matriz@paodemel.local";

/** Erro de domínio — sempre com mensagem apresentável ao operador. */
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
function aplicativoAdmin() {
  if (getApps().length > 0) return getApp();

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    throw new ErroNotificacao(
      "Os avisos não estão configurados no servidor (falta FIREBASE_SERVICE_ACCOUNT).",
      503
    );
  }
  let credencial: ServiceAccount;
  try {
    credencial = JSON.parse(bruto) as ServiceAccount;
  } catch {
    throw new ErroNotificacao(
      "A chave de serviço configurada no servidor está inválida — confira se o JSON foi colado inteiro.",
      503
    );
  }
  return initializeApp({ credential: cert(credencial) });
}

async function confirmarQueEhAMatriz(cabecalho: string | undefined) {
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!token) throw new ErroNotificacao("Sem credencial.", 401);

  let decodificado;
  try {
    decodificado = await getAuth(aplicativoAdmin()).verifyIdToken(token);
  } catch {
    throw new ErroNotificacao("Credencial inválida ou expirada.", 401);
  }
  if ((decodificado.email ?? "").toLowerCase() !== EMAIL_MATRIZ) {
    throw new ErroNotificacao("Só a matriz avisa que a fornada saiu.", 403);
  }
}

// Tipagem mínima e deliberadamente solta, igual às outras funções de /api.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  try {
    await confirmarQueEhAMatriz(req.headers?.authorization);

    const corpoBruto: {
      nomeProduto?: string;
      codigoPdv?: number;
      vezesHoje?: number;
      teste?: boolean;
    } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const { nomeProduto, codigoPdv, vezesHoje, teste } = corpoBruto;
    if (!teste && (!nomeProduto || typeof codigoPdv !== "number")) {
      throw new ErroNotificacao("Faltou o produto no pedido de aviso.", 400);
    }

    const app = aplicativoAdmin();

    // Só aparelhos de FILIAL: a matriz não precisa ser avisada do que ela
    // mesma acabou de marcar.
    const snapshot = await getFirestore(app)
      .collection("dispositivos")
      .where("lojaId", "!=", "MATRIZ")
      .get();

    const tokens = snapshot.docs
      .map((documento) => documento.get("token") as string)
      .filter((token): token is string => Boolean(token));

    if (tokens.length === 0) {
      res.status(200).json({
        enviados: 0,
        registrados: 0,
        aviso: "Nenhuma filial ativou os avisos ainda.",
      });
      return;
    }

    const corpo = teste
      ? "Teste de aviso. Se você está vendo isto, as notificações estão funcionando."
      : vezesHoje && vezesHoje > 1
        ? `${vezesHoje}ª fornada de hoje. Está sem no balcão? Peça reposição.`
        : "Acabou de sair do forno. Está sem no balcão? Peça reposição.";

    /**
     * Payload só de `data`, sem o bloco `notification`: assim o service
     * worker monta a notificação e consegue aplicar a `tag`, que faz o
     * aviso do MESMO produto substituir o anterior. Pão francês sai seis
     * vezes por dia — sem isso seriam seis avisos empilhados do mesmo
     * item, e a filial aprenderia a ignorar todos.
     */
    const resultado = await getMessaging(app).sendEachForMulticast({
      tokens,
      data: {
        titulo: teste ? "Padaria Pão de Mel" : nomeProduto!,
        corpo,
        tag: teste ? "teste-aviso" : `fornada-${codigoPdv}`,
      },
      /**
       * Sem `fcmOptions.link` de propósito. O FCM exige que esse campo,
       * quando presente, seja uma URL HTTPS COMPLETA — um caminho relativo
       * como "/" é recusado na validação e derruba o envio inteiro, com
       * token válido e tudo. E ele seria redundante aqui: quem decide o que
       * abrir ao tocar no aviso é o `notificationclick` do service worker,
       * que já foca a janela existente em vez de abrir outra aba.
       */
      webpush: {
        headers: { Urgency: "high" },
      },
    });

    // Token de aparelho que desinstalou o app ou limpou os dados fica
    // inválido para sempre. Remover evita a lista crescer com lixo e
    // cada envio gastar tentativa em celular que não existe mais.
    const invalidos = resultado.responses
      .map((resposta, indice) => ({ resposta, token: tokens[indice] }))
      .filter(
        ({ resposta }) =>
          resposta.error?.code === "messaging/registration-token-not-registered" ||
          resposta.error?.code === "messaging/invalid-registration-token"
      );

    for (const { token } of invalidos) {
      await getFirestore(app).collection("dispositivos").doc(token).delete();
    }

    /**
     * Os códigos de erro do FCM voltam para a tela. Sem isso, "marquei e
     * não chegou nada" é indistinguível de "chegou e o celular não tocou",
     * e a investigação vira tentativa e erro. Só os códigos, sem token
     * nenhum: identificam a causa e não expõem aparelho.
     */
    const motivos = [
      ...new Set(
        resultado.responses
          .filter((resposta) => resposta.error)
          .map((resposta) => resposta.error?.code ?? "desconhecido")
      ),
    ];

    res.status(200).json({
      enviados: resultado.successCount,
      falharam: resultado.failureCount,
      removidos: invalidos.length,
      registrados: tokens.length,
      motivos,
    });
  } catch (erro) {
    if (erro instanceof ErroNotificacao) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    console.error("Falha ao avisar as filiais:", erro);
    /**
     * A mensagem técnica vai junto. Aviso é infraestrutura: sem o motivo
     * real na tela, quem está na padaria não tem como distinguir chave
     * errada de token vencido, e a investigação vira tentativa e erro.
     */
    res.status(500).json({
      erro: `Não foi possível avisar as filiais (a fornada foi marcada normalmente). Motivo técnico: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    });
  }
}
