/**
 * src/lib/insightsCatalogo.ts
 * ---------------------------------------------------------------
 * Insights de catálogo via IA (Gemini) — pedido do dono do negócio
 * (set/2026): sinalizar produtos que estão sobrando (perda por
 * "sobra_nao_vendida" alta em relação ao produzido), produtos ativos que
 * não são produzidos há muito tempo, ou qualquer outro padrão útil no
 * histórico de produção/perdas.
 *
 * A chamada real ao modelo acontece no servidor (api/insights-catalogo.ts)
 * — este módulo só agrega o resumo (roda inteiramente no navegador, sem
 * rede) e faz a chamada HTTP ao endpoint, nunca vê a chave da API.
 *
 * Sempre INFORMATIVO, nunca automático: a IA só aponta padrões para o
 * operador avaliar — não pausa produto, não altera cadastro, não decide
 * nada sozinha.
 */

import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { itensProduzidos } from "./producaoRealizada";
import { perdaEstaValida, type RegistroPerda } from "../types/perda";
import { CATEGORIAS_PRODUCAO } from "./categorias";
import { diasEntreDatas } from "./data";

export interface ResumoProdutoParaInsights {
  codigoPdv: number;
  nome: string;
  categoria: string;
  /** Dias desde a última vez que apareceu num plano confirmado; null = nunca produzido no histórico disponível. */
  diasDesdeUltimaProducao: number | null;
  totalProduzidoUnidades: number;
  totalPerdidoUnidades: number;
  /** Subconjunto de totalPerdidoUnidades com motivo "sobra_nao_vendida" — sinal de excesso de produção. */
  perdaPorSobraUnidades: number;
  taxaPerdaPercentual: number | null;
}

export interface InsightCatalogo {
  tipo: "atencao" | "informativo";
  titulo: string;
  detalhe: string;
}

/** Erro de domínio — sempre com mensagem apresentável ao operador. */
export class ErroInsightsCatalogo extends Error {}

/**
 * Agrega, por produto ATIVO das 5 categorias de produção, o histórico dos
 * últimos `janelaDias` — payload compacto (só números e nome) enviado à IA.
 * Produtos fora de escopo/inativos ficam de fora: não fazem parte do fluxo
 * de produção, então "não produzido há X dias" não seria um insight útil.
 */
export function construirResumoParaInsights(
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[],
  dataReferencia: string,
  janelaDias = 60
): ResumoProdutoParaInsights[] {
  const categoriasValidas = new Set(CATEGORIAS_PRODUCAO.map((c) => c.chave));
  const produtosRelevantes = produtos.filter((p) => p.ativoNaProducao && categoriasValidas.has(p.categoria));
  if (produtosRelevantes.length === 0) return [];

  const codigosRelevantes = new Set(produtosRelevantes.map((p) => p.codigoPdv));

  const planosConfirmados = planos
    .filter((p) => p.status === "confirmado" && diasEntreDatas(p.data, dataReferencia) >= 0)
    .sort((a, b) => b.data.localeCompare(a.data));

  const ultimaProducaoPorCodigo = new Map<number, string>();
  const produzidoNaJanelaPorCodigo = new Map<number, number>();

  for (const plano of planosConfirmados) {
    const dias = diasEntreDatas(plano.data, dataReferencia);
    // Só o que realmente saiu do forno conta como produção — item
    // planejado e não produzido não pode virar "última produção" nem
    // engordar o total da janela (ver src/lib/producaoRealizada.ts).
    for (const item of itensProduzidos(plano)) {
      if (!codigosRelevantes.has(item.codigoPdv)) continue;
      // planosConfirmados vem ordenado do mais recente para o mais antigo,
      // então o primeiro que aparece É a última produção do produto.
      if (!ultimaProducaoPorCodigo.has(item.codigoPdv)) {
        ultimaProducaoPorCodigo.set(item.codigoPdv, plano.data);
      }
      if (dias <= janelaDias) {
        produzidoNaJanelaPorCodigo.set(
          item.codigoPdv,
          (produzidoNaJanelaPorCodigo.get(item.codigoPdv) ?? 0) + item.quantidadeUnidades
        );
      }
    }
  }

  const perdidoTotalPorCodigo = new Map<number, number>();
  const perdidoPorSobraPorCodigo = new Map<number, number>();
  for (const perda of perdas) {
    if (!perdaEstaValida(perda)) continue; // anulada pela matriz
    if (!codigosRelevantes.has(perda.codigoPdv)) continue;
    const dias = diasEntreDatas(perda.data, dataReferencia);
    if (dias < 0 || dias > janelaDias) continue;
    perdidoTotalPorCodigo.set(
      perda.codigoPdv,
      (perdidoTotalPorCodigo.get(perda.codigoPdv) ?? 0) + perda.quantidadeUnidadesEstimada
    );
    if (perda.motivo === "sobra_nao_vendida") {
      perdidoPorSobraPorCodigo.set(
        perda.codigoPdv,
        (perdidoPorSobraPorCodigo.get(perda.codigoPdv) ?? 0) + perda.quantidadeUnidadesEstimada
      );
    }
  }

  return produtosRelevantes.map((p) => {
    const ultimaData = ultimaProducaoPorCodigo.get(p.codigoPdv);
    const totalProduzidoUnidades = produzidoNaJanelaPorCodigo.get(p.codigoPdv) ?? 0;
    const totalPerdidoUnidades = arred(perdidoTotalPorCodigo.get(p.codigoPdv) ?? 0);
    return {
      codigoPdv: p.codigoPdv,
      nome: p.nome,
      categoria: p.categoria,
      diasDesdeUltimaProducao: ultimaData ? diasEntreDatas(ultimaData, dataReferencia) : null,
      totalProduzidoUnidades,
      totalPerdidoUnidades,
      perdaPorSobraUnidades: arred(perdidoPorSobraPorCodigo.get(p.codigoPdv) ?? 0),
      taxaPerdaPercentual: totalProduzidoUnidades > 0 ? arred((totalPerdidoUnidades / totalProduzidoUnidades) * 100) : null,
    };
  });
}

/**
 * Pede à IA insights sobre o resumo já agregado por construirResumoParaInsights().
 * Lança ErroInsightsCatalogo com mensagem apresentável em qualquer cenário de
 * falha — a tela de Análises nunca trava nem finge sucesso.
 */
export async function buscarInsightsCatalogo(resumo: ResumoProdutoParaInsights[]): Promise<InsightCatalogo[]> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/insights-catalogo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumo }),
    });
  } catch {
    throw new ErroInsightsCatalogo("Não foi possível conectar ao serviço de insights. Verifique sua internet.");
  }

  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new ErroInsightsCatalogo(
      (dados && typeof dados.erro === "string" && dados.erro) || `Erro ao buscar insights (HTTP ${resposta.status}).`
    );
  }
  if (!dados || !Array.isArray(dados.insights)) {
    throw new ErroInsightsCatalogo("A resposta da IA veio em formato inesperado.");
  }
  return dados.insights as InsightCatalogo[];
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
