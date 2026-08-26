/**
 * Modelo de dados — Pedido de Filial
 *
 * Modelo operacional confirmado com o dono do negócio (ago/2026): as
 * filiais NÃO produzem, elas PEDEM. Cada filial informa, no fim do
 * expediente, a quantidade de que vai precisar no dia seguinte; a matriz
 * soma tudo, produz o total e separa por loja de manhã.
 *
 * Um pedido por filial por dia. O id é derivado da data e da loja
 * (`2026-08-27_FILIAL_ARTHUR_BERNARDES`) em vez de aleatório: assim
 * gravar duas vezes atualiza o mesmo documento, e um envio duplicado por
 * toque repetido ou por reconexão offline não vira dois pedidos somados.
 */

import type { ItemPlanoProducao } from "./producao";

export type StatusPedido = "rascunho" | "enviado";

/**
 * Dois pedidos com urgências diferentes (ago/2026):
 *
 * - `diario`     — o de sempre, um por filial por dia, para o dia seguinte
 * - `reposicao`  — extra, para HOJE, disparado quando a filial vê que um
 *                  item saiu do forno e ela está sem ele no balcão
 *
 * São separados de propósito. Misturar reposição no pedido de amanhã
 * esconderia a urgência: a matriz precisa ver na hora que uma loja está
 * pedindo agora, e não descobrir junto com o planejamento do dia seguinte.
 */
export type TipoPedido = "diario" | "reposicao";

export interface PedidoFilial {
  id: string;
  lojaId: string;
  /** Dia para o qual o pedido vale — normalmente amanhã (ISO YYYY-MM-DD). */
  data: string;
  itens: ItemPlanoProducao[];
  status: StatusPedido;
  /** Ausente em pedidos anteriores a ago/2026 — todos eram diários. */
  tipo?: TipoPedido;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  enviadoEm?: string;
}

export function idDoPedido(data: string, lojaId: string): string {
  return `${data}_${lojaId}`;
}

/**
 * Reposição pode acontecer mais de uma vez no mesmo dia (a filial pode
 * ficar sem pão às 9h e sem biscoito às 15h), então o id leva o instante
 * do envio — diferente do pedido diário, que é único por dia e sobrescreve.
 */
export function idDaReposicao(data: string, lojaId: string, enviadoEm: string): string {
  return `${data}_${lojaId}_rep_${enviadoEm.replace(/[^0-9]/g, "")}`;
}

export function ehReposicao(pedido: PedidoFilial): boolean {
  return pedido.tipo === "reposicao";
}

/** Pedido que entra no planejamento do dia — reposição não entra. */
export function ehPedidoDiario(pedido: PedidoFilial): boolean {
  return pedido.tipo !== "reposicao";
}

export function pedidoFoiEnviado(pedido: PedidoFilial | undefined): boolean {
  return pedido?.status === "enviado";
}

/** Total de unidades pedidas — usado no resumo e no indicador da matriz. */
export function totalDoPedido(pedido: PedidoFilial | undefined): number {
  return (pedido?.itens ?? []).reduce((soma, i) => soma + i.quantidadeUnidades, 0);
}
