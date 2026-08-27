import type { DiaDaSemana } from "../types/producao";

const DIAS: DiaDaSemana[] = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
];

const ROTULOS: Record<DiaDaSemana, string> = {
  segunda: "Segunda-feira",
  terca: "Terça-feira",
  quarta: "Quarta-feira",
  quinta: "Quinta-feira",
  sexta: "Sexta-feira",
  sabado: "Sábado",
  domingo: "Domingo",
};

/** Deriva o dia da semana (nosso enum) a partir de uma data ISO (YYYY-MM-DD). */
export function diaDaSemanaDeData(dataIso: string): DiaDaSemana {
  // Interpreta a data como local (não UTC) para não "voltar" um dia perto da meia-noite.
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = new Date(ano, (mes ?? 1) - 1, dia ?? 1);
  return DIAS[data.getDay()];
}

export function rotuloDoDia(dia: DiaDaSemana): string {
  return ROTULOS[dia];
}

export function dataDeHojeIso(): string {
  return formatarDataIso(new Date());
}

/**
 * O Cronograma de Produção é sempre montado no fim do expediente do dia
 * anterior, para o dia seguinte — esta é a data-alvo padrão da tela.
 */
export function dataDeAmanhaIso(): string {
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  return formatarDataIso(amanha);
}

function formatarDataIso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Formata "26/08/2026" a partir de uma data ISO (YYYY-MM-DD). */
export function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Diferença em dias inteiros entre duas datas ISO (YYYY-MM-DD) — dataFim
 * menos dataInicio. Negativo se dataInicio for depois de dataFim. Usado
 * para calcular há quantos dias um produto foi produzido (ver
 * src/lib/janelaValidade.ts) — sempre em horário local, para não "pular"
 * um dia perto da meia-noite.
 */
export function diasEntreDatas(dataInicio: string, dataFim: string): number {
  const [a1, m1, d1] = dataInicio.split("-").map(Number);
  const [a2, m2, d2] = dataFim.split("-").map(Number);
  const inicio = new Date(a1, (m1 ?? 1) - 1, d1 ?? 1);
  const fim = new Date(a2, (m2 ?? 1) - 1, d2 ?? 1);
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((fim.getTime() - inicio.getTime()) / MS_POR_DIA);
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

/**
 * Data ISO deslocada em N dias (negativo volta no tempo). Sempre em
 * horário local, pelo mesmo motivo de `diasEntreDatas`: montar a data em
 * UTC faria a janela "pular" um dia perto da meia-noite, e uma janela de
 * análise que começa no dia errado devolve número errado sem avisar.
 */
export function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const base = new Date(ano, (mes ?? 1) - 1, (dia ?? 1) + dias);
  return formatarDataIso(base);
}
