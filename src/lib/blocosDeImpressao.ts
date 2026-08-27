/**
 * src/lib/blocosDeImpressao.ts
 * ---------------------------------------------------------------
 * Agrupa itens por categoria de produção para virar fita impressa
 * (ago/2026).
 *
 * POR QUE POR CATEGORIA, E NESTA ORDEM
 * -------------------------------------
 * Quem separa a mercadoria de manhã anda pela padaria por SETOR — pães,
 * biscoitos, bolos, salgados, confeitaria —, não por ordem alfabética de
 * produto. Uma lista misturada obriga a pessoa a percorrer o mesmo
 * caminho cinco vezes.
 *
 * A ordem é a de CATEGORIAS_PRODUCAO, e não a ordem em que os itens
 * aparecem no pedido: assim dois papéis do mesmo dia — o da matriz e o de
 * cada filial — trazem os setores na mesma sequência, e conferir um
 * contra o outro deixa de exigir procurar.
 *
 * Categoria fora das cinco (plano antigo, produto recategorizado no PDV)
 * não some: cai num bloco próprio no fim, porque item que não aparece na
 * lista é item que ninguém separa.
 *
 * Módulo puro (sem I/O) — ver scripts/verificar_logica.ts.
 */

import type { ItemPlanoProducao } from "../types/producao";
import type { Produto } from "../types/produto";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria } from "./categorias";

export interface BlocoDeImpressao {
  rotuloSessao: string;
  itens: ItemPlanoProducao[];
}

/** Categoria de um produto, ou "OUTROS" quando ele não está no catálogo. */
function categoriaDoItem(codigoPdv: number, produtos: Produto[]): string {
  return produtos.find((p) => p.codigoPdv === codigoPdv)?.categoria ?? "OUTROS";
}

export function agruparPorCategoria(
  itens: ItemPlanoProducao[],
  produtos: Produto[]
): BlocoDeImpressao[] {
  const porCategoria = new Map<string, ItemPlanoProducao[]>();
  for (const item of itens) {
    const categoria = categoriaDoItem(item.codigoPdv, produtos);
    porCategoria.set(categoria, [...(porCategoria.get(categoria) ?? []), item]);
  }

  const conhecidas = CATEGORIAS_PRODUCAO.map((c) => c.chave);
  const desconhecidas = [...porCategoria.keys()].filter((c) => !conhecidas.includes(c));

  return [...conhecidas, ...desconhecidas]
    .filter((categoria) => (porCategoria.get(categoria)?.length ?? 0) > 0)
    .map((categoria) => ({
      rotuloSessao: rotuloDaCategoria(categoria),
      itens: porCategoria.get(categoria) ?? [],
    }));
}
