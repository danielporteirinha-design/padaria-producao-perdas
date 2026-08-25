/**
 * scripts/verificar_logica.ts
 * ---------------------------------------------------------------
 * Script de verificação manual (não é um framework de testes) para
 * validar casos de borda do cálculo de perda em unidades e dos
 * cálculos agregados antes da entrega.
 *
 * Rodar com: npx tsx scripts/verificar_logica.ts
 */

import { calcularPerdaEmUnidades, ErroConversaoPerda } from "../src/lib/conversao";
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
// Caso 1: pão francês, 1kg perdido, peso unitário informado 50g -> 20 un
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
  const r = calcularPerdaEmUnidades(paoFrances, 1, 50);
  afirmar(r.quantidadeUnidadesEstimada === 20, `1kg / 50g = 20 unidades (obtido: ${r.quantidadeUnidadesEstimada})`);
  afirmar(r.quantidadeQuilos === 1, "quilos permanece 1 (valor bruto preservado)");
  afirmar(r.pesoUnitarioGramasInformado === 50, "peso unitário informado preservado");
}

// ---------------------------------------------------------------
// Caso 2: mesma fornada com peso diferente do cadastrado (informado na
// hora do lançamento, não o peso médio fixo) -> unidades muda de acordo.
// ---------------------------------------------------------------
{
  const r = calcularPerdaEmUnidades(paoFrances, 1, 40); // fornada mais leve hoje
  afirmar(r.quantidadeUnidadesEstimada === 25, `1kg / 40g = 25 unidades (obtido: ${r.quantidadeUnidadesEstimada})`);
}

// ---------------------------------------------------------------
// Caso 3: peso unitário ausente/zero -> deve falhar de forma clara
// ---------------------------------------------------------------
{
  try {
    calcularPerdaEmUnidades(paoFrances, 0.5, 0);
    afirmar(false, "deveria ter lançado ErroConversaoPerda por peso unitário zero");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "lançou ErroConversaoPerda quando peso unitário é zero");
  }
}

// ---------------------------------------------------------------
// Caso 4: quilos negativo -> inválido
// ---------------------------------------------------------------
{
  try {
    calcularPerdaEmUnidades(paoFrances, -1, 50);
    afirmar(false, "deveria ter rejeitado quilos negativo");
  } catch (e) {
    afirmar(e instanceof ErroConversaoPerda, "rejeitou quilos negativo");
  }
}

// ---------------------------------------------------------------
// Caso 5: quilos = 0 com peso unitário válido -> 0 unidades, sem erro
// (lançamento de "não houve perda" é uma entrada válida)
// ---------------------------------------------------------------
{
  const r = calcularPerdaEmUnidades(paoFrances, 0, 50);
  afirmar(r.quantidadeUnidadesEstimada === 0, "0kg perdido resulta em 0 unidades, sem lançar erro");
}

// ---------------------------------------------------------------
// Caso 6: agregações (taxa de perda, volume por dia, picos) — produção
// em unidades, perda derivada em unidades a partir do peso informado.
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
        itens: [{ codigoPdv: 112, quantidadeUnidades: 200 }],
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
    quantidadeQuilos: 1, // pesado na balança
    pesoUnitarioGramasInformado: 50,
    quantidadeUnidadesEstimada: 20, // 1kg / 50g
    motivo: "sobra_nao_vendida",
    registradoPor: "teste",
    registradoEm: "2026-08-20T20:00:00Z",
  },
];

{
  const taxas = calcularTaxaPerdaPorProduto(produtos, planos, perdas);
  afirmar(taxas.length === 1, "calcularTaxaPerdaPorProduto retorna 1 produto");
  afirmar(taxas[0].perdaPercentual === 10, `200 un produzidas, 20 un perdidas = 10% (obtido: ${taxas[0]?.perdaPercentual})`);
  afirmar(taxas[0].totalPerdidoQuilos === 1, `1kg pesado na balança preservado como métrica auxiliar (obtido: ${taxas[0]?.totalPerdidoQuilos})`);

  const volumes = calcularVolumeProducaoPorDiaDaSemana(planos);
  afirmar(volumes[0].totalPlanejado === 200, "volume de produção de quinta = 200 un");

  const picos = identificarPicosDePerda(produtos, planos, perdas, false);
  afirmar(picos[0].diaDaSemana === "quinta" && picos[0].perdaPercentualMedia === 10, "pico de perda identifica quinta com 10%");
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
