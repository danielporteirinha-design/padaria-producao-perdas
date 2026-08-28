/**
 * api/entrar-como-loja.ts
 * ---------------------------------------------------------------
 * Entrada sem senha, PROVISÓRIA (ago/2026 — pedido explícito do dono do
 * negócio: "quero que retire o acesso via senha, provisoriamente").
 *
 * O QUE ISTO FAZ, E O QUE ISTO CUSTA
 * -----------------------------------
 * O aparelho diz qual loja é, e recebe de volta um TOKEN PERSONALIZADO
 * do Firebase para a conta daquela loja. O app entra com ele e segue
 * sendo, para todos os efeitos, aquela loja autenticada: as regras do
 * Firestore continuam valendo, cada loja continua com as permissões
 * dela, e nada no resto do sistema precisa saber que a senha não foi
 * digitada.
 *
 * O CUSTO É REAL E PRECISA ESTAR ESCRITO: enquanto isto estiver ligado,
 * QUALQUER PESSOA COM O ENDEREÇO DO APP entra como qualquer uma das três
 * lojas. Não há barreira — é exatamente o que "sem senha" significa. A
 * proteção que sobra é o endereço não ser público e o dado não ser
 * sensível (produção e perdas, não cadastro de cliente nem dinheiro).
 *
 * COMO LIGAR E COMO DESLIGAR — sem publicar nada de novo
 * ------------------------------------------------------
 * Uma variável de ambiente na Vercel, `UIDS_LOJAS`, com o identificador
 * de cada conta (Firebase → Authentication → Users → coluna "User UID"):
 *
 *   {"MATRIZ":"...","FILIAL_ARTHUR_BERNARDES":"...","FILIAL_BENJAMIN_CONSTANT":"..."}
 *
 * COM a variável, o app entra com um toque. SEM ela, este endpoint
 * responde 403 e a tela de login volta a pedir a senha sozinha — a volta
 * atrás é apagar a variável, não publicar versão nova.
 *
 * O UID NÃO É SEGREDO. Ele identifica a conta, não autoriza nada: quem
 * assina o token é a chave de serviço, que continua só na Vercel.
 *
 * POR QUE ASSINAR O TOKEN À MÃO, COM `node:crypto`
 * ------------------------------------------------
 * O caminho normal seria `getAuth().createCustomToken()`, do
 * firebase-admin. Ele NÃO carrega neste runtime: `firebase-admin/auth`
 * puxa `jwks-rsa`, que faz `require('jose')`, e o `jose` virou pacote
 * só-ESM — a função morre com ERR_REQUIRE_ESM antes de executar (o mesmo
 * defeito já documentado em api/notificar-fornada.ts). Um token
 * personalizado é um JWT RS256 assinado pela conta de serviço, e isso o
 * `node:crypto` faz sem dependência nenhuma.
 */

import { createSign } from "node:crypto";

/**
 * As três lojas, repetidas aqui de propósito.
 *
 * As funções de /api são autocontidas: elas são empacotadas uma a uma
 * pelo Vercel, e importar de `src/` já custou uma função morta em
 * produção (ver a nota sobre ERR_REQUIRE_ESM em notificar-fornada.ts).
 * A duplicação não fica solta: `scripts/verificar_logica.ts` compara
 * esta lista com a de `src/lib/lojas.ts` e reprova se as duas divergirem.
 */
export const CONTAS_DAS_LOJAS = [
  { id: "MATRIZ", email: "matriz@paodemel.local" },
  { id: "FILIAL_ARTHUR_BERNARDES", email: "arthur@paodemel.local" },
  { id: "FILIAL_BENJAMIN_CONSTANT", email: "benjamin@paodemel.local" },
] as const;

export const IDS_DAS_LOJAS = CONTAS_DAS_LOJAS.map((c) => c.id);

/** Público-alvo fixo de um token personalizado do Firebase. */
const AUDIENCIA =
  "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

/** Uma hora é o teto que o Firebase aceita para este tipo de token. */
const VALIDADE_SEGUNDOS = 3600;

function base64url(dado: string | Buffer): string {
  return Buffer.from(dado)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Monta e assina o JWT que o Firebase aceita como token personalizado.
 *
 * Exportada para o teste: `scripts/verificar_logica.ts` assina com uma
 * chave descartável e confere o formato e a assinatura, sem rede e sem
 * tocar no projeto de verdade.
 */
export function assinarTokenPersonalizado(
  uid: string,
  contaDeServico: { client_email: string; private_key: string },
  agoraEmSegundos = Math.floor(Date.now() / 1000)
): string {
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: contaDeServico.client_email,
      sub: contaDeServico.client_email,
      aud: AUDIENCIA,
      iat: agoraEmSegundos,
      exp: agoraEmSegundos + VALIDADE_SEGUNDOS,
      uid,
    })
  );

  const assinatura = createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(contaDeServico.private_key);

  return `${cabecalho}.${corpo}.${base64url(assinatura)}`;
}

/**
 * O UID DE UMA CONTA, DESCOBERTO PELO PRÓPRIO SERVIDOR (ago/2026).
 *
 * POR QUE ISTO PASSOU A EXISTIR
 * ------------------------------
 * A primeira versão exigia uma variável `UIDS_LOJAS` preenchida à mão com
 * os três identificadores copiados do console do Firebase. Em produção
 * isso não funcionou, e o modo de falhar é o pior possível: a tela cai no
 * campo de senha sem dizer por quê, e as causas (variável ausente, salva
 * com o texto de exemplo, UID errado, UID de outro projeto) se parecem
 * exatamente igual para quem está olhando.
 *
 * Configuração manual que pode ser digitada errado, num caminho que não
 * avisa quando está errado, é defeito de desenho — não de quem digitou.
 * Aqui o servidor pergunta ao Google qual é o UID do e-mail da loja, com
 * a credencial que ELE já tem. Não há nada para preencher.
 *
 * COMO: a conta de serviço assina uma credencial, troca por um
 * `access_token` e consulta o Identity Toolkit. É o mesmo que o
 * firebase-admin faria — feito à mão porque `firebase-admin/auth` não
 * carrega neste runtime (ERR_REQUIRE_ESM, ver notificar-fornada.ts).
 *
 * O resultado fica em memória: a função fica quente entre chamadas, e o
 * UID de uma conta não muda.
 */
const uidsDescobertos = new Map<string, string>();

interface ContaDeServico {
  client_email: string;
  private_key: string;
  project_id: string;
}

/** Assina a credencial que o Google troca por um token de acesso. */
function assinarCredencialOAuth(conta: ContaDeServico): string {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: conta.client_email,
      scope: "https://www.googleapis.com/auth/identitytoolkit",
      aud: "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    })
  );
  const assinatura = createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(conta.private_key);
  return `${cabecalho}.${corpo}.${base64url(assinatura)}`;
}

async function tokenDeAcesso(conta: ContaDeServico): Promise<string> {
  const resposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assinarCredencialOAuth(conta),
    }).toString(),
  });
  if (!resposta.ok) {
    throw new Error(`OAuth recusou (${resposta.status}): ${await resposta.text()}`);
  }
  const dados = (await resposta.json()) as { access_token?: string };
  if (!dados.access_token) throw new Error("OAuth não devolveu access_token.");
  return dados.access_token;
}

async function descobrirUid(email: string, conta: ContaDeServico): Promise<string> {
  const guardado = uidsDescobertos.get(email);
  if (guardado) return guardado;

  const acesso = await tokenDeAcesso(conta);
  const resposta = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${conta.project_id}/accounts:lookup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${acesso}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: [email] }),
    }
  );
  if (!resposta.ok) {
    throw new Error(`Consulta de conta recusada (${resposta.status}): ${await resposta.text()}`);
  }
  const dados = (await resposta.json()) as { users?: { localId?: string }[] };
  const uid = dados.users?.[0]?.localId;
  if (!uid) throw new Error(`A conta ${email} não existe neste projeto do Firebase.`);

  uidsDescobertos.set(email, uid);
  return uid;
}

/** Lê a conta de serviço da variável de ambiente, ou `null`. */
export function lerContaDeServico(bruto: string | undefined): ContaDeServico | null {
  if (!bruto?.trim()) return null;
  try {
    const lido = JSON.parse(bruto) as Partial<ContaDeServico>;
    if (!lido.client_email || !lido.private_key || !lido.project_id) return null;
    return {
      client_email: lido.client_email,
      project_id: lido.project_id,
      // A chave costuma vir da variável de ambiente com "\n" literal.
      private_key: lido.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

/**
 * Lê o mapa de UIDs da variável de ambiente.
 *
 * Devolve `null` — e não erro — quando a variável não existe: ausência é
 * o estado DESLIGADO do recurso, não uma falha de configuração.
 */
export function lerUidsConfigurados(bruto: string | undefined): Record<string, string> | null {
  if (!bruto?.trim()) return null;
  try {
    const lido = JSON.parse(bruto) as Record<string, unknown>;
    const mapa: Record<string, string> = {};
    for (const id of IDS_DAS_LOJAS) {
      const uid = lido[id];
      if (typeof uid === "string" && uid.trim().length > 0) mapa[id] = uid.trim();
    }
    return Object.keys(mapa).length > 0 ? mapa : null;
  } catch {
    return null;
  }
}

/**
 * DIAGNÓSTICO — abra no navegador: /api/entrar-como-loja
 *
 * Existe porque "ainda pede a senha" tem quatro causas que se parecem na
 * tela: a variável não foi criada, foi criada com o texto de exemplo, o
 * UID de uma loja está errado, ou falta a chave de serviço. Sem isto, a
 * única saída é adivinhar — e adivinhar já custou tempo demais neste
 * projeto.
 *
 * NÃO DEVOLVE SEGREDO. O UID identifica a conta e não autoriza nada; a
 * chave de serviço aparece só como sim/não. Ainda assim, os UIDs vêm
 * cortados: o suficiente para conferir, nunca o valor inteiro.
 */
async function diagnostico(res: any) {
  const conta = lerContaDeServico(process.env.FIREBASE_SERVICE_ACCOUNT);
  const manuais = lerUidsConfigurados(process.env.UIDS_LOJAS);

  if (!conta) {
    res.status(200).json({
      entradaSemSenha: "DESLIGADA",
      causa: "FIREBASE_SERVICE_ACCOUNT ausente ou com JSON inválido na Vercel.",
      oQueFazer:
        "Cole o JSON da conta de serviço (Firebase > Configurações > Contas de serviço > " +
        "Gerar nova chave privada) na variável FIREBASE_SERVICE_ACCOUNT e faça um deploy novo.",
    });
    return;
  }

  const lojas: Record<string, string> = {};
  for (const c of CONTAS_DAS_LOJAS) {
    const manual = manuais?.[c.id];
    if (manual) {
      lojas[c.id] = `UID configurado à mão (${manual.slice(0, 6)}...)`;
      continue;
    }
    try {
      const uid = await descobrirUid(c.email, conta);
      lojas[c.id] = `OK — ${c.email} encontrado (${uid.slice(0, 6)}...)`;
    } catch (e) {
      lojas[c.id] = `FALHOU — ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`;
    }
  }

  const tudoOk = Object.values(lojas).every((v) => !v.startsWith("FALHOU"));
  res.status(200).json({
    entradaSemSenha: tudoOk ? "LIGADA" : "COM PROBLEMA",
    projeto: conta.project_id,
    contaDeServico: conta.client_email,
    lojas,
    observacao:
      "A variável UIDS_LOJAS não é mais necessária: o servidor descobre o UID de cada " +
      "conta sozinho. Ela continua valendo como saída manual, se estiver preenchida.",
  });
}

// Tipagem mínima e deliberadamente solta, igual às outras funções de /api.
export default async function handler(req: any, res: any) {
  // GET é o diagnóstico; POST é a entrada de verdade.
  if (req.method === "GET") {
    await diagnostico(res);
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  const conta = lerContaDeServico(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!conta) {
    res.status(403).json({
      erro: "Servidor sem credencial para assinar a entrada.",
      motivo: "sem-credencial",
    });
    return;
  }

  const corpo: { loja?: string } =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const lojaId = (corpo.loja ?? "").trim();

  // A loja tem de ser uma das TRÊS conhecidas: o corpo da requisição
  // escolhe entre opções fixas, nunca informa um identificador livre.
  const loja = CONTAS_DAS_LOJAS.find((c) => c.id === lojaId);
  if (!loja) {
    res.status(403).json({ erro: "Loja desconhecida.", motivo: "loja-desconhecida" });
    return;
  }

  try {
    /**
     * O UID configurado à mão ainda vale, e vem primeiro: quem já
     * preencheu `UIDS_LOJAS` não perde a configuração, e ela serve de
     * saída manual caso a consulta ao Google fique indisponível. Sem ela,
     * o servidor descobre sozinho — que é o caminho normal.
     */
    const configurado = lerUidsConfigurados(process.env.UIDS_LOJAS)?.[loja.id];
    const uid = configurado ?? (await descobrirUid(loja.email, conta));
    res.status(200).json({ token: assinarTokenPersonalizado(uid, conta) });
  } catch (e) {
    // A mensagem vai para o log da Vercel INTEIRA, e para a tela em
    // resumo: quem está configurando precisa da causa, e quem está no
    // balcão só precisa cair no campo de senha.
    console.error("Falha na entrada sem senha:", e);
    res.status(403).json({
      erro: "Não foi possível preparar a entrada sem senha.",
      motivo: "falha-ao-assinar",
      detalhe: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
    });
  }
}
