/**
 * src/lib/janelaValidade.ts
 * ---------------------------------------------------------------
 * Resolve um gargalo real da operação: a etiqueta do produto não traz uma
 * data de fabricação confiável o bastante para saber sozinho de qual dia
 * de produção uma perda lançada HOJE realmente veio — um pão dura só 1
 * dia, mas uma confeitaria pode ter sido produzida até 5 dias atrás e só
 * agora ser descartada.
 *
 * Este módulo calcula, para uma data de referência (normalmente hoje),
 * quais itens de quais planos de produção CONFIRMADOS ainda estão dentro
 * do próprio prazo de validade (Produto.prazoValidadeDias) — esses são os
 * candidatos válidos para lançamento de perda naquele dia. Um produto
 * pode aparecer com mais de uma origem (mais de um dia de produção ainda
 * válido); nesse caso a tela de Perdas deixa o operador escolher, com o
 * lote mais antigo pré-selecionado (FIFO — descarta-se o mais velho primeiro).
 *
 * Produto sem prazoValidadeDias cadastrado cai no comportamento anterior,
 * mais restritivo (só considera o plano do próprio dia) — nunca inventa
 * um prazo que ninguém confirmou.
 *
 * Módulo puro (sem I/O), testável isoladamente — ver scripts/verificar_logica.ts.
 */

import type { PlanoDeProducaoDiario } from "../types/producao";
import type { Produto } from "../types/produto";
import { diasEntreDatas } from "./data";

export interface OrigemCandidata {
  planoDeProducaoId: string;
  data: string; // data do plano de produção de origem (ISO)
  diasDesdeProducao: number;
}

export interface ProdutoComOrigens {
  produto: Produto;
  /** Ordenadas da mais antiga para a mais nova (FIFO — descartar a mais antiga primeiro). */
  origens: OrigemCandidata[];
}

export function calcularCandidatosPerda(
  dataReferencia: string,
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[]
): ProdutoComOrigens[] {
  const produtoPorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p]));
  const origensPorProduto = new Map<number, OrigemCandidata[]>();

  for (const plano of planos) {
    if (plano.status !== "confirmado") continue;
    const diasDesdeProducao = diasEntreDatas(plano.data, dataReferencia);
    if (diasDesdeProducao < 0) continue; // plano com data no futuro em relação à referência — ignora

    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        const produto = produtoPorCodigo.get(item.codigoPdv);
        if (!produto) continue;

        const prazo = produto.prazoValidadeDias;
        const dentroDoPrazo = prazo && prazo > 0 ? diasDesdeProducao < prazo : diasDesdeProducao === 0;
        if (!dentroDoPrazo) continue;

        const lista = origensPorProduto.get(item.codigoPdv) ?? [];
        // Evita duplicar a mesma origem se o produto aparecer em mais de uma sessão do mesmo plano.
        if (!lista.some((o) => o.planoDeProducaoId === plano.id)) {
          lista.push({ planoDeProducaoId: plano.id, data: plano.data, diasDesdeProducao });
        }
        origensPorProduto.set(item.codigoPdv, lista);
      }
    }
  }

  const resultado: ProdutoComOrigens[] = [];
  for (const [codigoPdv, origens] of origensPorProduto) {
    const produto = produtoPorCodigo.get(codigoPdv);
    if (!produto) continue;
    origens.sort((a, b) => b.diasDesdeProducao - a.diasDesdeProducao); // mais antigo primeiro
    resultado.push({ produto, origens });
  }

  return resultado.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));
}
