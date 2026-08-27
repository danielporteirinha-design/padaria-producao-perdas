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
 * NADA DE firebase-admin/auth AQUI
 * --------------------------------
 * Ver o comentário em confirmarQueEhAMatriz: aquele submódulo derruba a
 * função inteira no runtime do Vercel (ERR_REQUIRE_ESM via jwks-rsa/jose).
 * Firestore e Messaging carregam sem problema e continuam sendo usados.
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

/**
 * O firebase-admin entra por IMPORT DINÂMICO, dentro do try do handler, e
 * não no topo do arquivo. Import de topo roda antes de qualquer linha
 * minha: se o pacote falhar ao carregar no runtime do Vercel (versão de
 * Node, resolução de subcaminho, dependência nativa ausente), a função
 * morre antes do try e o Vercel devolve um 500 dele, sem corpo JSON — que
 * na tela vira "HTTP 500" pelado, exatamente o erro mais difícil de
 * diagnosticar e o que já custou uma manhã aqui. Carregando aqui dentro,
 * qualquer falha de carga vira mensagem legível como todas as outras.
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
    throw new ErroNotificacao(
      `O servidor não conseguiu carregar a biblioteca do Firebase: ${
        erro instanceof Error ? erro.message : String(erro)
      }`,
      500
    );
  }
}

/**
 * Espelho de src/lib/lojas.ts e de firestore.rules. Entrou uma quarta
 * loja? Os três mudam juntos.
 */
const LOJAS_POR_EMAIL: Record<string, { id: string; nome: string }> = {
  "matriz@paodemel.local": { id: "MATRIZ", nome: "Matriz" },
  "arthur@paodemel.local": { id: "FILIAL_ARTHUR_BERNARDES", nome: "Arthur Bernardes" },
  "benjamin@paodemel.local": { id: "FILIAL_BENJAMIN_CONSTANT", nome: "Benjamin Constant" },
};

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
 * Chave web do projeto — a MESMA de src/lib/firebase.ts, pública por
 * desenho. Ela não autentica ninguém: só diz a qual projeto do Firebase a
 * pergunta se refere. Quem prova a identidade é o token de quem chamou.
 */
const CHAVE_WEB = "AIzaSyAWQq1TVzd9ycS8tpwl-lxmj7SPek0Pyuc";

/**
 * Descobre QUAL LOJA está chamando, pelo endpoint REST do Identity
 * Toolkit — e NÃO por `firebase-admin/auth`.
 *
 * Quem decide o destino do aviso é esta função, a partir do e-mail
 * verificado pelo Google — nunca um campo mandado pelo app. Se a filial
 * pudesse declarar "sou a matriz" no corpo da requisição, qualquer conta
 * conseguiria disparar aviso para todos os celulares da padaria.
 *
 * Motivo, encontrado em produção (ago/2026): `firebase-admin/auth` carrega
 * `jwks-rsa`, que faz `require('jose')`; o `jose` virou pacote só-ESM, e o
 * runtime do Vercel não faz `require()` de ESM. A função inteira morria com
 * ERR_REQUIRE_ESM antes de executar uma linha — e o único uso que eu fazia
 * do módulo era verificar este token.
 *
 * A verificação continua sendo do Google e do lado do servidor: token
 * adulterado, expirado ou de outro projeto é recusado aqui. O que mudou foi
 * a via, não o rigor.
 */
async function lojaDeQuemChamou(cabecalho: string | undefined) {
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  if (!token) throw new ErroNotificacao("Sem credencial.", 401);

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
    throw new ErroNotificacao("Não foi possível validar a credencial agora.", 503);
  }
  if (!resposta.ok) throw new ErroNotificacao("Credencial inválida ou expirada.", 401);

  const dados = (await resposta.json()) as { users?: { email?: string }[] };
  const email = (dados.users?.[0]?.email ?? "").toLowerCase();
  const loja = LOJAS_POR_EMAIL[email];
  if (!loja) {
    throw new ErroNotificacao("Esta conta não pertence a nenhuma loja.", 403);
  }
  return loja;
}

// Tipagem mínima e deliberadamente solta, igual às outras funções de /api.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  try {
    const quemChamou = await lojaDeQuemChamou(req.headers?.authorization);
    const modulos = await carregarAdmin();

    const corpoBruto: {
      nomeProduto?: string;
      codigoPdv?: number;
      vezesHoje?: number;
      quantidade?: number;
      paraLojaId?: string;
      motivo?: string;
      desfecho?: "confirmado" | "cancelado";
      teste?: boolean;
      /** Aviso de lista diária enviada — não fala de um produto só. */
      listaDiaria?: boolean;
      variedades?: number;
    } = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const {
      nomeProduto,
      codigoPdv,
      vezesHoje,
      quantidade,
      paraLojaId,
      motivo,
      desfecho,
      teste,
      listaDiaria,
      variedades,
    } = corpoBruto;
    // O aviso de lista diária e o de teste não falam de um produto — os
    // outros, sim, e sem o nome o celular receberia um aviso em branco.
    if (!teste && !listaDiaria && (!nomeProduto || typeof codigoPdv !== "number")) {
      throw new ErroNotificacao("Faltou o produto no pedido de aviso.", 400);
    }

    /**
     * O aviso corre nos DOIS sentidos, e o remetente nunca é avisado do
     * que ele mesmo acabou de fazer:
     *
     *   matriz  -> filiais : "saiu do forno"
     *   filial  -> matriz  : "pediu reposição"
     *
     * A segunda direção nasceu do uso real: a filial pedia reposição e a
     * matriz só descobria ao abrir o app. Um pedido de reposição existe
     * justamente porque é urgente — se ele espera alguém lembrar de
     * olhar a tela, perdeu a razão de existir.
     */
    const ehDaMatriz = quemChamou.id === "MATRIZ";

    /**
     * Só a matriz pode endereçar uma loja específica — é ela que responde
     * "confirmado" ou "cancelado" a quem pediu. Se uma filial pudesse
     * escolher o destinatário, conseguiria mandar aviso para a loja
     * vizinha em nome da matriz.
     */
    const destinoDirigido = ehDaMatriz && paraLojaId ? paraLojaId : undefined;

    const app = aplicativoAdmin(modulos);

    // Só aparelhos de FILIAL: a matriz não precisa ser avisada do que ela
    // mesma acabou de marcar.
    const colecao = modulos.firestore.getFirestore(app).collection("dispositivos");
    const snapshot = destinoDirigido
      ? await colecao.where("lojaId", "==", destinoDirigido).get()
      : ehDaMatriz
        ? await colecao.where("lojaId", "!=", "MATRIZ").get()
        : await colecao.where("lojaId", "==", "MATRIZ").get();

    const tokens = snapshot.docs
      .map((documento) => documento.get("token") as string)
      .filter((token): token is string => Boolean(token));

    if (tokens.length === 0) {
      res.status(200).json({
        enviados: 0,
        registrados: 0,
        aviso: ehDaMatriz
          ? "Nenhuma filial ativou os avisos ainda."
          : "A matriz ainda não ativou os avisos neste computador.",
      });
      return;
    }

    let titulo: string;
    let corpo: string;
    let etiqueta: string;
    /** Aba que o toque no aviso abre — ver src/lib/rota.ts. */
    let destinoNoApp = "/?aba=fornada";

    if (desfecho && destinoDirigido) {
      // Resposta à reposição. O motivo vai no corpo do aviso, não numa
      // tela que a filial teria que abrir: quem está sem o produto no
      // balcão precisa decidir o que fazer agora, e o motivo é o que
      // muda a decisão — esperar a próxima fornada é uma coisa, acabou a
      // matéria-prima é outra.
      titulo =
        desfecho === "confirmado"
          ? `${nomeProduto} confirmado`
          : `${nomeProduto} não será enviado`;
      corpo =
        desfecho === "confirmado"
          ? "A matriz separou e manda na próxima entrega."
          : motivo || "A matriz cancelou o pedido.";
      etiqueta = `reposicao-resposta-${codigoPdv}`;
    } else if (listaDiaria) {
      /**
       * Lista diária enviada pela filial (ago/2026). É planejamento, não
       * urgência — mas a matriz monta o cronograma no fim do expediente e,
       * se uma filial atrasa, a produção sai sem ela e a loja abre no dia
       * seguinte sem mercadoria. O aviso existe para essa espera ter fim
       * conhecido, em vez de a matriz ficar reabrindo a tela para ver se
       * chegou.
       *
       * Uma etiqueta por LOJA: a filial que reenvia a lista corrigida
       * substitui o próprio aviso, e as duas lojas continuam somando.
       */
      titulo = `${quemChamou.nome} enviou a lista`;
      corpo =
        typeof variedades === "number" && variedades > 0
          ? `${variedades} ${variedades === 1 ? "produto" : "produtos"} para amanhã. Toque para ver no Cronograma.`
          : "Lista do dia seguinte enviada. Toque para ver no Cronograma.";
      etiqueta = `lista-${quemChamou.id}`;
      destinoNoApp = "/?aba=cronograma";
    } else if (teste) {
      titulo = "Padaria Pão de Mel";
      corpo = "Teste de aviso. Se você está vendo isto, as notificações estão funcionando.";
      etiqueta = "teste-aviso";
    } else if (ehDaMatriz) {
      // O corpo diz que ESTÁ DISPONÍVEL PARA PEDIDO, e não só que saiu
      // (ago/2026). A diferença não é de redação: o aviso agora também
      // anuncia item fora do cronograma, e "saiu do forno" sozinho não
      // convida a filial a fazer nada. Ela precisa saber que dá para
      // pedir, e que é agora.
      titulo = nomeProduto!;
      corpo =
        vezesHoje && vezesHoje > 1
          ? `${vezesHoje}ª fornada de hoje — disponível para pedidos. Toque para pedir.`
          : "Acabou de sair do forno e está disponível para pedidos. Toque para pedir.";
      etiqueta = `fornada-${codigoPdv}`;
    } else {
      // O nome da loja vai no TÍTULO: é a primeira coisa que a matriz
      // precisa saber para decidir o que separar e para onde mandar.
      titulo = `${quemChamou.nome} pediu reposição`;
      corpo = quantidade
        ? `${nomeProduto} · ${quantidade} un`
        : `${nomeProduto}`;
      // Uma etiqueta por loja E produto: pedido repetido do mesmo item
      // substitui o anterior, mas produtos diferentes continuam somando.
      etiqueta = `reposicao-${quemChamou.id}-${codigoPdv}`;
    }

    /**
     * Payload só de `data`, sem o bloco `notification`: assim o service
     * worker monta a notificação e consegue aplicar a `tag`, que faz o
     * aviso do MESMO produto substituir o anterior. Pão francês sai seis
     * vezes por dia — sem isso seriam seis avisos empilhados do mesmo
     * item, e a filial aprenderia a ignorar todos.
     */
    const resultado = await modulos.messaging.getMessaging(app).sendEachForMulticast({
      tokens,
      /**
       * `url` leva ao destino DENTRO do app (ago/2026). Tocar no aviso
       * abria o app na última aba usada, e quem recebeu "PÃO FRANCÊS
       * disponível" caía no Cronograma sem entender o que fazer. O
       * service worker lê este campo e manda o app abrir a aba certa —
       * ver public/firebase-messaging-sw.js e o efeito de rota em
       * src/App.tsx. É um caminho relativo de propósito: `fcmOptions.link`
       * exigiria URL absoluta e não é usado aqui (ver abaixo).
       */
      data: { titulo, corpo, tag: etiqueta, url: destinoNoApp },
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
      await modulos.firestore.getFirestore(app).collection("dispositivos").doc(token).delete();
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
