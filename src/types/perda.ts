/**
 * Modelo de dados — Registro de Perdas
 *
 * Princípio de design (crítico): NUNCA descartar o valor bruto informado
 * pelo operador. Guardamos entrada bruta + valor normalizado lado a lado,
 * para que:
 *   1) a métrica de perda (%) seja sempre calculada em QUILOS — a mesma
 *      unidade canônica usada na produção (ver src/lib/conversao.ts);
 *   2) se o peso médio unitário do produto for recalibrado no futuro, seja
 *      possível reprocessar o histórico sem perder a informação original
 *      lançada pelo operador (auditoria/rastreabilidade).
 */

export type UnidadeEntradaPerda = "un" | "kg";

export type MotivoPerda =
  | "queimado"
  | "erro_producao"
  | "validade_vencida"
  | "quebra_transporte"
  | "sobra_nao_vendida"
  | "outro";

export interface RegistroPerda {
  id: string;
  codigoPdv: number;
  planoDeProducaoId: string; // referencia o dia/sessão de produção correspondente
  data: string; // ISO 8601 (YYYY-MM-DD)
  diaDaSemana: import("./producao").DiaDaSemana;

  /** O que o operador efetivamente digitou/pesou — nunca alterar após salvo. */
  entradaBruta: {
    valor: number;
    unidade: UnidadeEntradaPerda;
  };

  /**
   * Resultado da normalização (ver src/lib/conversao.ts), sempre em
   * QUILOS. É o valor usado em todos os cálculos de taxa de perda e
   * nos relatórios agregados.
   */
  quantidadeNormalizada: number;
  unidadeNormalizada: "kg";
  fatorConversaoAplicado: boolean;

  motivo: MotivoPerda;
  observacao?: string;

  registradoPor: string;
  registradoEm: string; // ISO 8601 datetime
}

/** Payload de entrada da tela de Registro de Perdas (antes da normalização). */
export interface LancamentoPerdaInput {
  codigoPdv: number;
  planoDeProducaoId: string;
  valor: number;
  unidade: UnidadeEntradaPerda;
  motivo: MotivoPerda;
  observacao?: string;
  registradoPor: string;
}
