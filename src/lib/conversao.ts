/**
 * src/lib/conversao.ts
 * ---------------------------------------------------------------
 * Núcleo da Regra de Negócio Crítica: normalização de perdas.
 *
 * Decisão operacional (ago/2026): QUILOS é a unidade canônica de toda
 * métrica de produção e perda no app — mesmo para produtos vendidos por
 * unidade, porque a produção em si já é planejada em quilos (ver
 * src/types/producao.ts). Isso mantém "produzido" e "perdido" sempre na
 * mesma unidade, então taxa de perda = perdido/produzido nunca mistura
 * quilos com unidades.
 *
 * A tela de Perdas ainda aceita lançar contando unidades quebradas/sobras
 * (mais rápido que pesar item por item às vezes) — quando isso acontece,
 * convertemos para quilos via peso médio cadastrado no produto.
 *
 * Este módulo é INTENCIONALMENTE puro (sem I/O, sem estado global) para
 * ser testável isoladamente e reutilizável tanto no front-end (preview
 * em tempo real na tela de Perdas) quanto em um eventual job de
 * reprocessamento em lote.
 */

import type { Produto } from "../types/produto";
import type { UnidadeEntradaPerda } from "../types/perda";

const GRAMAS_POR_QUILO = 1000;

/** Erro de domínio — sempre com causa explícita, nunca um "undefined" silencioso. */
export class ErroConversaoPerda extends Error {
  constructor(message: string, public readonly codigoPdv: number) {
    super(message);
    this.name = "ErroConversaoPerda";
  }
}

export interface ResultadoNormalizacao {
  quantidadeNormalizada: number;
  unidadeNormalizada: "kg";
  fatorConversaoAplicado: boolean;
}

/**
 * Normaliza uma entrada de perda (valor + unidade informados pelo
 * operador) para QUILOS.
 *
 * Regras:
 *  - Entrada em "kg" -> sempre aceita direto, nenhum produto precisa de
 *    cadastro prévio para isso (pesar na balança sempre funciona).
 *  - Entrada em "un" -> exige pesoMedioUnitarioGramas cadastrado no
 *    produto; sem isso não há como saber quantos quilos aquelas unidades
 *    representam, e o app se recusa a inventar um número.
 *  - Nunca arredonda de forma agressiva: mantém 3 casas decimais (grama
 *    de precisão) para não corromper a métrica percentual em lotes
 *    pequenos.
 */
export function normalizarQuantidadePerda(
  produto: Produto,
  valor: number,
  unidadeEntrada: UnidadeEntradaPerda
): ResultadoNormalizacao {
  if (valor < 0 || !Number.isFinite(valor)) {
    throw new ErroConversaoPerda(
      `Valor de perda inválido (${valor}) para o produto "${produto.nome}".`,
      produto.codigoPdv
    );
  }

  if (unidadeEntrada === "kg") {
    return { quantidadeNormalizada: arredondar(valor, 3), unidadeNormalizada: "kg", fatorConversaoAplicado: false };
  }

  // unidadeEntrada === "un" -> converter para quilos via peso médio.
  if (!produto.pesoMedioUnitarioGramas || produto.pesoMedioUnitarioGramas <= 0) {
    throw new ErroConversaoPerda(
      `Produto "${produto.nome}" não tem "peso médio unitário" cadastrado — não é possível ` +
        `converter unidades para quilos. Cadastre o peso médio (g) em Produtos, ou lance a perda direto em kg.`,
      produto.codigoPdv
    );
  }
  const quilos = (valor * produto.pesoMedioUnitarioGramas) / GRAMAS_POR_QUILO;
  return { quantidadeNormalizada: arredondar(quilos, 3), unidadeNormalizada: "kg", fatorConversaoAplicado: true };
}

function arredondar(valor: number, casasDecimais: number): number {
  const fator = 10 ** casasDecimais;
  return Math.round(valor * fator) / fator;
}
