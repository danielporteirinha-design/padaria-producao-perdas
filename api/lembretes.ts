/**
 * api/lembretes.ts
 * ---------------------------------------------------------------
 * Lembretes diários por push, disparados por agendador (ago/2026).
 *
 *   17:30 — filiais que ainda NÃO mandaram a lista do dia seguinte
 *   12:45 — todas as filiais, sobre reposição e devolução para a matriz
 *
 * POR QUE O DE 17:30 É SELETIVO
 * -----------------------------
 * Ele consulta os pedidos antes de mandar e avisa SÓ quem está devendo.
 * Um lembrete que chega para quem já cumpriu a tarefa ensina a ignorar
 * lembretes — e aí, no dia em que a loja realmente esquecer, o aviso
 * chega e ninguém lê. Se as duas filiais já enviaram, ninguém recebe
 * nada, e isso é o comportamento certo.
 *
 * O de 12:45 é para todas: ele não cobra tarefa atrasada, abre uma
 * janela ("é agora que dá tempo de pedir reposição para hoje").
 *
 * QUEM PODE CHAMAR
 * ----------------
 * Só quem apresentar o CRON_SECRET. O Vercel injeta esse cabeçalho
 * sozinho nos cron jobs quando a variável existe; um agendador externo
 * precisa mandá-lo à mão. Sem isso, um endereço público conseguiria
 * disparar push para os celulares da padaria a qualquer hora.
 */

type ModulosAdmin = {
  app: typeof import("firebase-admin/app");
  firestore: typeof import("firebase-admin/firestore");
  messaging: typeof import("firebase-admin/messaging");
};

/** Espelho de src/lib/lojas.ts. Entrou loja nova? Os dois mudam juntos. */
const FILIAIS = [
  { id: "FILIAL_ARTHUR_BERNARDES", nome: "Arthur Bernardes" },
  { id: "FILIAL_BENJAMIN_CONSTANT", nome: "Benjamin Constant" },
];

class ErroLembrete extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Import dinâmico pelo mesmo motivo de api/notificar-fornada.ts: import
 * de topo roda antes do try, e uma falha de carga viraria um 500 sem
 * corpo — impossível de diagnosticar num endpoint que ninguém está
 * olhando na hora em que ele roda.
 */
async function carregarAdmin(): Promise<ModulosAdmin> {
  const [app, firestore, messaging] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
    import("firebase-admin/messaging"),
  ]);
  return { app, firestore, messaging };
}

function aplicativoAdmin(modulos: ModulosAdmin) {
  const { cert, getApp, getApps, initializeApp } = modulos.app;
  if (getApps().length > 0) return getApp();

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    throw new ErroLembrete("Falta FIREBASE_SERVICE_ACCOUNT no servidor.", 503);
  }
  return initializeApp({ credential: cert(JSON.parse(bruto)) });
}

function conferirSegredo(req: { headers?: Record<string, string | undefined> }) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    throw new ErroLembrete(
      "Falta CRON_SECRET no servidor — sem ele o lembrete ficaria aberto a qualquer um.",
      503
    );
  }
  const recebido = req.headers?.authorization ?? "";
  if (recebido !== `Bearer ${esperado}`) {
    throw new ErroLembrete("Credencial do agendador inválida.", 401);
  }
}

/** Data de AMANHÃ no fuso de São Paulo, no formato do banco (YYYY-MM-DD). */
function dataDeAmanhaEmSaoPaulo(): string {
  const agora = new Date();
  const emSaoPaulo = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  emSaoPaulo.setDate(emSaoPaulo.getDate() + 1);
  const mes = String(emSaoPaulo.getMonth() + 1).padStart(2, "0");
  const dia = String(emSaoPaulo.getDate()).padStart(2, "0");
  return `${emSaoPaulo.getFullYear()}-${mes}-${dia}`;
}

/** Filiais que ainda não enviaram o pedido DIÁRIO para a data. */
async function filiaisDevendo(modulos: ModulosAdmin, app: object, data: string) {
  const snapshot = await modulos.firestore
    .getFirestore(app as never)
    .collection("pedidos")
    .where("data", "==", data)
    .get();

  const enviaram = new Set(
    snapshot.docs
      .filter((d) => d.get("status") === "enviado" && d.get("tipo") !== "reposicao")
      .map((d) => d.get("lojaId") as string)
  );
  return FILIAIS.filter((f) => !enviaram.has(f.id));
}

import { filtrarDestinatarios } from "./manutencao";

async function tokensDasLojas(modulos: ModulosAdmin, app: object, lojaIds: string[]) {
  if (lojaIds.length === 0) return [];
  const snapshot = await modulos.firestore
    .getFirestore(app as never)
    .collection("dispositivos")
    .where("lojaId", "in", lojaIds)
    .get();
  /**
   * MODO DE MANUTENÇÃO — ver api/manutencao.ts. O lembrete automático é
   * o pior de todos para tocar durante um teste: ele dispara sozinho, por
   * horário, sem ninguém do lado para explicar o que aconteceu.
   */
  return filtrarDestinatarios(
    snapshot.docs.map((d) => ({
      token: d.get("token") as string | undefined,
      registradoPor: d.get("registradoPor") as string | undefined,
    }))
  ).tokens;
}

export default async function handler(req: any, res: any) {
  try {
    conferirSegredo(req);

    const tipo = (req.query?.tipo as string) || "lista";
    const modulos = await carregarAdmin();
    const app = aplicativoAdmin(modulos);

    let alvos: string[];
    let titulo: string;
    let corpo: string;
    let etiqueta: string;

    if (tipo === "reposicao") {
      alvos = FILIAIS.map((f) => f.id);
      titulo = "Precisa de reposição hoje?";
      corpo = "É a hora de pedir reposição ou avisar devolução para a matriz.";
      etiqueta = "lembrete-reposicao";
    } else {
      const data = dataDeAmanhaEmSaoPaulo();
      const devendo = await filiaisDevendo(modulos, app, data);
      // Ninguém devendo, ninguém avisado. Lembrete que chega para quem já
      // cumpriu a tarefa ensina a ignorar lembretes.
      if (devendo.length === 0) {
        res.status(200).json({ enviados: 0, aviso: "Todas as filiais já enviaram a lista." });
        return;
      }
      alvos = devendo.map((f) => f.id);
      titulo = "Falta a lista de amanhã";
      corpo = "Envie o pedido do dia seguinte para entrar na produção desta noite.";
      etiqueta = "lembrete-lista";
    }

    const tokens = await tokensDasLojas(modulos, app, alvos);
    if (tokens.length === 0) {
      res.status(200).json({ enviados: 0, aviso: "Nenhum aparelho registrado nas lojas alvo." });
      return;
    }

    const resultado = await modulos.messaging.getMessaging(app as never).sendEachForMulticast({
      tokens,
      data: { titulo, corpo, tag: etiqueta },
      webpush: { headers: { Urgency: "high" } },
    });

    res.status(200).json({
      tipo,
      lojas: alvos,
      enviados: resultado.successCount,
      falharam: resultado.failureCount,
    });
  } catch (erro) {
    if (erro instanceof ErroLembrete) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    console.error("Falha no lembrete:", erro);
    res.status(500).json({
      erro: `Não foi possível enviar o lembrete. Motivo técnico: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    });
  }
}
