/**
 * scripts/verificar_logica.ts
 * ---------------------------------------------------------------
 * Script de verificação manual (não é um framework de testes) para
 * validar casos de borda da normalização de perdas (sempre em QUILOS)
 * e dos cálculos agregados antes da entrega.
 *
 * Rodar com: npx tsx scripts/verificar_logica.ts
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
// Caso 1: pão francês (un no PDV), peso médio 50g -> lançamento em kg
// é sempre aceito direto, sem conversão (kg é a unidade canônica).
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
  pesoMedioUnitarioGramas: 50,
};

{
  const r = normalizarQuantidadePerda(paoFrances, 1, "kg"); // 1kg pesado na balança
  afirmar(r.quantidadeNormalizada === 1, `1kg lançado em kg permanece 1kg (obtido: ${r.quantidadeNormalizada})`);
  afirmar(r.unidadeNormalizada === "kg", "unidade normalizada = kg");
  afirmar(r.fatorConversaoAplicado === false, "sem conversão quando já lançado em kg");
}

// ---------------------------------------------------------------
// Caso 2: mesmo produto, lançamento contando unidades quebradas/sobras
// -> converte para quilos via peso médio (50g = 0.05kg cada).
// ---------------------------------------------------------------
{
  const r = normalizarQuantidadePerda(paoFrances, 8, "un"); // 8 unidades x 50g = 0.4kg
  afirmar(r.quantidadeNormalizada === 0.4, `8un x 50g = 0.4kg (obtido: ${r.quantidadeNormalizada})`);
  afirmar(r.unidadeNormalizada === "kg", "unidade normalizada = kg (mesmo lançando em un)");
  afirmar(r.fatorConversaoAplicado === true, "fator de conversão foi aplicado ao lançar em un");
}

// ---------------------------------------------------------------
// Caso 3: produto SEM peso médio cadastrado, lançamento em "un" ->
// deve falhar de forma clara (não há como converter para kg).
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
  pesoMedioUnitarioGramas: undefined,
};

{
  try {
    normalizarQuantidadePerda(bolinhoSemPeso, 5, "un");
    afirmar(false, "deveria ter lançado ErroConversaoPerda por falta de peso médio");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "lançou ErroConversaoPerda quando peso médio ausente e lançamento em un");
  }
}

// ---------------------------------------------------------------
// Caso 4: mesmo produto sem peso médio, mas lançamento direto em kg
// -> continua funcionando normalmente (balança não depende de peso médio).
// ---------------------------------------------------------------
{
  const r = normalizarQuantidadePerda(bolinhoSemPeso, 0.3, "kg");
  afirmar(r.quantidadeNormalizada === 0.3, "lançamento em kg funciona mesmo sem peso médio cadastrado");
  afirmar(r.fatorConversaoAplicado === false, "sem conversão ao lançar em kg, independente do peso médio");
}

// ---------------------------------------------------------------
// Caso 5: valor negativo -> inválido
// ---------------------------------------------------------------
{
  try {
    normalizarQuantidadePerda(paoFrances, -1, "kg");
    afirmar(false, "deveria ter rejeitado valor negativo");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "rejeitou valor negativo");
  }
}

// ---------------------------------------------------------------
// Caso 6: valor não finito (NaN) -> inválido
// ---------------------------------------------------------------
{
  try {
    normalizarQuantidadePerda(paoFrances, NaN, "kg");
    afirmar(false, "deveria ter rejeitado valor não numérico");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "rejeitou valor NaN");
  }
}

// ---------------------------------------------------------------
// Caso 7: agregações (taxa de perda, volume por dia, picos) — tudo em kg
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
        categoria: "PÃES E ROSCAS",
        itens: [{ codigoPdv: 112, quantidadeQuilos: 20 }],
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
    entradaBruta: { valor: 40, unidade: "un" },
    quantidadeNormalizada: 2, // 40un x 50g = 2kg
    unidadeNormalizada: "kg",
    fatorConversaoAplicado: true,
    motivo: "sobra_nao_vendida",
    registradoPor: "teste",
    registradoEm: "2026-08-20T20:00:00Z",
  },
];

{
  const taxas = calcularTaxaPerdaPorProduto(produtos, planos, perdas);
  afirmar(taxas.length === 1, "calcularTaxaPerdaPorProduto retorna 1 produto");
  afirmar(taxas[0].perdaPercentual === 10, `20kg produzidos, 2kg perdidos = 10% (obtido: ${taxas[0]?.perdaPercentual})`);

  const volumes = calcularVolumeProducaoPorDiaDaSemana(planos);
  afirmar(volumes[0].totalPlanejado === 20, "volume de produção de quinta = 20kg");

  const picos = identificarPicosDePerda(produtos, planos, perdas, false);
  afirmar(picos[0].diaDaSemana === "quinta" && picos[0].perdaPercentualMedia === 10, "pico de perda identifica quinta com 10%");
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
