/**
 * src/lib/avisarFiliais.ts
 * ---------------------------------------------------------------
 * Cliente do endpoint que dispara o aviso de fornada pronta.
 *
 * O envio em si acontece no servidor (api/notificar-fornada.ts) porque
 * exige a chave de serviço do Firebase — que ignora as regras do banco e
 * jamais pode ir para o bundle do app.
 *
 * Manda junto o token de identidade do Firebase para o servidor conferir
 * que quem está pedindo é mesmo a matriz. Sem isso, um endereço público
 * conseguiria disparar notificação para os celulares da padaria inteira.
 */

import { auth } from "./firebase";

export class ErroAviso extends Error {}

export async function avisarFiliais(
  nomeProduto: string,
  codigoPdv: number,
  vezesHoje: number
): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario) throw new ErroAviso("Sessão não encontrada para avisar as filiais.");

  const token = await usuario.getIdToken();
  const resposta = await fetch("/api/notificar-fornada", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ nomeProduto, codigoPdv, vezesHoje }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new ErroAviso(corpo.erro ?? `Falha ao avisar as filiais (HTTP ${resposta.status}).`);
  }
}
