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
import { consolidarProducao, quantidadeDaLoja } from "./consolidacao";
import { ehPedidoDiario, type PedidoFilial } from "../types/pedido";
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

/**
 * Uma unidade DISPONIBILIZADA num dia — o denominador da taxa de perda.
 *
 * O NOME NÃO É "PRODUZIDA" DE PROPÓSITO (ago/2026)
 * -------------------------------------------------
 * Sem filtro de loja, é o total que saiu do forno. Com filtro, é o que
 * chegou ÀQUELA loja: a matriz fica com o que planejou para si, e cada
 * filial com o que pediu. São coisas diferentes, e chamar tudo de
 * "produzido" foi o que escondeu o defeito que isto corrige.
 *
 * O DEFEITO: a tela deixava filtrar por filial, mas o denominador
 * continuava sendo a produção INTEIRA da matriz — as três lojas somadas.
 * A taxa de perda de uma filial saía dividida por um número três vezes
 * maior que o certo, e parecia ótima. Um número errado que parece bom é
 * o pior tipo de número num painel de decisão.
 */
export interface UnidadeFornecida {
  data: string;
  diaDaSemana: DiaDaSemana;
  codigoPdv: number;
  unidades: number;
}

export interface RecorteAnalise {
  perdas: RegistroPerda[];
  produtos: Produto[];
  /** Códigos dentro do filtro de categoria — usado por todas as agregações. */
  codigosNoFiltro: Set<number>;
  /** O denominador, já recortado por período, loja e categoria. */
  fornecimento: UnidadeFornecida[];
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

/**
 * O que foi disponibilizado num dia, já dividido por destino.
 *
 * Usa a MESMA consolidação da fita de produção (ver
 * src/lib/consolidacao.ts): o que a matriz planejou para si mais o que
 * cada filial pediu. Sem filtro de loja devolve o total; com filtro,
 * devolve só a parte daquela loja.
 *
 * Parte de `itensProduzidos`, e não do plano cru: item marcado como "não
 * saiu" no fim do expediente não foi disponibilizado a ninguém, e contá-lo
 * no denominador afrouxaria a taxa de perda de todo mundo.
 */
function fornecimentoDoDia(
  plano: PlanoDeProducaoDiario,
  pedidos: PedidoFilial[],
  codigosNoFiltro: Set<number>,
  lojaId: string | undefined
): UnidadeFornecida[] {
  const consolidado = consolidarProducao(
    itensProduzidos(plano),
    pedidos.filter((p) => p.data === plano.data),
    LOJA_MATRIZ.id
  );

  const naoSaiu = new Set(plano.producaoRealizada?.codigosNaoProduzidos ?? []);

  return consolidado
    .filter((item) => codigosNoFiltro.has(item.codigoPdv) && !naoSaiu.has(item.codigoPdv))
    .map((item) => ({
      data: plano.data,
      diaDaSemana: plano.diaDaSemana,
      codigoPdv: item.codigoPdv,
      unidades: lojaId ? quantidadeDaLoja(item, lojaId) : item.totalUnidades,
    }))
    .filter((u) => u.unidades > 0);
}

/** Aplica período, loja e categoria de uma vez só. */
export function recortar(
  produtos: Produto[],
  planos: PlanoDeProducaoDiario[],
  perdas: RegistroPerda[],
  dataReferencia: string,
  filtro: FiltroAnalise,
  pedidos: PedidoFilial[] = []
): RecorteAnalise {
  const codigosNoFiltro = new Set(
    produtos.filter((p) => !filtro.categoria || p.categoria === filtro.categoria).map((p) => p.codigoPdv)
  );

  const dentroDaJanela = (data: string) => {
    const dias = diasEntreDatas(data, dataReferencia);
    return dias >= 0 && dias < filtro.dias;
  };

  const planosNaJanela = planos.filter((p) => p.status === "confirmado" && dentroDaJanela(p.data));
  const pedidosNaJanela = pedidos.filter(
    (p) => p.status === "enviado" && ehPedidoDiario(p) && dentroDaJanela(p.data)
  );

  return {
    produtos,
    codigosNoFiltro,
    /**
     * O denominador acompanha o filtro de loja (ago/2026).
     *
     * Antes não acompanhava: a loja filtrava só as PERDAS, e a produção
     * continuava sendo a da padaria inteira. Filtrar por uma filial dava
     * uma taxa de perda dividida pelo triplo do que aquela loja recebeu —
     * e o painel existe justamente para decidir em cima desse número.
     */
    fornecimento: planosNaJanela.flatMap((plano) =>
      fornecimentoDoDia(plano, pedidosNaJanela, codigosNoFiltro, filtro.lojaId)
    ),
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
  for (const unidade of recorte.fornecimento) {
    produzido += unidade.unidades;
    diasComProducao.add(unidade.data);
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
  /** O valor plotado. Percentual nos gráficos de perda, média por dia nos de fornada. */
  valor: number | null;
  /** Contexto do tooltip. */
  produzido: number;
  perdido: number;
  /**
   * Frase pronta do detalhe, quando "X un perdidas de Y produzidas" não
   * descreve o gráfico. Os gráficos de fornada contam EVENTOS, não
   * unidades — deixar o componente montar a frase faria ele precisar
   * saber de que gráfico veio cada barra.
   */
  detalhe?: string;
}

/**
 * Taxa de perda por dia da semana. Compara PERCENTUAL, não volume
 * absoluto: sábado produz mais que segunda, então o total perdido seria
 * sempre maior no sábado sem que isso signifique desperdício pior.
 */
export function perdaPorDiaDaSemana(recorte: RecorteAnalise): BarraAnalise[] {
  const produzido = new Map<DiaDaSemana, number>();
  const perdido = new Map<DiaDaSemana, number>();

  for (const unidade of recorte.fornecimento) {
    produzido.set(unidade.diaDaSemana, (produzido.get(unidade.diaDaSemana) ?? 0) + unidade.unidades);
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

  for (const unidade of recorte.fornecimento) {
    const semana = semanaDoMes(unidade.data);
    produzido.set(semana, (produzido.get(semana) ?? 0) + unidade.unidades);
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

  for (const unidade of recorte.fornecimento) {
    produzido.set(unidade.codigoPdv, (produzido.get(unidade.codigoPdv) ?? 0) + unidade.unidades);
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

// ---------------------------------------------------------------
// Análises das FORNADAS (ago/2026)
//
// Marcar fornada custa um toque e virou hábito rápido. O que se ganhou
// com isso é um dado que não existia em lugar nenhum: a HORA em que cada
// coisa fica pronta, todos os dias.
//
// Duas perguntas que esse dado responde e que a taxa de perda não:
//
//   1. O forno está concentrado ou espalhado no dia? Um pico às 6h e
//      nada às 15h significa balcão vazio à tarde — e sobra de manhã.
//   2. Que itens saem em muitas fornadas pequenas? São os candidatos a
//      lote maior (menos setup) ou a produção sob demanda.
//
// Tudo aqui é PURO, como o resto do arquivo. A hora é lida do próprio
// carimbo da marcação, no fuso do aparelho que marcou — que é o da
// padaria.
// ---------------------------------------------------------------

import type { FornadaPronta } from "../types/fornada";

/** Faixas de hora do expediente. Fora delas, entra em "outros horários". */
const FAIXAS_DE_HORA: { inicio: number; fim: number; rotulo: string }[] = [
  { inicio: 4, fim: 7, rotulo: "04h–07h" },
  { inicio: 7, fim: 10, rotulo: "07h–10h" },
  { inicio: 10, fim: 13, rotulo: "10h–13h" },
  { inicio: 13, fim: 16, rotulo: "13h–16h" },
  { inicio: 16, fim: 19, rotulo: "16h–19h" },
];

function horaDaMarcacao(fornada: FornadaPronta): number {
  return new Date(fornada.marcadaEm).getHours();
}

/** Fornadas dentro da janela do filtro, respeitando a categoria. */
export function recortarFornadas(
  fornadas: FornadaPronta[],
  produtos: Produto[],
  dataReferencia: string,
  filtro: FiltroAnalise
): FornadaPronta[] {
  const codigos = new Set(
    produtos
      .filter((p) => !filtro.categoria || p.categoria === filtro.categoria)
      .map((p) => p.codigoPdv)
  );
  return fornadas.filter((f) => {
    const dias = diasEntreDatas(f.data, dataReferencia);
    return dias >= 0 && dias < filtro.dias && codigos.has(f.codigoPdv);
  });
}

/**
 * Quantas fornadas saem em cada faixa de hora, em MÉDIA POR DIA.
 *
 * Média, e não total: em 90 dias qualquer faixa acumula número grande, e
 * o que interessa é o ritmo de um dia típico. "Saem 3 fornadas entre 4h
 * e 7h" é acionável; "saíram 270 em 90 dias" não é.
 */
export function fornadasPorFaixaDeHora(fornadas: FornadaPronta[]): BarraAnalise[] {
  const dias = new Set(fornadas.map((f) => f.data)).size || 1;
  const contagem = new Map<string, number>();
  let foraDoExpediente = 0;

  for (const fornada of fornadas) {
    const hora = horaDaMarcacao(fornada);
    const faixa = FAIXAS_DE_HORA.find((f) => hora >= f.inicio && hora < f.fim);
    if (!faixa) {
      foraDoExpediente += 1;
      continue;
    }
    contagem.set(faixa.rotulo, (contagem.get(faixa.rotulo) ?? 0) + 1);
  }

  const barras: BarraAnalise[] = FAIXAS_DE_HORA.map((faixa) =>
    montarBarraDeFornada(faixa.rotulo, contagem.get(faixa.rotulo) ?? 0, dias)
  );

  if (foraDoExpediente > 0) {
    barras.push(montarBarraDeFornada("outros horários", foraDoExpediente, dias));
  }
  return barras;
}

/**
 * Itens que mais vezes saem do forno, em média por dia.
 *
 * Não é volume: é REPETIÇÃO. Um item com 6 fornadas por dia sai de pouco
 * em pouco o dia inteiro — o oposto de um item que sai uma vez e acabou.
 */
export function produtosPorNumeroDeFornadas(
  fornadas: FornadaPronta[],
  produtos: Produto[],
  quantos = 8
): BarraAnalise[] {
  const dias = new Set(fornadas.map((f) => f.data)).size || 1;
  const contagem = new Map<number, number>();
  for (const fornada of fornadas) {
    contagem.set(fornada.codigoPdv, (contagem.get(fornada.codigoPdv) ?? 0) + 1);
  }

  const nome = (codigo: number) =>
    produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  return [...contagem.entries()]
    .map(([codigo, total]) => montarBarraDeFornada(nome(codigo), total, dias))
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
    .slice(0, quantos);
}

/**
 * Barra de fornada: o valor plotado é a MÉDIA POR DIA, e o detalhe conta
 * o número inteiro por trás dela. Sem o detalhe, "0,4" no gráfico não
 * distingue "2 fornadas em 5 dias" de "40 em 100" — leituras muito
 * diferentes para decidir alguma coisa.
 */
function montarBarraDeFornada(rotulo: string, total: number, dias: number): BarraAnalise {
  return {
    rotulo,
    valor: arredondar(total / dias),
    produzido: dias,
    perdido: total,
    detalhe:
      total === 0
        ? `${rotulo}: nenhuma fornada marcada nesta faixa.`
        : `${rotulo}: ${total} ${total === 1 ? "fornada" : "fornadas"} em ${dias} ${dias === 1 ? "dia" : "dias"} com produção.`,
  };
}

/** Números-cabeçalho das fornadas. */
export function totaisDeFornadas(fornadas: FornadaPronta[]): {
  total: number;
  diasComFornada: number;
  mediaPorDia: number;
  primeiraHoraTipica: string;
} {
  const dias = new Set(fornadas.map((f) => f.data));
  const total = fornadas.length;

  // Hora da PRIMEIRA fornada de cada dia, e a mediana disso: é a hora em
  // que a padaria realmente começa a entregar, sem se deixar levar por um
  // dia atípico de madrugada.
  const primeiras = [...dias]
    .map((dia) => {
      const doDia = fornadas.filter((f) => f.data === dia);
      return Math.min(...doDia.map(horaDaMarcacao));
    })
    .sort((a, b) => a - b);
  const mediana = primeiras.length > 0 ? primeiras[Math.floor(primeiras.length / 2)] : null;

  return {
    total,
    diasComFornada: dias.size,
    mediaPorDia: dias.size > 0 ? arredondar(total / dias.size) : 0,
    primeiraHoraTipica: mediana === null ? "—" : `${String(mediana).padStart(2, "0")}h`,
  };
}
