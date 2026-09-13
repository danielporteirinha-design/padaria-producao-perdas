/**
 * api/confirmar-recebimento.ts
 * ---------------------------------------------------------------
 * Recebe a confirmação de UM aparelho de que o push de diagnóstico
 * chegou — mesmo com o app fechado (set/2026). Ver o comentário grande
 * em api/testar-avisos.ts para o desenho completo do diagnóstico.
 *
 * QUEM CHAMA ISTO NÃO ESTÁ LOGADO
 * -----------------------------------
 * Quem chama é o SERVICE WORKER (public/firebase-messaging-sw.js) ou a
 * própria página em primeiro plano (src/lib/notificacoes.ts) — nos dois
 * casos, sem sessão do Firebase Auth disponível ali: um service worker
 * não compartilha o login da aba, e é exatamente o caso "app fechado"
 * que isto precisa conseguir registrar. Por isso este endereço não pede
 * credencial — só confere que o TOKEN informado é de um aparelho de
 * verdade registrado em `dispositivos`, o que é o bastante para o único
 * uso que existe deste endereço: reduzir "qualquer um pode gravar
 * qualquer coisa aqui" a "só quem sabe o token de um aparelho real
 * consegue", e isso não abre porta nenhuma que a coleção `dispositivos`
 * já não abrisse — o token, sozinho, não dá acesso a nada além de
 * marcar presença neste diagnóstico.
 */

type ModulosAdmin = {
  app: typeof import("firebase-admin/app");
  firestore: typeof import("firebase-admin/firestore");
};

async function carregarAdmin(): Promise<ModulosAdmin> {
  try {
    const [app, firestore] = await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/firestore"),
    ]);
    return { app, firestore };
  } catch (erro) {
    throw new ErroConfirmacao(
      `O servidor não conseguiu carregar a biblioteca do Firebase: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
      500
    );
  }
}

class ErroConfirmacao extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function aplicativoAdmin(modulos: ModulosAdmin) {
  const { cert, getApp, getApps, initializeApp } = modulos.app;
  if (getApps().length > 0) return getApp();

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    throw new ErroConfirmacao(
      "Os avisos não estão configurados no servidor (falta FIREBASE_SERVICE_ACCOUNT).",
      503
    );
  }
  let credencial: import("firebase-admin/app").ServiceAccount;
  try {
    credencial = JSON.parse(bruto) as import("firebase-admin/app").ServiceAccount;
  } catch {
    throw new ErroConfirmacao(
      "A chave de serviço configurada no servidor está inválida — confira se o JSON foi colado inteiro.",
      503
    );
  }
  return initializeApp({ credential: cert(credencial) });
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  try {
    const corpo: { testeId?: string; token?: string } =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const { testeId, token } = corpo;
    if (!testeId || !token) {
      throw new ErroConfirmacao("Faltou testeId ou token.", 400);
    }

    const modulos = await carregarAdmin();
    const app = aplicativoAdmin(modulos);
    const banco = modulos.firestore.getFirestore(app);

    // Só grava se o token pertence a um aparelho de verdade — ver o
    // comentário no topo sobre por que isto basta sem exigir login.
    const aparelho = await banco.collection("dispositivos").doc(token).get();
    if (!aparelho.exists) {
      res.status(200).json({ ok: false, aviso: "Aparelho não registrado — confirmação ignorada." });
      return;
    }

    // O id do documento leva o teste E o aparelho: reabrir o app três
    // vezes durante a mesma janela de teste atualiza o horário em vez
    // de empilhar três confirmações do mesmo aparelho.
    await banco
      .collection("confirmacoes_teste_aviso")
      .doc(`${testeId}_${token}`)
      .set({ testeId, token, confirmadoEm: new Date().toISOString() });

    res.status(200).json({ ok: true });
  } catch (erro) {
    if (erro instanceof ErroConfirmacao) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    console.error("Falha ao confirmar recebimento do diagnóstico:", erro);
    res.status(500).json({
      erro: `Não foi possível confirmar. Motivo técnico: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    });
  }
}
