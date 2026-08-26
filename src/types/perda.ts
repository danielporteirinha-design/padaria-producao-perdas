/**
 * Modelo de dados — Registro de Perdas
 *
 * Decisão operacional (revisada ago/2026): a perda é sempre PESADA na
 * balança (quilos) — nunca contada em unidades diretamente, porque nem
 * sempre dá para contar pedaços quebrados. Para ainda assim comparar
 * perda com produção (que agora é planejada em UNIDADES — ver
 * src/types/producao.ts), o operador informa também o peso de 1 unidade
 * do item descartado no momento do lançamento; o app deriva a partir daí
 * quantas unidades aquele peso representa.
 *
 * O peso unitário informado nunca é descartado — ele também alimenta de
 * volta o cadastro do produto (Produto.pesoMedioUnitarioGramas), para que
 * o valor sugerido nos próximos lançamentos fique cada vez mais preciso
 * (ver src/App.tsx, handleRegistrarPerda).
 */

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

  /** Peso bruto pesado na balança — o dado que o operador efetivamente leu. Nunca alterar após salvo. */
  quantidadeQuilos: number;

  /** Peso de 1 unidade do item descartado, informado pelo operador neste lançamento (gramas). */
  pesoUnitarioGramasInformado: number;

  /**
   * Unidades perdidas estimadas = quantidadeQuilos*1000 / pesoUnitarioGramasInformado.
   * É o valor usado em conjunto com ItemPlanoProducao.quantidadeUnidades no cálculo
   * de taxa de perda (%) — produzido e perdido ficam na mesma unidade.
   */
  quantidadeUnidadesEstimada: number;

  motivo: MotivoPerda;
  observacao?: string;

  registradoPor: string;
  registradoEm: string; // ISO 8601 datetime

  /**
   * Loja onde a perda aconteceu (ver src/lib/lojas.ts). A filial descarta
   * o que sobrou na loja dela, não na matriz, então a origem precisa ficar
   * registrada para a análise por loja fazer sentido.
   *
   * Opcional porque registros anteriores a ago/2026 são de quando existia
   * uma loja só — a migração carimba MATRIZ neles.
   */
  lojaId?: string;
}

/** Payload de entrada da tela de Registro de Perdas (antes do cálculo de unidades). */
export interface LancamentoPerdaInput {
  codigoPdv: number;
  planoDeProducaoId: string;
  quantidadeQuilos: number;
  pesoUnitarioGramasInformado: number;
  motivo: MotivoPerda;
  observacao?: string;
  registradoPor: string;
}
