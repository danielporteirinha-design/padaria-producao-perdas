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
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
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
