/**
 * src/lib/rascunhoPedido.ts
 * ---------------------------------------------------------------
 * A lista que a filial está montando na aba Programação, guardada no
 * aparelho (ago/2026).
 *
 * O DEFEITO QUE ISTO CORRIGE
 * ---------------------------
 * Relato do dono do negócio, palavra por palavra: "ao excluir os itens da
 * programação, tudo certo, porém os itens voltam a ser exibidos quando eu
 * saio e volto para a aba".
 *
 * A lista vivia só na memória do componente. Trocar de aba desmonta a
 * tela, e ao voltar ela era reconstruída a partir do PEDIDO GRAVADO — o
 * que faz o item removido reaparecer e, pior, faz qualquer quantidade
 * corrigida desde o último envio sumir sem aviso. É o mesmo defeito que o
 * Cronograma da matriz teve, e a correção é a mesma (ver
 * src/lib/rascunhoCronograma.ts); as partes comuns moram em
 * src/lib/rascunhoLocal.ts.
 *
 * A CHAVE LEVA LOJA E DATA. A data porque o rascunho de sexta não pode
 * contaminar o de sábado. A loja porque o mesmo aparelho troca de conta —
 * é assim que a padaria testa, e foi assim que um `lojaId` velho já
 * causou defeito antes: sem a loja na chave, o rascunho de uma filial
 * apareceria na tela da outra.
 *
 * POR QUE NO APARELHO, E NÃO NA NUVEM
 * ------------------------------------
 * Gravar cada tecla no Firestore sobrescreveria um pedido que já pode ter
 * sido ENVIADO — a matriz produziria com base numa lista que a filial
 * ainda estava mexendo. Enviar continua sendo o único momento em que o
 * pedido muda de verdade.
 */

import type { ItemPlanoProducao } from "../types/producao";
import { apagarChave, chavesVencidas, gravarObjeto, lerObjeto, limparVencidos } from "./rascunhoLocal";

const PREFIXO = "padaria:rascunho-pedido:";

/** `padaria:rascunho-pedido:<data>:<loja>` — data primeiro, para expirar. */
export function chaveDoRascunhoPedido(lojaId: string, data: string): string {
  return `${PREFIXO}${data}:${lojaId}`;
}

/** Quais chaves de rascunho de pedido já passaram do prazo. */
export function rascunhosDePedidoVencidos(chaves: string[], hoje: string): string[] {
  return chavesVencidas(chaves, hoje, PREFIXO);
}

export function lerRascunhoPedido(lojaId: string, data: string): ItemPlanoProducao[] | null {
  const itens = lerObjeto<ItemPlanoProducao[]>(chaveDoRascunhoPedido(lojaId, data));
  return Array.isArray(itens) ? itens : null;
}

export function gravarRascunhoPedido(lojaId: string, data: string, itens: ItemPlanoProducao[]): void {
  gravarObjeto(chaveDoRascunhoPedido(lojaId, data), itens);
}

export function apagarRascunhoPedido(lojaId: string, data: string): void {
  apagarChave(chaveDoRascunhoPedido(lojaId, data));
}

/** Varre o aparelho e remove os rascunhos de pedido vencidos. */
export function limparRascunhosDePedidoAntigos(hoje: string): void {
  limparVencidos(hoje, PREFIXO);
}
