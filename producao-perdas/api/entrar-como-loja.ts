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
export const IDS_DAS_LOJAS = [
  "MATRIZ",
  "FILIAL_ARTHUR_BERNARDES",
  "FILIAL_BENJAMIN_CONSTANT",
] as const;

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

// Tipagem mínima e deliberadamente solta, igual às outras funções de /api.
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido — use POST." });
    return;
  }

  const uids = lerUidsConfigurados(process.env.UIDS_LOJAS);
  if (!uids) {
    // DESLIGADO: a tela de login entende este 403 e pede a senha.
    res.status(403).json({ erro: "Entrada sem senha não está ativa." });
    return;
  }

  const corpo: { loja?: string } =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const lojaId = (corpo.loja ?? "").trim();

  // A loja tem de ser uma das TRÊS conhecidas: o corpo da requisição
  // escolhe entre opções fixas, nunca informa um identificador livre.
  const loja = IDS_DAS_LOJAS.find((id) => id === lojaId);
  if (!loja || !uids[loja]) {
    res.status(403).json({ erro: "Loja não configurada para entrada sem senha." });
    return;
  }

  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) {
    res.status(403).json({ erro: "Servidor sem credencial para assinar a entrada." });
    return;
  }

  try {
    const conta = JSON.parse(bruto) as { client_email: string; private_key: string };
    const token = assinarTokenPersonalizado(uids[loja], {
      client_email: conta.client_email,
      // A chave vem da variável de ambiente com "\n" literal.
      private_key: conta.private_key.replace(/\\n/g, "\n"),
    });
    res.status(200).json({ token });
  } catch (e) {
    console.error("Falha ao assinar entrada sem senha:", e);
    res.status(403).json({ erro: "Não foi possível preparar a entrada sem senha." });
  }
}
