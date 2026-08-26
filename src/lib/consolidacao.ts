/**
 * src/lib/consolidacao.ts
 * ---------------------------------------------------------------
 * Junta a produção da própria matriz com os pedidos das filiais para
 * responder às duas perguntas que a operação faz todo dia, e que são
 * perguntas DIFERENTES (ago/2026):
 *
 *   1. "Quanto produzir de cada item?"  -> o padeiro precisa do TOTAL
 *   2. "Quanto vai para cada loja?"     -> quem separa de manhã precisa
 *                                          da divisão por destino
 *
 * É por isso que saem dois documentos distintos da mesma confirmação: a
 * fita de produção com os totais e um romaneio de separação por filial.
 * Um documento só, com o total, deixaria a separação adivinhando; um
 * documento só, por loja, faria o padeiro somar de cabeça.
 *
 * Módulo puro (sem I/O), testável isoladamente — ver scripts/verificar_logica.ts.
 */

import type { ItemPlanoProducao } from "../types/producao";
import type { PedidoFilial } from "../types/pedido";
import { ehPedidoDiario } from "../types/pedido";

export interface DestinoDoItem {
  lojaId: string;
  quantidadeUnidades: number;
}

export interface ItemConsolidado {
  codigoPdv: number;
  /** Soma de todos os destinos — é o que o padeiro produz. */
  totalUnidades: number;
  /** Quanto cabe a cada loja, matriz inclusa. Só destinos com quantidade. */
  destinos: DestinoDoItem[];
}

/**
 * Consolida a produção própria da matriz com os pedidos JÁ ENVIADOS das
 * filiais para uma data.
 *
 * Dois tipos de pedido são ignorados de propósito:
 *
 * - **rascunho** — a filial ainda está mexendo nele, e produzir com base
 *   num número que ela não confirmou é pior que produzir sem ele.
 * - **reposição** — é pedido de HOJE, feito depois que o item já saiu do
 *   forno. Somá-la ao planejamento faria produzir de novo amanhã algo que
 *   já foi entregue. O indicador "enviado/aguardando" na tela da
 * matriz existe justamente para isso ficar visível antes de confirmar.
 */
export function consolidarProducao(
  itensDaMatriz: ItemPlanoProducao[],
  pedidos: PedidoFilial[],
  lojaMatrizId: string
): ItemConsolidado[] {
  const porProduto = new Map<number, Map<string, number>>();

  function somar(codigoPdv: number, lojaId: string, quantidade: number) {
    if (quantidade <= 0) return;
    const destinos = porProduto.get(codigoPdv) ?? new Map<string, number>();
    destinos.set(lojaId, (destinos.get(lojaId) ?? 0) + quantidade);
    porProduto.set(codigoPdv, destinos);
  }

  for (const item of itensDaMatriz) {
    somar(item.codigoPdv, lojaMatrizId, item.quantidadeUnidades);
  }
  for (const pedido of pedidos) {
    if (pedido.status !== "enviado") continue;
    // Reposição é pedido de HOJE, feito depois que o item já saiu do
    // forno — somá-la ao planejamento faria a matriz produzir de novo
    // amanhã algo que já foi entregue. São listas com urgências
    // diferentes de propósito (ver src/types/pedido.ts).
    if (!ehPedidoDiario(pedido)) continue;
    for (const item of pedido.itens) {
      somar(item.codigoPdv, pedido.lojaId, item.quantidadeUnidades);
    }
  }

  const consolidado: ItemConsolidado[] = [];
  for (const [codigoPdv, destinos] of porProduto) {
    const lista = [...destinos.entries()].map(([lojaId, quantidadeUnidades]) => ({
      lojaId,
      quantidadeUnidades,
    }));
    consolidado.push({
      codigoPdv,
      totalUnidades: lista.reduce((soma, d) => soma + d.quantidadeUnidades, 0),
      destinos: lista,
    });
  }
  return consolidado.sort((a, b) => a.codigoPdv - b.codigoPdv);
}

/** Quanto uma loja específica leva de um produto, dentro do consolidado. */
export function quantidadeDaLoja(item: ItemConsolidado, lojaId: string): number {
  return item.destinos.find((d) => d.lojaId === lojaId)?.quantidadeUnidades ?? 0;
}

/** Itens que vão para uma loja — a base do romaneio de separação dela. */
export function itensParaLoja(
  consolidado: ItemConsolidado[],
  lojaId: string
): ItemPlanoProducao[] {
  return consolidado
    .map((item) => ({ codigoPdv: item.codigoPdv, quantidadeUnidades: quantidadeDaLoja(item, lojaId) }))
    .filter((i) => i.quantidadeUnidades > 0);
}
