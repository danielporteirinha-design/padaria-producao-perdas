/**
 * src/lib/rascunhoReposicao.ts
 * ---------------------------------------------------------------
 * A lista de reposição que a filial está MONTANDO, guardada no aparelho
 * (ago/2026 — pedido do dono do negócio).
 *
 * O QUE MUDOU, E POR QUÊ
 * -----------------------
 * Antes, cada item pedido na aba Reposição virava um documento na nuvem
 * na hora: falar cinco produtos criava cinco pedidos e disparava cinco
 * avisos para a matriz. Além do ruído, a lista não existia em lugar
 * nenhum da tela — o que a pessoa acabara de pedir sumia, e a leitura
 * natural disso é "o app apagou o que eu pedi".
 *
 * Agora a fala MONTA uma lista. A lista fica na tela, aceita mais itens
 * (por voz ou pela busca), só some quando a pessoa clica em "Limpar
 * pedido", e só vira pedido de verdade quando ela clica em "Enviar
 * pedido" — um documento, um aviso.
 *
 * FICA NO APARELHO, não na nuvem: enquanto está sendo montada, a lista
 * não é decisão de ninguém. Gravar cada item no Firestore faria a matriz
 * ver um pedido pela metade, e é justamente isso que "enviar" existe
 * para evitar. A chave leva DATA e LOJA pelos mesmos motivos do rascunho
 * do pedido diário — ver src/lib/rascunhoPedido.ts.
 */

import type { ItemPlanoProducao } from "../types/producao";
import { apagarChave, chavesVencidas, gravarObjeto, lerObjeto, limparVencidos } from "./rascunhoLocal";

const PREFIXO = "padaria:rascunho-reposicao:";

/** `padaria:rascunho-reposicao:<data>:<loja>` — data primeiro, para expirar. */
export function chaveDoRascunhoReposicao(lojaId: string, data: string): string {
  return `${PREFIXO}${data}:${lojaId}`;
}

export function rascunhosDeReposicaoVencidos(chaves: string[], hoje: string): string[] {
  return chavesVencidas(chaves, hoje, PREFIXO);
}

export function lerRascunhoReposicao(lojaId: string, data: string): ItemPlanoProducao[] | null {
  const itens = lerObjeto<ItemPlanoProducao[]>(chaveDoRascunhoReposicao(lojaId, data));
  return Array.isArray(itens) ? itens : null;
}

export function gravarRascunhoReposicao(
  lojaId: string,
  data: string,
  itens: ItemPlanoProducao[]
): void {
  gravarObjeto(chaveDoRascunhoReposicao(lojaId, data), itens);
}

export function apagarRascunhoReposicao(lojaId: string, data: string): void {
  apagarChave(chaveDoRascunhoReposicao(lojaId, data));
}

/** Rascunho de reposição de dia que já passou não serve para nada. */
export function limparRascunhosDeReposicaoAntigos(hoje: string): void {
  limparVencidos(hoje, PREFIXO);
}
