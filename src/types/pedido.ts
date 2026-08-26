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

export interface PedidoFilial {
  id: string;
  lojaId: string;
  /** Dia para o qual o pedido vale — normalmente amanhã (ISO YYYY-MM-DD). */
  data: string;
  itens: ItemPlanoProducao[];
  status: StatusPedido;
  criadoPor: string;
  criadoEm: string; // ISO 8601 datetime
  enviadoEm?: string;
}

export function idDoPedido(data: string, lojaId: string): string {
  return `${data}_${lojaId}`;
}

export function pedidoFoiEnviado(pedido: PedidoFilial | undefined): boolean {
  return pedido?.status === "enviado";
}

/** Total de unidades pedidas — usado no resumo e no indicador da matriz. */
export function totalDoPedido(pedido: PedidoFilial | undefined): number {
  return (pedido?.itens ?? []).reduce((soma, i) => soma + i.quantidadeUnidades, 0);
}
