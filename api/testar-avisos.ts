/**
 * api/testar-avisos.ts
 * ---------------------------------------------------------------
 * Diagnóstico de avisos: dispara um push de TESTE para cada aparelho
 * registrado e devolve um `testeId` que o painel usa para acompanhar,
 * em tempo real, quem confirmou o recebimento (set/2026, pedido do dono
 * do negócio: "verificar se o fluxo completo de notificação está
 * funcionando em todos os dispositivos registrados").
 *
 * POR QUE NÃO REAPROVEITAR /api/notificar-fornada
 * -------------------------------------------------
 * Aquele endereço sempre manda o bloco `notification` — é a correção
 * documentada lá que faz o NAVEGADOR desenhar o aviso sozinho, sem
 * depender do service worker acordar (ver o comentário grande em torno
 * de `sendEachForMulticast` naquele arquivo). Só que é exatamente esse
 * comportamento que IMPEDE este diagnóstico de funcionar: com
 * `notification` presente, `onBackgroundMessage` NUNCA é chamado — o
 * service worker não roda nenhuma linha de código nossa, e não existe
 * como confirmar nada.
 *
 * Por isso o teste manda SÓ `data`. É a única forma de o código do
 * service worker rodar quando o app está fechado — e o risco que essa
 * troca evitaria na fornada (aviso mudo, sem erro nenhum) é o PRÓPRIO
 * RESULTADO que este teste existe para detectar. Um aparelho que não
 * confirma aqui está descrevendo exatamente o defeito relatado: push
 * que não chega com o app fechado.
 *
 * CADA APARELHO RECEBE O PRÓPRIO TOKEN DE VOLTA no `data`, em vez de o
 * service worker precisar descobrir o seu (`getToken` dentro de um
 * service worker tem restrições próprias e reintroduziria a mesma
 * fragilidade que este arquivo evita). Quem sabe qual token foi
 * endereçado a qual aparelho é este servidor — é só devolver.
 *
 * QUEM PODE CHAMAR: só a matriz, pelo mesmo mecanismo (e as mesmas
 * limitações de firebase-admin/auth) descritos em notificar-fornada.ts.
 */

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
    throw new ErroDiagnostico(
      `O servidor não conseguiu carregar a biblioteca do Firebase: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
      500
    );
  }
}

/** Erro de domínio — sempre com mensagem apresentável no painel. */
class ErroDiagnostico extends Error {
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
    throw new ErroDiagnostico(
      "Os avisos não estão configurados no servidor (falta FIREBASE_SERVICE_ACCOUNT).",
      503
    );
  }
  let credencial: import("firebase-admin/app").ServiceAccount;
  try {
    credencial = JSON.parse(bruto) as import("firebase-admin/app").ServiceAccount;
  } catch {
    throw new ErroDiagnostico(
      "A chave de serviço configurada no servidor está inválida — confira se o JSON foi colado inteiro.",
      503
    );
  }
  return initializeApp({ credential: cert(credencial) });
}

/**
 * Chave web do projeto — a MESMA de src/lib/firebase.ts, pública por
 * desenho. Ela não autentica ninguém: só diz a qual projeto do Firebase a
 * pergunta se refere. Quem prova a identidade é o token de quem chamou.
 */
const CHAVE_WEB = "AIzaSyAWQq1TVzd9ycS8tpwl-lxmj7SPek0Pyuc";

/**
 * Espelho de LOJAS_POR_EMAIL em notificar-fornada.ts — os dois mudam
 * juntos se um dia entrar uma quarta loja.
 */
const LOJAS_POR_EMAIL: Record<string, { id: string; nome: string }> = {
  "matriz@paodemel.local": { id: "MATRIZ", nome: "Matriz" },
  "arthur@paodemel.local": { id: "FILIAL_ARTHUR_BERNARDES", nome: "Arthur Bernardes" },
  "benjamin@paodemel.local": { id: "FILIAL_BENJAMIN_CONSTANT", nome: "Benjamin Constant" },
};

/**
 * Mesma verificação de notificar-fornada.ts (ver o comentário lá sobre
 * por que não é firebase-admin/auth): confere o token pelo REST do
 * Identity Toolkit, e exige que seja a MATRIZ — só ela dispara o teste.
 */
async function confirmarQueEhAMatriz(cabecalho: string | undefined): Promise<void> {
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!token) throw new ErroDiagnostico("Sem credencial.", 401);

  let resposta: Response;
  try {
    resposta = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CHAVE_WEB}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
  } catch {
    throw new ErroDiagnostico("Não foi possível validar a credencial agora.", 503);
  }
  if (!resposta.ok) throw new ErroDiagnostico("Credencial inválida ou expirada.", 401);

  const dados = (await resposta.json()) as { users?: { email?: string }[] };
  const email = (dados.users?.[0]?.email ?? "").toLowerCase();
  const loja = LOJAS_POR_EMAIL[email];
  if (!loja || loja.id !== "MATRIZ") {
    throw new ErroDiagnostico("Só a matriz pode rodar este diagnóstico.", 403);
  }
}

/**
 * Um id de execução curto — não precisa ser criptográfico, só não
 * colidir entre dois testes disparados no mesmo instante.
 */
function gerarTesteId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  try {
    await confirmarQueEhAMatriz(req.headers?.authorization);
    const modulos = await carregarAdmin();
    const app = aplicativoAdmin(modulos);

    // TODOS os aparelhos, de toda loja — inclusive da própria matriz: o
    // diagnóstico existe para provar que CADA um recebe, e o aparelho da
    // matriz não é exceção.
    const snapshot = await modulos.firestore.getFirestore(app).collection("dispositivos").get();
    const aparelhos = snapshot.docs
      .map((documento) => ({
        token: documento.get("token") as string,
        lojaId: (documento.get("lojaId") as string) || "DESCONHECIDA",
      }))
      .filter((a) => Boolean(a.token));

    if (aparelhos.length === 0) {
      res.status(200).json({
        testeId: "",
        aparelhos: [],
        enviados: 0,
        falharam: 0,
        aviso: "Nenhum aparelho registrado ainda.",
      });
      return;
    }

    const testeId = gerarTesteId();

    /**
     * SÓ `data`, sem `notification` — ver o comentário grande no topo do
     * arquivo sobre por que é exatamente essa diferença que faz este
     * diagnóstico funcionar. Cada mensagem leva o PRÓPRIO token de
     * volta, para o service worker não precisar descobrir o seu.
     */
    const mensagens = aparelhos.map((aparelho) => ({
      token: aparelho.token,
      data: {
        tipo: "diagnostico-avisos",
        testeId,
        token: aparelho.token,
      },
    }));

    const resultado = await modulos.messaging.getMessaging(app).sendEach(mensagens);

    const invalidos = resultado.responses
      .map((resposta, indice) => ({ resposta, token: aparelhos[indice].token }))
      .filter(
        ({ resposta }) =>
          resposta.error?.code === "messaging/registration-token-not-registered" ||
          resposta.error?.code === "messaging/invalid-registration-token"
      );
    for (const { token } of invalidos) {
      await modulos.firestore.getFirestore(app).collection("dispositivos").doc(token).delete();
    }
    const removidos = new Set(invalidos.map((i) => i.token));

    res.status(200).json({
      testeId,
      // Sem os removidos — testar um aparelho que acabou de ser apagado
      // pelo próprio envio não serviria para nada.
      aparelhos: aparelhos.filter((a) => !removidos.has(a.token)),
      enviados: resultado.successCount,
      falharam: resultado.failureCount,
      removidos: invalidos.length,
    });
  } catch (erro) {
    if (erro instanceof ErroDiagnostico) {
      res.status(erro.status).json({ erro: erro.message });
      return;
    }
    console.error("Falha ao rodar o diagnóstico de avisos:", erro);
    res.status(500).json({
      erro: `Não foi possível rodar o diagnóstico. Motivo técnico: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
    });
  }
}
