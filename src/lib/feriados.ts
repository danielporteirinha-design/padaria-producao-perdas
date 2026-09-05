/**
 * src/lib/feriados.ts
 * ---------------------------------------------------------------
 * Feriados nacionais (fixos e móveis) e a regra de "próximo dia útil" da
 * padaria (set/2026, pedido do dono do negócio: a Lista de Produção
 * mirava "amanhã" no calendário, sem saber que a filial não abre aos
 * domingos nem em feriado, e a matriz só fecha no 1º de janeiro).
 *
 * A REGRA
 * --------
 * - FILIAL: fecha aos domingos e nos feriados abaixo — MENOS quando o
 *   feriado cai num sábado. Sábado já é dia de abertura normal, e o
 *   feriado em cima dele não fecha a loja (decisão do dono do negócio).
 * - MATRIZ: fecha só no dia 1º de janeiro — é o único dia do ano em que
 *   ela não produz.
 *
 * FERIADOS MÓVEIS (Carnaval, Sexta-feira Santa, Corpus Christi) usam a
 * data da Páscoa daquele ano (algoritmo gregoriano de Meeus/Jones/
 * Butcher). Não são feriados nacionais oficiais no calendário civil —
 * são pontos facultativos/religiosos —, mas o dono do negócio pediu para
 * tratá-los como fechado também, porque é isso que acontece na prática.
 *
 * Módulo puro (sem I/O) — ver scripts/verificar_logica.ts.
 */
import { diaDaSemanaDeData, somarDias } from "./data";

/** Domingo de Páscoa do ano, em ISO (YYYY-MM-DD). */
function pascoaIso(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Carnaval (terça), Sexta-feira Santa e Corpus Christi — a partir da Páscoa. */
function feriadosMoveis(ano: number): string[] {
  const pascoa = pascoaIso(ano);
  return [
    somarDias(pascoa, -47), // Carnaval (terça-feira)
    somarDias(pascoa, -2), // Sexta-feira Santa
    somarDias(pascoa, 60), // Corpus Christi
  ];
}

/** Os 9 feriados nacionais de data fixa. */
function feriadosFixos(ano: number): string[] {
  const a = String(ano);
  return [
    `${a}-01-01`, // Confraternização Universal
    `${a}-04-21`, // Tiradentes
    `${a}-05-01`, // Dia do Trabalho
    `${a}-09-07`, // Independência do Brasil
    `${a}-10-12`, // Nossa Senhora Aparecida
    `${a}-11-02`, // Finados
    `${a}-11-15`, // Proclamação da República
    `${a}-11-20`, // Dia da Consciência Negra
    `${a}-12-25`, // Natal
  ];
}

/** Todos os feriados (fixos + móveis) de um ano — a lista que a filial usa. */
function feriadosDoAno(ano: number): string[] {
  return [...feriadosFixos(ano), ...feriadosMoveis(ano)];
}

/** Esta data ISO é feriado nacional (fixo ou móvel)? */
export function ehFeriadoNacional(dataIso: string): boolean {
  const ano = Number(dataIso.slice(0, 4));
  return feriadosDoAno(ano).includes(dataIso);
}

/**
 * A FILIAL fecha aos domingos e nos feriados — menos quando o feriado
 * cai num sábado, dia que já abre normalmente por conta própria.
 */
export function filialFechadaEm(dataIso: string): boolean {
  const dia = diaDaSemanaDeData(dataIso);
  if (dia === "domingo") return true;
  if (dia === "sabado") return false;
  return ehFeriadoNacional(dataIso);
}

/** A MATRIZ só fecha no dia 1º de janeiro. */
export function matrizFechadaEm(dataIso: string): boolean {
  return dataIso.slice(5) === "01-01";
}

/**
 * Primeira data, a partir de (e incluindo) `dataIso`, em que a FILIAL
 * abre. Usada para achar o próximo dia de pedido — nunca aponta para um
 * domingo ou feriado, mesmo que `dataIso` caia num.
 */
export function proximoDiaUtilFilial(dataIso: string): string {
  let data = dataIso;
  while (filialFechadaEm(data)) data = somarDias(data, 1);
  return data;
}

/**
 * Mesma ideia, para a MATRIZ — só pula o 1º de janeiro.
 */
export function proximoDiaUtilMatriz(dataIso: string): string {
  let data = dataIso;
  while (matrizFechadaEm(data)) data = somarDias(data, 1);
  return data;
}
