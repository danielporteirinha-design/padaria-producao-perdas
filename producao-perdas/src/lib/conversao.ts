/**
 * src/lib/conversao.ts
 * ---------------------------------------------------------------
 * Núcleo da Regra de Negócio Crítica: derivar quantas unidades uma perda
 * pesada na balança representa.
 *
 * Decisão operacional (revisada ago/2026): produção é planejada em
 * UNIDADES (ver src/types/producao.ts), mas perda continua sendo pesada
 * em quilos na balança — pedaço quebrado não se conta fácil. Para que
 * "produzido" e "perdido" fiquem na mesma unidade na hora de calcular a
 * taxa de perda (%), o operador informa o peso médio de 1 unidade do item
 * descartado a cada lançamento; este módulo deriva:
 *
 *   unidades perdidas = (quilos perdidos * 1000) / peso de 1 unidade (g)
 *
 * O peso informado pode variar de fornada para fornada — por isso é
 * pedido a cada lançamento, não fixo. Ele também retroalimenta o
 * cadastro do produto (ver src/App.tsx), então a sugestão pré-preenchida
 * fica mais precisa com o tempo, mas o operador sempre pode ajustar.
 *
 * Este módulo é INTENCIONALMENTE puro (sem I/O, sem estado global) para
 * ser testável isoladamente e reutilizável tanto no front-end (preview
 * em tempo real na tela de Perdas) quanto em um eventual job de
 * reprocessamento em lote.
 */

import type { Produto } from "../types/produto";

const GRAMAS_POR_QUILO = 1000;

/** Erro de domínio — sempre com causa explícita, nunca um "undefined" silencioso. */
export class ErroConversaoPerda extends Error {
  constructor(message: string, public readonly codigoPdv: number) {
    super(message);
    this.name = "ErroConversaoPerda";
  }
}

export interface ResultadoPerda {
  quantidadeQuilos: number;
  pesoUnitarioGramasInformado: number;
  quantidadeUnidadesEstimada: number;
}

/**
 * Calcula quantas unidades uma perda pesada em quilos representa, dado o
 * peso de 1 unidade informado pelo operador no momento do lançamento.
 *
 * Regras:
 *  - quilos perdidos deve ser >= 0 e finito.
 *  - peso unitário informado deve ser > 0 e finito — é o divisor, e sem
 *    ele não há como derivar unidades (o app se recusa a inventar um
 *    número ou usar um peso desatualizado silenciosamente).
 *  - Arredonda quilos a 3 casas (grama de precisão) e unidades a 2 casas
 *    (uma perda pequena ainda deve refletir fração de unidade na métrica
 *    percentual, mesmo que a exibição arredonde para inteiro).
 */
export function calcularPerdaEmUnidades(
  produto: Produto,
  quilos: number,
  pesoUnitarioGramasInformado: number
): ResultadoPerda {
  if (quilos < 0 || !Number.isFinite(quilos)) {
    throw new ErroConversaoPerda(
      `Peso perdido inválido (${quilos}) para o produto "${produto.nome}".`,
      produto.codigoPdv
    );
  }
  if (!Number.isFinite(pesoUnitarioGramasInformado) || pesoUnitarioGramasInformado <= 0) {
    throw new ErroConversaoPerda(
      `Informe o peso de 1 unidade de "${produto.nome}" (em gramas, maior que zero) para calcular quantas ` +
        `unidades essa perda representa.`,
      produto.codigoPdv
    );
  }

  const unidades = (quilos * GRAMAS_POR_QUILO) / pesoUnitarioGramasInformado;

  return {
    quantidadeQuilos: arredondar(quilos, 3),
    pesoUnitarioGramasInformado: arredondar(pesoUnitarioGramasInformado, 1),
    quantidadeUnidadesEstimada: arredondar(unidades, 2),
  };
}

function arredondar(valor: number, casasDecimais: number): number {
  const fator = 10 ** casasDecimais;
  return Math.round(valor * fator) / fator;
}
