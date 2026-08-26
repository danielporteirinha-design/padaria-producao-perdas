/**
 * src/lib/analises.ts
 * ---------------------------------------------------------------
 * Agregações do painel de análises (ago/2026).
 *
 * A pergunta que o dono do negócio quer responder olhando a tela: "existe
 * padrão de perda por dia da semana ou por semana do mês?". Se terça
 * desperdiça o dobro de sexta, o cronograma de terça está errado — e isso
 * é dinheiro que dá para parar de jogar fora sem cortar nada.
 *
 * Tudo aqui é PURO e recebe os dados já carregados. Nenhuma função busca
 * nada: o filtro de período/loja/categoria é aplicado uma vez, no topo, e
 * as agregações trabalham sobre o recorte — assim o mesmo recorte alimenta
 * os números, os gráficos e o resumo mandado para a IA, sem chance de a
 * tela mostrar uma coisa e a IA analisar outra.
 *
 * Ver scripts/verificar_logica.ts para os casos de borda cobertos.
 */

import type { DiaDaSemana, PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { perdaEstaValida } from "../types/perda";
import type { Produto } from "../types/produto";
import { itensProduzidos } from "./producaoRealizada";
import { diasEntreDatas } from "./data";
import { LOJA_MATRIZ } from "./lojas";

export interface FiltroAnalise {
  /** Janela em dias a partir da data de referência. */
  dias: number;
  /** Vazio = todas as lojas. */
  lojaId?: string;
  /** Vazio = todas as categorias. */
  categoria?: string;
}

export interface RecorteAnalise {
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  produtos: Produto[];
  /** Códigos dentro do filtro de categoria — usado por todas as agregações. */
  codigosNoFiltro: Set<number>;
}

export const ORDEM_DIAS: DiaDaSemana[] = [
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
  "domingo",
];

export const ROTULO_DIA: Record<DiaDaSemana, string> = {
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
  domingo: "Domingo",
};

/**
 * Semana do mês pelo dia corrido (1-7, 8-14, ...), e não pela semana ISO.
 * É como a operação fala ("primeira semana do mês") e é o ciclo em que
 * caem salário, aluguel e datas comemorativas — as coisas que de fato
 * mexem no movimento da padaria.
 */
export function semanaDoMes(dataIso: string): number {
  const dia = Number(dataIso.slice(8, 10));
  return Math.min(Math.floor((dia - 1) / 7) + 1, 5);
}

/** Aplica período, loja e categoria de uma vez só. */
export function recortar(
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[],
  dataReferencia: string,
  filtro: FiltroAnalise
): RecorteAnalise {
  const codigosNoFiltro = new Set(
    produtos.filter((p) => !filtro.categoria || p.categoria === filtro.categoria).map((p) => p.codigoPdv)
  );

  const dentroDaJanela = (data: string) => {
    const dias = diasEntreDatas(data, dataReferencia);
    return dias >= 0 && dias < filtro.dias;
  };

  return {
    produtos,
    codigosNoFiltro,
    // Produção é sempre da matriz — não há plano de filial. Filtrar
    // produção por loja de filial devolveria vazio, o que faria a taxa de
    // perda perder o denominador; por isso a loja só filtra as PERDAS.
    planos: planos.filter((p) => p.status === "confirmado" && dentroDaJanela(p.data)),
    perdas: perdas.filter(
      (p) =>
        perdaEstaValida(p) &&
        dentroDaJanela(p.data) &&
        codigosNoFiltro.has(p.codigoPdv) &&
        (!filtro.lojaId || (p.lojaId ?? LOJA_MATRIZ.id) === filtro.lojaId)
    ),
  };
}

export interface Totais {
  produzido: number;
  perdido: number;
  perdidoQuilos: number;
  /** null quando não houve produção — 0% seria mentira, não ausência. */
  taxaPerda: number | null;
  diasComProducao: number;
}

export function calcularTotais(recorte: RecorteAnalise): Totais {
  let produzido = 0;
  const diasComProducao = new Set<string>();
  for (const plano of recorte.planos) {
    for (const item of itensProduzidos(plano)) {
      if (!recorte.codigosNoFiltro.has(item.codigoPdv)) continue;
      produzido += item.quantidadeUnidades;
      diasComProducao.add(plano.data);
    }
  }

  let perdido = 0;
  let perdidoQuilos = 0;
  for (const perda of recorte.perdas) {
    perdido += perda.quantidadeUnidadesEstimada;
    perdidoQuilos += perda.quantidadeQuilos;
  }

  return {
    produzido: arredondar(produzido),
    perdido: arredondar(perdido),
    perdidoQuilos: arredondar(perdidoQuilos),
    taxaPerda: produzido > 0 ? arredondar((perdido / produzido) * 100) : null,
    diasComProducao: diasComProducao.size,
  };
}

export interface BarraAnalise {
  rotulo: string;
  /** Percentual de perda — o valor plotado. */
  valor: number | null;
  /** Contexto do tooltip. */
  produzido: number;
  perdido: number;
}

/**
 * Taxa de perda por dia da semana. Compara PERCENTUAL, não volume
 * absoluto: sábado produz mais que segunda, então o total perdido seria
 * sempre maior no sábado sem que isso signifique desperdício pior.
 */
export function perdaPorDiaDaSemana(recorte: RecorteAnalise): BarraAnalise[] {
  const produzido = new Map<DiaDaSemana, number>();
  const perdido = new Map<DiaDaSemana, number>();

  for (const plano of recorte.planos) {
    for (const item of itensProduzidos(plano)) {
      if (!recorte.codigosNoFiltro.has(item.codigoPdv)) continue;
      produzido.set(plano.diaDaSemana, (produzido.get(plano.diaDaSemana) ?? 0) + item.quantidadeUnidades);
    }
  }
  for (const perda of recorte.perdas) {
    perdido.set(perda.diaDaSemana, (perdido.get(perda.diaDaSemana) ?? 0) + perda.quantidadeUnidadesEstimada);
  }

  return ORDEM_DIAS.map((dia) => montarBarra(ROTULO_DIA[dia], produzido.get(dia) ?? 0, perdido.get(dia) ?? 0));
}

/** Mesma leitura, por semana do mês — pega efeito de salário e feriado. */
export function perdaPorSemanaDoMes(recorte: RecorteAnalise): BarraAnalise[] {
  const produzido = new Map<number, number>();
  const perdido = new Map<number, number>();

  for (const plano of recorte.planos) {
    const semana = semanaDoMes(plano.data);
    for (const item of itensProduzidos(plano)) {
      if (!recorte.codigosNoFiltro.has(item.codigoPdv)) continue;
      produzido.set(semana, (produzido.get(semana) ?? 0) + item.quantidadeUnidades);
    }
  }
  for (const perda of recorte.perdas) {
    const semana = semanaDoMes(perda.data);
    perdido.set(semana, (perdido.get(semana) ?? 0) + perda.quantidadeUnidadesEstimada);
  }

  const semanas = [1, 2, 3, 4, 5].filter((s) => (produzido.get(s) ?? 0) > 0 || (perdido.get(s) ?? 0) > 0);
  return semanas.map((s) =>
    montarBarra(`${s}ª semana`, produzido.get(s) ?? 0, perdido.get(s) ?? 0)
  );
}

/**
 * Produtos que mais desperdiçam, por percentual. Limitado aos que têm
 * produção suficiente para o número significar algo: 3 unidades
 * produzidas e 1 perdida dão 33%, e isso não é padrão, é ruído.
 */
export function topProdutosPorPerda(recorte: RecorteAnalise, quantos = 8): BarraAnalise[] {
  const MINIMO_PARA_CONTAR = 20;
  const produzido = new Map<number, number>();
  const perdido = new Map<number, number>();

  for (const plano of recorte.planos) {
    for (const item of itensProduzidos(plano)) {
      if (!recorte.codigosNoFiltro.has(item.codigoPdv)) continue;
      produzido.set(item.codigoPdv, (produzido.get(item.codigoPdv) ?? 0) + item.quantidadeUnidades);
    }
  }
  for (const perda of recorte.perdas) {
    perdido.set(perda.codigoPdv, (perdido.get(perda.codigoPdv) ?? 0) + perda.quantidadeUnidadesEstimada);
  }

  const nome = (codigo: number) =>
    recorte.produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  return [...perdido.entries()]
    .map(([codigo, totalPerdido]) => ({
      codigo,
      barra: montarBarra(nome(codigo), produzido.get(codigo) ?? 0, totalPerdido),
    }))
    .filter(({ barra }) => barra.produzido >= MINIMO_PARA_CONTAR && barra.valor !== null)
    .sort((a, b) => (b.barra.valor ?? 0) - (a.barra.valor ?? 0))
    .slice(0, quantos)
    .map(({ barra }) => barra);
}

function montarBarra(rotulo: string, produzido: number, perdido: number): BarraAnalise {
  return {
    rotulo,
    produzido: arredondar(produzido),
    perdido: arredondar(perdido),
    valor: produzido > 0 ? arredondar((perdido / produzido) * 100) : null,
  };
}

/**
 * Percentual como o Brasil escreve: vírgula decimal e UMA casa. Duas casas
 * numa taxa de perda são precisão falsa — ninguém muda o cronograma por
 * causa de 0,01 ponto — e ainda deixam a coluna de números irregular
 * ("5,4%" ao lado de "5,31%"), que é justamente o que atrapalha a
 * comparação de relance entre as barras.
 */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
