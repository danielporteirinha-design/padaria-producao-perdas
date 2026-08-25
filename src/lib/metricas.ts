/**
 * src/lib/metricas.ts
 * ---------------------------------------------------------------
 * Cálculos de análise: taxa de perda, volume de produção por dia da
 * semana e identificação de picos de perda (geral e por categoria).
 *
 * Todas as funções operam sobre dados JÁ NORMALIZADOS EM QUILOS
 * (quantidadeNormalizada em RegistroPerda, quantidadeQuilos em
 * ItemPlanoProducao) — produzido e perdido sempre na mesma unidade,
 * então perdido/produzido nunca mistura quilos com contagem de unidades.
 */

import type { DiaDaSemana, PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import type { Produto } from "../types/produto";

export interface TaxaPerdaProduto {
  codigoPdv: number;
  nomeProduto: string;
  totalProduzido: number; // quilos
  totalPerdido: number; // quilos
  perdaAbsoluta: number; // quilos
  perdaPercentual: number; // 0-100, arredondado a 2 casas
}

/**
 * Taxa de perda por produto num intervalo. Recebe os planos e os registros
 * de perda já filtrados pelo período desejado (o filtro de datas fica na
 * camada de consulta/API, não aqui — mantém esta função pura e testável).
 */
export function calcularTaxaPerdaPorProduto(
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[]
): TaxaPerdaProduto[] {
  const produzidoPorProduto = new Map<number, number>();
  for (const plano of planos) {
    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        produzidoPorProduto.set(
          item.codigoPdv,
          (produzidoPorProduto.get(item.codigoPdv) ?? 0) + item.quantidadeQuilos
        );
      }
    }
  }

  const perdidoPorProduto = new Map<number, number>();
  for (const perda of perdas) {
    perdidoPorProduto.set(
      perda.codigoPdv,
      (perdidoPorProduto.get(perda.codigoPdv) ?? 0) + perda.quantidadeNormalizada
    );
  }

  const produtoPorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p]));

  const resultado: TaxaPerdaProduto[] = [];
  for (const [codigoPdv, totalProduzido] of produzidoPorProduto) {
    const produto = produtoPorCodigo.get(codigoPdv);
    if (!produto) continue; // produto removido do catálogo — ignora silenciosamente na análise histórica

    const totalPerdido = perdidoPorProduto.get(codigoPdv) ?? 0;
    const perdaPercentual = totalProduzido > 0 ? (totalPerdido / totalProduzido) * 100 : 0;

    resultado.push({
      codigoPdv,
      nomeProduto: produto.nome,
      totalProduzido,
      totalPerdido,
      perdaAbsoluta: arredondar(totalPerdido, 2),
      perdaPercentual: arredondar(perdaPercentual, 2),
    });
  }

  return resultado.sort((a, b) => b.perdaPercentual - a.perdaPercentual);
}

export interface VolumeProducaoPorDia {
  diaDaSemana: DiaDaSemana;
  totalPlanejado: number; // quilos
  numeroDePlanos: number;
}

/** Volume de produção consolidado por dia da semana, em quilos. */
export function calcularVolumeProducaoPorDiaDaSemana(
  planos: PlanoDeProducaoDiario[]
): VolumeProducaoPorDia[] {
  const acumulado = new Map<DiaDaSemana, { total: number; qtdPlanos: number }>();

  for (const plano of planos) {
    const atual = acumulado.get(plano.diaDaSemana) ?? { total: 0, qtdPlanos: 0 };
    const totalDoPlano = plano.sessoes
      .flatMap((s) => s.itens)
      .reduce((soma, item) => soma + item.quantidadeQuilos, 0);
    acumulado.set(plano.diaDaSemana, {
      total: atual.total + totalDoPlano,
      qtdPlanos: atual.qtdPlanos + 1,
    });
  }

  return Array.from(acumulado.entries()).map(([diaDaSemana, v]) => ({
    diaDaSemana,
    totalPlanejado: arredondar(v.total, 2),
    numeroDePlanos: v.qtdPlanos,
  }));
}

export interface PicoPerdaPorDia {
  diaDaSemana: DiaDaSemana;
  perdaPercentualMedia: number;
  categoria?: string; // presente quando o pico é calculado por categoria
}

/**
 * Identifica os dias da semana com maior percentual médio de perda.
 * Se `porCategoria` = true, agrupa também por produto.categoria.
 */
export function identificarPicosDePerda(
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[],
  porCategoria: boolean = false
): PicoPerdaPorDia[] {
  const produtoPorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p]));

  type Chave = string; // `${dia}` ou `${dia}::${categoria}`
  const produzido = new Map<Chave, number>();
  const perdido = new Map<Chave, number>();

  const chaveDe = (dia: DiaDaSemana, categoria?: string) =>
    porCategoria ? `${dia}::${categoria ?? "SEM_CATEGORIA"}` : dia;

  for (const plano of planos) {
    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        const produto = produtoPorCodigo.get(item.codigoPdv);
        const chave = chaveDe(plano.diaDaSemana, produto?.categoria);
        produzido.set(chave, (produzido.get(chave) ?? 0) + item.quantidadeQuilos);
      }
    }
  }

  for (const perda of perdas) {
    const produto = produtoPorCodigo.get(perda.codigoPdv);
    const chave = chaveDe(perda.diaDaSemana, produto?.categoria);
    perdido.set(chave, (perdido.get(chave) ?? 0) + perda.quantidadeNormalizada);
  }

  const resultado: PicoPerdaPorDia[] = [];
  for (const [chave, totalProduzido] of produzido) {
    const totalPerdido = perdido.get(chave) ?? 0;
    const perdaPercentualMedia = totalProduzido > 0 ? (totalPerdido / totalProduzido) * 100 : 0;
    const [dia, categoria] = chave.split("::") as [DiaDaSemana, string | undefined];
    resultado.push({
      diaDaSemana: dia,
      categoria: porCategoria ? categoria : undefined,
      perdaPercentualMedia: arredondar(perdaPercentualMedia, 2),
    });
  }

  return resultado.sort((a, b) => b.perdaPercentualMedia - a.perdaPercentualMedia);
}

function arredondar(valor: number, casasDecimais: number): number {
  const fator = 10 ** casasDecimais;
  return Math.round(valor * fator) / fator;
}
