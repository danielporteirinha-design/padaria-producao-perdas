/**
 * src/lib/conversao.ts
 * ---------------------------------------------------------------
 * Núcleo da Regra de Negócio Crítica: normalização de perdas quando
 * o produto é produzido/vendido por unidade, mas descartado por peso.
 *
 * Este módulo é INTENCIONALMENTE puro (sem I/O, sem estado global) para
 * ser testável isoladamente e reutilizável tanto no front-end (preview
 * em tempo real na tela de Perdas) quanto em um eventual job de
 * reprocessamento em lote.
 */

import type { Produto, UnidadeProducao } from "../types/produto";
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
  unidadeNormalizada: UnidadeProducao;
  fatorConversaoAplicado: boolean;
}

/**
 * Normaliza uma entrada de perda (valor + unidade informados pelo operador)
 * para a unidade de produção do produto.
 *
 * Regras:
 *  - Se a unidade de entrada já é igual à unidade de produção -> sem conversão.
 *  - Se o produto é produzido em "un" e a perda foi pesada em "kg" -> exige
 *    permiteRegistroPerdaPorPeso = true e pesoMedioUnitarioGramas cadastrado.
 *  - Nunca arredonda de forma silenciosa: retorna fração de unidade
 *    (ex.: 2.4 pães) para que a camada de agregação decida a política de
 *    arredondamento (ver calcularTaxaPerda) — arredondar aqui corromperia
 *    a métrica percentual em lotes pequenos.
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

  const unidadeProducao = produto.unidadeProducao;

  // Caso 1: unidade de entrada já bate com a unidade de produção -> passa direto.
  if (
    (unidadeEntrada === "kg" && unidadeProducao === "kg") ||
    (unidadeEntrada === "un" && unidadeProducao === "un")
  ) {
    return {
      quantidadeNormalizada: valor,
      unidadeNormalizada: unidadeProducao,
      fatorConversaoAplicado: false,
    };
  }

  // Caso 2: produto vendido em litros não participa da regra de conversão
  // peso<->unidade (fora do escopo desta regra de negócio).
  if (unidadeProducao === "l") {
    throw new ErroConversaoPerda(
      `Produto "${produto.nome}" é medido em litros — conversão kg/un não se aplica. ` +
        `Lance a perda diretamente em litros.`,
      produto.codigoPdv
    );
  }

  // Caso 3: produto é "un", operador pesou em "kg" -> exige fator cadastrado.
  if (unidadeProducao === "un" && unidadeEntrada === "kg") {
    if (!produto.permiteRegistroPerdaPorPeso) {
      throw new ErroConversaoPerda(
        `Produto "${produto.nome}" não está habilitado para registro de perda por peso. ` +
          `Habilite em Cadastro de Produtos ou lance a perda em unidades.`,
        produto.codigoPdv
      );
    }
    if (!produto.pesoMedioUnitarioGramas || produto.pesoMedioUnitarioGramas <= 0) {
      throw new ErroConversaoPerda(
        `Produto "${produto.nome}" está habilitado para perda por peso, mas não tem ` +
          `"peso médio unitário" cadastrado. Cadastre o peso médio (g) antes de lançar em kg.`,
        produto.codigoPdv
      );
    }
    const gramas = valor * GRAMAS_POR_QUILO;
    const unidades = gramas / produto.pesoMedioUnitarioGramas;
    return {
      quantidadeNormalizada: arredondar(unidades, 2),
      unidadeNormalizada: "un",
      fatorConversaoAplicado: true,
    };
  }

  // Caso 4: produto é "kg", operador contou em "un" (menos comum, mas simétrico).
  if (unidadeProducao === "kg" && unidadeEntrada === "un") {
    if (!produto.pesoMedioUnitarioGramas || produto.pesoMedioUnitarioGramas <= 0) {
      throw new ErroConversaoPerda(
        `Produto "${produto.nome}" não tem "peso médio unitário" cadastrado — ` +
          `não é possível converter unidades para kg.`,
        produto.codigoPdv
      );
    }
    const gramas = valor * produto.pesoMedioUnitarioGramas;
    return {
      quantidadeNormalizada: arredondar(gramas / GRAMAS_POR_QUILO, 3),
      unidadeNormalizada: "kg",
      fatorConversaoAplicado: true,
    };
  }

  // Guarda de exaustividade — se um novo UnidadeProducao for adicionado ao
  // tipo sem atualizar esta função, falha de forma clara em vez de silenciosa.
  throw new ErroConversaoPerda(
    `Combinação de unidades não suportada: produto em "${unidadeProducao}", ` +
      `entrada em "${unidadeEntrada}".`,
    produto.codigoPdv
  );
}

function arredondar(valor: number, casasDecimais: number): number {
  const fator = 10 ** casasDecimais;
  return Math.round(valor * fator) / fator;
}
