/**
 * scripts/verificar_logica.ts
 * ---------------------------------------------------------------
 * Script de verificação manual (não é um framework de testes) para
 * validar casos de borda da conversão kg<->un e dos cálculos agregados
 * antes da entrega. Rodar com: npx tsx scripts/verificar_logica.ts
 */

import { normalizarQuantidadePerda, ErroConversaoPerda } from "../src/lib/conversao";
import {
  calcularTaxaPerdaPorProduto,
  calcularVolumeProducaoPorDiaDaSemana,
  identificarPicosDePerda,
} from "../src/lib/metricas";
import type { Produto } from "../src/types/produto";
import type { PlanoDeProducaoDiario } from "../src/types/producao";
import type { RegistroPerda } from "../src/types/perda";

let falhas = 0;
function afirmar(condicao: boolean, descricao: string) {
  if (condicao) {
    console.log(`OK   - ${descricao}`);
  } else {
    console.error(`FALHOU - ${descricao}`);
    falhas++;
  }
}

// ---------------------------------------------------------------
// Caso 1: pão francês (un), perda pesada em kg, peso médio 50g
// ---------------------------------------------------------------
const paoFrances: Produto = {
  codigoPdv: 112,
  nome: "PÃO FRANCÊS",
  categoria: "PÃES E ROSCAS",
  unidadeProducao: "un",
  precoCusto: 0.25,
  precoVenda: 0.6,
  statusVenda: "Ativo",
  ativoNaProducao: true,
  permiteRegistroPerdaPorPeso: true,
  pesoMedioUnitarioGramas: 50,
};

{
  const r = normalizarQuantidadePerda(paoFrances, 1, "kg"); // 1kg de pão francês
  afirmar(r.quantidadeNormalizada === 20, `1kg / 50g = 20 unidades (obtido: ${r.quantidadeNormalizada})`);
  afirmar(r.unidadeNormalizada === "un", "unidade normalizada = un");
  afirmar(r.fatorConversaoAplicado === true, "fator de conversão foi aplicado");
}

// ---------------------------------------------------------------
// Caso 2: mesmo produto, lançamento direto em unidades (sem conversão)
// ---------------------------------------------------------------
{
  const r = normalizarQuantidadePerda(paoFrances, 8, "un");
  afirmar(r.quantidadeNormalizada === 8, "lançamento direto em un não é alterado");
  afirmar(r.fatorConversaoAplicado === false, "sem conversão quando unidade já bate");
}

// ---------------------------------------------------------------
// Caso 3: produto SEM peso médio cadastrado -> deve falhar de forma clara
// ---------------------------------------------------------------
const bolinhoSemPeso: Produto = {
  codigoPdv: 9001,
  nome: "BOLINHO TESTE SEM PESO",
  categoria: "CONFEITARIA",
  unidadeProducao: "un",
  precoCusto: 0.5,
  precoVenda: 1.5,
  statusVenda: "Ativo",
  ativoNaProducao: true,
  permiteRegistroPerdaPorPeso: true,
  pesoMedioUnitarioGramas: undefined,
};

{
  try {
    normalizarQuantidadePerda(bolinhoSemPeso, 0.5, "kg");
    afirmar(false, "deveria ter lançado ErroConversaoPerda por falta de peso médio");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "lançou ErroConversaoPerda quando peso médio ausente");
  }
}

// ---------------------------------------------------------------
// Caso 4: produto não habilitado para perda por peso -> deve falhar
// ---------------------------------------------------------------
const bolinhoNaoHabilitado: Produto = {
  ...bolinhoSemPeso,
  codigoPdv: 9002,
  permiteRegistroPerdaPorPeso: false,
  pesoMedioUnitarioGramas: 40,
};

{
  try {
    normalizarQuantidadePerda(bolinhoNaoHabilitado, 0.2, "kg");
    afirmar(false, "deveria ter lançado ErroConversaoPerda por produto não habilitado");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "lançou ErroConversaoPerda quando não habilitado para peso");
  }
}

// ---------------------------------------------------------------
// Caso 5: valor negativo -> inválido
// ---------------------------------------------------------------
{
  try {
    normalizarQuantidadePerda(paoFrances, -1, "un");
    afirmar(false, "deveria ter rejeitado valor negativo");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "rejeitou valor negativo");
  }
}

// ---------------------------------------------------------------
// Caso 6: produto medido em litros -> conversão kg/un não se aplica
// ---------------------------------------------------------------
const sucoLitro: Produto = {
  codigoPdv: 9003,
  nome: "SUCO NATURAL 1L",
  categoria: "SUCOS",
  unidadeProducao: "l",
  precoCusto: 3,
  precoVenda: 8,
  statusVenda: "Ativo",
  ativoNaProducao: true,
  permiteRegistroPerdaPorPeso: false,
};

{
  try {
    normalizarQuantidadePerda(sucoLitro, 1, "kg");
    afirmar(false, "deveria ter rejeitado kg para produto em litros");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "rejeitou conversão kg para produto em litros");
  }
}

// ---------------------------------------------------------------
// Caso 7: agregações (taxa de perda, volume por dia, picos)
// ---------------------------------------------------------------
const produtos: Produto[] = [paoFrances];

const planos: PlanoDeProducaoDiario[] = [
  {
    id: "plano-1",
    data: "2026-08-20",
    diaDaSemana: "quinta",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-08-19T18:00:00Z",
    sessoes: [
      {
        id: "sessao-1",
        tipo: "fixa",
        nome: "Fornada padrão",
        itens: [{ codigoPdv: 112, quantidadePlanejada: 200 }],
      },
    ],
  },
];

const perdas: RegistroPerda[] = [
  {
    id: "perda-1",
    codigoPdv: 112,
    planoDeProducaoId: "plano-1",
    data: "2026-08-20",
    diaDaSemana: "quinta",
    entradaBruta: { valor: 1, unidade: "kg" },
    quantidadeNormalizada: 20,
    unidadeNormalizada: "un",
    fatorConversaoAplicado: true,
    motivo: "sobra_nao_vendida",
    registradoPor: "teste",
    registradoEm: "2026-08-20T20:00:00Z",
  },
];

{
  const taxas = calcularTaxaPerdaPorProduto(produtos, planos, perdas);
  afirmar(taxas.length === 1, "calcularTaxaPerdaPorProduto retorna 1 produto");
  afirmar(taxas[0].perdaPercentual === 10, `200 produzidos, 20 perdidos = 10% (obtido: ${taxas[0]?.perdaPercentual})`);

  const volumes = calcularVolumeProducaoPorDiaDaSemana(planos);
  afirmar(volumes[0].totalPlanejado === 200, "volume de produção de quinta = 200");

  const picos = identificarPicosDePerda(produtos, planos, perdas, false);
  afirmar(picos[0].diaDaSemana === "quinta" && picos[0].perdaPercentualMedia === 10, "pico de perda identifica quinta com 10%");
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
