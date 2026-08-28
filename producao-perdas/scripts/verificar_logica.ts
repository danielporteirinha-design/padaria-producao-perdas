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
import { calcularCandidatosPerda } from "../src/lib/janelaValidade";
import { ehFalhaTemporariaDeRede, mensagemDeFalhaAoSalvar } from "../src/lib/errosFirestore";
import {
  itensPlanejados,
  naoFoiProduzido,
  producaoFoiConfirmada,
  unidadesProduzidas,
} from "../src/lib/producaoRealizada";
import { construirResumoParaInsights } from "../src/lib/insightsCatalogo";
import { diasEntreDatas } from "../src/lib/data";
import {
  ALTURA_FAIXA_CORTE,
  ALTURA_MAXIMA_SEGURA_PX,
  ALTURA_RODAPE_FINAL,
  agruparBlocosEmImagens,
  computarBlocos,
} from "../src/lib/gerarImagemLista";
import type { Produto } from "../src/types/produto";
import type { PlanoDeProducaoDiario } from "../src/types/producao";
import { perdaEstaValida, type RegistroPerda } from "../src/types/perda";
import {
  decidirReposicao,
  desfechoDaReposicao,
  ehPedidoDiario,
  ehReposicao,
  idDaReposicao,
  ajustarPedidoPelaMatriz,
  diferencasDoAjuste,
  idDoPedido,
  itensIguais,
  reposicaoEstaPendente,
  linhasDeReposicaoDoDia,
  semRespostaDaMatriz,
  totalDoPedido,
  type PedidoFilial,
} from "../src/types/pedido";
import { fornadasNaoVistas, marcarFornadasComoVistas } from "../src/lib/fornadasVistas";
import { comoLiberarNotificacao, plataformaAtual } from "../src/lib/plataforma";
import { contemBusca, paraBusca, radical } from "../src/lib/texto";
import {
  IDS_DAS_LOJAS,
  assinarTokenPersonalizado,
  lerUidsConfigurados,
} from "../api/entrar-como-loja";
import { LOJAS } from "../src/lib/lojas";
import {
  fornadasPorFaixaDeHora,
  produtosPorNumeroDeFornadas,
  recortarFornadas,
  totaisDeFornadas,
} from "../src/lib/analises";
import { somarDias } from "../src/lib/data";
import { incluirItemProduzido, planoContemItem, planoDeHojeCom } from "../src/lib/producaoDeHoje";
import { abaDaUrl, urlDaAba } from "../src/lib/rota";
import { entenderQuantidade } from "../src/lib/vozRespostas";
import { interpretarFrase } from "../src/lib/interpretarPedidoFalado";
import {
  agruparPorSegmento,
  idDoPedidoSuprimentos,
  idDoSuprimento,
  variedadesDoPedidoSuprimentos,
  type Suprimento,
} from "../src/types/suprimento";
import { agruparPorCategoria } from "../src/lib/blocosDeImpressao";
import { proximaDataAlvo } from "../src/lib/dataAlvoDoDia";
import {
  chaveDoRascunho,
  mapaDoPlano,
  mapasIguais,
  rascunhosVencidos,
} from "../src/lib/rascunhoCronograma";
import { ordenarPorAnuncioRecente, ultimaSaidaPorProduto } from "../src/lib/ordemDaReposicao";
import {
  ajustesVencidos,
  chaveDoAjuste,
  chaveDoRascunhoPedido,
  rascunhosDePedidoVencidos,
} from "../src/lib/rascunhoPedido";
import {
  ALTURA_CABECALHO_DOC,
  ALTURA_ESPACO_APOS_SESSAO,
  ALTURA_LINHA_TESTE,
  ALTURA_RODAPE_DOC_ASSINADO,
  ALTURA_SUBTITULO_SESSAO,
  agruparBlocosContinuos,
  agruparPecasEmImagens,
  computarBlocosContinuos,
  montarPecasContinuas,
} from "../src/lib/gerarImagemLista";
import {
  codigosComFornadaNoDia,
  fornadasDoProduto,
  idDaFornada,
  type FornadaPronta,
} from "../src/types/fornada";
import { consolidarProducao, itensParaLoja, quantidadeDaLoja } from "../src/lib/consolidacao";
import {
  calcularTotais,
  perdaPorDiaDaSemana,
  perdaPorSemanaDoMes,
  recortar,
  semanaDoMes,
  topProdutosPorPerda,
} from "../src/lib/analises";
import {
  base64DoDataUrl,
  ErroImpressao,
  LIMITE_BASE64_BYTES,
  resumoDaImpressao,
} from "../src/types/impressao";

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

// ---------------------------------------------------------------
// Caso 7: diasEntreDatas — sanity básico (usado como base de toda a
// janela de validade, então qualquer erro aqui se propaga em cascata).
// ---------------------------------------------------------------
{
  afirmar(diasEntreDatas("2026-08-20", "2026-08-20") === 0, "diasEntreDatas mesma data = 0");
  afirmar(diasEntreDatas("2026-08-20", "2026-08-23") === 3, "diasEntreDatas 3 dias de diferença = 3");
  afirmar(diasEntreDatas("2026-08-23", "2026-08-20") === -3, "diasEntreDatas data futura em relação à referência = negativo");
}

// ---------------------------------------------------------------
// Caso 8: calcularCandidatosPerda — produto SEM prazoValidadeDias.
// Só a fornada do próprio dia é ATRIBUÍVEL (não inventa um prazo que
// ninguém confirmou), mas o produto continua LANÇÁVEL se já foi produzido
// antes: perda não é sinônimo de vencimento (revisão ago/2026).
// ---------------------------------------------------------------
{
  const paoSemValidade: Produto = { ...paoFrances, prazoValidadeDias: undefined };
  const planoDeHoje: PlanoDeProducaoDiario = {
    id: "plano-hoje",
    data: "2026-08-24",
    diaDaSemana: "segunda",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-08-23T18:00:00Z",
    sessoes: [{ id: "sessao-1", categoria: "PÃES E ROSCAS", itens: [{ codigoPdv: 112, quantidadeUnidades: 100 }] }],
  };
  const planoDeOntem: PlanoDeProducaoDiario = { ...planoDeHoje, id: "plano-ontem", data: "2026-08-23" };

  const semValidadeHoje = calcularCandidatosPerda("2026-08-24", [paoSemValidade], [planoDeHoje]);
  afirmar(
    semValidadeHoje.length === 1 && semValidadeHoje[0].origens.length === 1,
    "sem prazoValidadeDias: plano do próprio dia é aceito"
  );

  // Regra revisada (ago/2026): perda NÃO é sinônimo de vencimento. A fornada
  // de ontem, fora do prazo, deixa de ser ATRIBUÍVEL (origens vazio) mas o
  // produto continua LANÇÁVEL, porque já foi produzido em alguma ocasião —
  // um item pode sair fora do padrão e virar perda independentemente de prazo.
  const semValidadeOntem = calcularCandidatosPerda("2026-08-24", [paoSemValidade], [planoDeOntem]);
  afirmar(
    semValidadeOntem.length === 1,
    "produto já produzido antes continua lançável mesmo sem fornada no prazo"
  );
  afirmar(
    semValidadeOntem[0].origens.length === 0,
    "sem prazoValidadeDias: fornada de ontem não é atribuída (não inventa um prazo)"
  );
  afirmar(
    semValidadeOntem[0].ultimaProducao === "2026-08-23",
    `última produção aponta para a fornada real (obtido: ${semValidadeOntem[0].ultimaProducao})`
  );

  // A única trava que resta: produto que NUNCA foi produzido não entra.
  const nuncaProduzido = calcularCandidatosPerda("2026-08-24", [paoSemValidade], []);
  afirmar(
    nuncaProduzido.length === 0,
    "produto nunca produzido não pode receber perda (não existe fornada de origem)"
  );

  // Produtos com fornada no prazo vêm ANTES dos que só têm produção antiga.
  const misturado = calcularCandidatosPerda("2026-08-24", [paoSemValidade], [planoDeHoje, planoDeOntem]);
  afirmar(
    misturado.length === 1 && misturado[0].origens.length === 1,
    "fornada de hoje continua sendo atribuída quando existe"
  );
}

// ---------------------------------------------------------------
// Caso 9: calcularCandidatosPerda — produto COM prazoValidadeDias=3
// aceita fornadas de 0, 1 e 2 dias atrás, mas não de 3+ dias atrás.
// ---------------------------------------------------------------
{
  const confeitaria: Produto = {
    codigoPdv: 500,
    nome: "TORTA DE MORANGO",
    categoria: "CONFEITARIA",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
    prazoValidadeDias: 3,
  };
  const dataReferencia = "2026-08-24";
  const planos3dias: PlanoDeProducaoDiario[] = ["2026-08-24", "2026-08-23", "2026-08-22", "2026-08-21"].map(
    (data, i) => ({
      id: `plano-conf-${i}`,
      data,
      diaDaSemana: "segunda",
      status: "confirmado",
      criadoPor: "teste",
      criadoEm: `${data}T18:00:00Z`,
      sessoes: [{ id: "sessao-1", categoria: "CONFEITARIA", itens: [{ codigoPdv: 500, quantidadeUnidades: 10 }] }],
    })
  );

  const candidatos = calcularCandidatosPerda(dataReferencia, [confeitaria], planos3dias);
  afirmar(candidatos.length === 1, "prazoValidadeDias=3: produto aparece como 1 candidato agregando as origens");
  afirmar(
    candidatos[0]?.origens.length === 3,
    `prazoValidadeDias=3: aceita 0, 1 e 2 dias atrás, rejeita 3 (obtido: ${candidatos[0]?.origens.length} origens)`
  );
  afirmar(
    candidatos[0]?.origens[0]?.data === "2026-08-22",
    `origens ordenadas da mais antiga (FIFO) primeiro (obtido: ${candidatos[0]?.origens[0]?.data})`
  );
  afirmar(
    candidatos[0]?.origens[candidatos[0].origens.length - 1]?.data === "2026-08-24",
    "última origem da lista é a mais nova (hoje)"
  );
  afirmar(
    !candidatos[0]?.origens.some((o) => o.data === "2026-08-21"),
    "fornada de 3 dias atrás (fora do prazo) não aparece como candidata"
  );
}

// ---------------------------------------------------------------
// Caso 10: calcularCandidatosPerda — ignora planos não confirmados e
// planos com data no futuro em relação à referência.
// ---------------------------------------------------------------
{
  const planoRascunho: PlanoDeProducaoDiario = {
    id: "plano-rascunho",
    data: "2026-08-24",
    diaDaSemana: "segunda",
    status: "rascunho",
    criadoPor: "teste",
    criadoEm: "2026-08-24T10:00:00Z",
    sessoes: [{ id: "sessao-1", categoria: "PÃES E ROSCAS", itens: [{ codigoPdv: 112, quantidadeUnidades: 100 }] }],
  };
  const planoFuturo: PlanoDeProducaoDiario = { ...planoRascunho, id: "plano-futuro", status: "confirmado", data: "2026-08-25" };

  const semRascunho = calcularCandidatosPerda("2026-08-24", [paoFrances], [planoRascunho]);
  afirmar(semRascunho.length === 0, "plano não confirmado (rascunho) não gera candidatos de perda");

  const semFuturo = calcularCandidatosPerda("2026-08-24", [paoFrances], [planoFuturo]);
  afirmar(semFuturo.length === 0, "plano com data futura em relação à referência é ignorado");
}

// ---------------------------------------------------------------
// Caso 11: construirResumoParaInsights — só entram produtos ATIVOS das 5
// categorias de produção; inativos e fora de escopo ficam de fora.
// ---------------------------------------------------------------
{
  const confeitariaAtiva: Produto = {
    codigoPdv: 700,
    nome: "TORTA DE LIMÃO",
    categoria: "CONFEITARIA",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const confeitariaInativa: Produto = { ...confeitariaAtiva, codigoPdv: 701, nome: "TORTA INATIVA", ativoNaProducao: false };
  const revendaAtiva: Produto = {
    ...confeitariaAtiva,
    codigoPdv: 702,
    nome: "REFRIGERANTE",
    categoria: "REFRIGERANTES",
  };

  const resumo = construirResumoParaInsights(
    [confeitariaAtiva, confeitariaInativa, revendaAtiva],
    [],
    [],
    "2026-08-24"
  );
  afirmar(resumo.length === 1 && resumo[0].codigoPdv === 700, "resumo inclui só o produto ativo de categoria de produção");
}

// ---------------------------------------------------------------
// Caso 12: construirResumoParaInsights — produto nunca produzido tem
// diasDesdeUltimaProducao null e taxaPerdaPercentual null (não força 0).
// ---------------------------------------------------------------
{
  const produtoNuncaProduzido: Produto = {
    codigoPdv: 703,
    nome: "PÃO NOVO",
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const resumo = construirResumoParaInsights([produtoNuncaProduzido], [], [], "2026-08-24");
  afirmar(resumo[0].diasDesdeUltimaProducao === null, "produto nunca produzido: diasDesdeUltimaProducao é null");
  afirmar(resumo[0].taxaPerdaPercentual === null, "produto nunca produzido: taxaPerdaPercentual é null (não 0)");
}

// ---------------------------------------------------------------
// Caso 13: construirResumoParaInsights — separa perda por "sobra_nao_vendida"
// do total perdido, e a última produção é a verdadeira última data (mesmo
// fora da janela de 60 dias usada para os totais agregados).
// ---------------------------------------------------------------
{
  const confeitaria: Produto = {
    codigoPdv: 704,
    nome: "BRIGADEIRO GOURMET",
    categoria: "CONFEITARIA",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const dataReferencia = "2026-08-24";
  const planoAntigo: PlanoDeProducaoDiario = {
    id: "plano-antigo",
    data: "2026-05-01", // bem mais de 60 dias atrás — fora da janela de totais, mas é a última produção real
    diaDaSemana: "sexta",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-05-01T18:00:00Z",
    sessoes: [{ id: "s1", categoria: "CONFEITARIA", itens: [{ codigoPdv: 704, quantidadeUnidades: 50 }] }],
  };
  const perdasBrigadeiro = [
    {
      id: "p1",
      codigoPdv: 704,
      planoDeProducaoId: "plano-antigo",
      data: "2026-05-01",
      diaDaSemana: "sexta" as const,
      quantidadeQuilos: 1,
      pesoUnitarioGramasInformado: 20,
      quantidadeUnidadesEstimada: 10,
      motivo: "sobra_nao_vendida" as const,
      registradoPor: "teste",
      registradoEm: "2026-05-01T20:00:00Z",
    },
    {
      id: "p2",
      codigoPdv: 704,
      planoDeProducaoId: "plano-antigo",
      data: "2026-05-01",
      diaDaSemana: "sexta" as const,
      quantidadeQuilos: 0.4,
      pesoUnitarioGramasInformado: 20,
      quantidadeUnidadesEstimada: 5,
      motivo: "queimado" as const,
      registradoPor: "teste",
      registradoEm: "2026-05-01T20:05:00Z",
    },
  ];

  const resumo = construirResumoParaInsights([confeitaria], [planoAntigo], perdasBrigadeiro, dataReferencia);
  afirmar(
    resumo[0].diasDesdeUltimaProducao === diasEntreDatas("2026-05-01", dataReferencia),
    `última produção reflete a data real mesmo fora da janela de 60 dias (obtido: ${resumo[0].diasDesdeUltimaProducao})`
  );
  afirmar(resumo[0].totalProduzidoUnidades === 0, "produção de mais de 60 dias atrás não entra no total da janela");
  afirmar(resumo[0].totalPerdidoUnidades === 0, "perda de mais de 60 dias atrás não entra no total da janela");
}

// ---------------------------------------------------------------
// Caso 14: construirResumoParaInsights — dentro da janela, separa
// corretamente sobra de outros motivos e calcula a taxa de perda.
// ---------------------------------------------------------------
{
  const confeitaria: Produto = {
    codigoPdv: 705,
    nome: "PALHA ITALIANA",
    categoria: "CONFEITARIA",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const dataReferencia = "2026-08-24";
  const planoRecente: PlanoDeProducaoDiario = {
    id: "plano-recente",
    data: "2026-08-23",
    diaDaSemana: "domingo",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-08-23T18:00:00Z",
    sessoes: [{ id: "s1", categoria: "CONFEITARIA", itens: [{ codigoPdv: 705, quantidadeUnidades: 100 }] }],
  };
  const perdasPalha = [
    {
      id: "p3",
      codigoPdv: 705,
      planoDeProducaoId: "plano-recente",
      data: "2026-08-23",
      diaDaSemana: "domingo" as const,
      quantidadeQuilos: 1,
      pesoUnitarioGramasInformado: 40,
      quantidadeUnidadesEstimada: 25,
      motivo: "sobra_nao_vendida" as const,
      registradoPor: "teste",
      registradoEm: "2026-08-23T20:00:00Z",
    },
    {
      id: "p4",
      codigoPdv: 705,
      planoDeProducaoId: "plano-recente",
      data: "2026-08-23",
      diaDaSemana: "domingo" as const,
      quantidadeQuilos: 0.2,
      pesoUnitarioGramasInformado: 40,
      quantidadeUnidadesEstimada: 5,
      motivo: "quebra_transporte" as const,
      registradoPor: "teste",
      registradoEm: "2026-08-23T20:05:00Z",
    },
  ];

  const resumo = construirResumoParaInsights([confeitaria], [planoRecente], perdasPalha, dataReferencia);
  afirmar(resumo[0].totalProduzidoUnidades === 100, "produção dentro da janela contabilizada corretamente");
  afirmar(resumo[0].totalPerdidoUnidades === 30, `perda total soma todos os motivos (obtido: ${resumo[0].totalPerdidoUnidades})`);
  afirmar(resumo[0].perdaPorSobraUnidades === 25, `perda por sobra isola só o motivo sobra_nao_vendida (obtido: ${resumo[0].perdaPorSobraUnidades})`);
  afirmar(resumo[0].taxaPerdaPercentual === 30, `taxa de perda = 30/100 = 30% (obtido: ${resumo[0].taxaPerdaPercentual})`);
}

// ---------------------------------------------------------------
// Caso 15: agruparBlocosEmImagens — cronograma pequeno cabe numa imagem só
// (comportamento comum, não deve mudar pro dia a dia normal da padaria).
// ---------------------------------------------------------------
{
  const produtosFita: Produto[] = Array.from({ length: 5 }, (_, i) => ({
    codigoPdv: 900 + i,
    nome: `PRODUTO ${i}`,
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  }));
  const sessoesPequenas = [
    {
      rotuloSessao: "Pães e Roscas",
      itens: produtosFita.map((p) => ({ codigoPdv: p.codigoPdv, quantidadeUnidades: 10 })),
    },
  ];
  const blocos = computarBlocos(sessoesPequenas, produtosFita, true);
  const grupos = agruparBlocosEmImagens(blocos);
  afirmar(grupos.length === 1, `cronograma pequeno gera 1 imagem só (obtido: ${grupos.length})`);
}

// ---------------------------------------------------------------
// Caso 16: agruparBlocosEmImagens — o bug real que motivou este teste: um
// cronograma grande (muitas sessões/itens) gerava um canvas único gigante e
// canvas.toBlob() falhava em silêncio em navegadores móveis, aparecendo
// pro operador como "Não foi possível gerar a imagem" mesmo tentando de
// novo. Agora precisa dividir em mais de uma imagem, cada uma dentro do
// limite seguro, sem duplicar nem cortar nenhuma sessão ao meio.
// ---------------------------------------------------------------
{
  const produtosGrandes: Produto[] = Array.from({ length: 30 }, (_, i) => ({
    codigoPdv: 1000 + i,
    nome: `PRODUTO GRANDE ${i}`,
    categoria: "CONFEITARIA",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  }));
  // 6 sessões de 20 itens cada — acima do que a montagem gera hoje (5
  // acima da média, mas foi exatamente esse tipo de cronograma grande que
  // estourou o limite de canvas em produção (ago/2026).
  const sessoesGrandes = Array.from({ length: 6 }, (_, s) => ({
    rotuloSessao: `Sessão ${s}`,
    itens: produtosGrandes.slice(0, 20).map((p) => ({ codigoPdv: p.codigoPdv, quantidadeUnidades: 5 })),
  }));

  const blocos = computarBlocos(sessoesGrandes, produtosGrandes, true);
  const grupos = agruparBlocosEmImagens(blocos);

  afirmar(grupos.length > 1, `cronograma grande é dividido em mais de 1 imagem (obtido: ${grupos.length})`);

  const totalSessoesNosGrupos = grupos.reduce((soma, g) => soma + g.length, 0);
  afirmar(
    totalSessoesNosGrupos === sessoesGrandes.length,
    `nenhuma sessão duplicada nem perdida ao dividir (esperado ${sessoesGrandes.length}, obtido ${totalSessoesNosGrupos})`
  );

  const todasDentroDoLimite = grupos.every((grupo) => {
    const alturaBlocos = grupo.reduce((soma, b) => soma + b.altura, 0);
    const alturaCortes = Math.max(grupo.length - 1, 0) * ALTURA_FAIXA_CORTE;
    const alturaTotal = alturaBlocos + alturaCortes + ALTURA_RODAPE_FINAL;
    return alturaTotal <= ALTURA_MAXIMA_SEGURA_PX || grupo.length === 1;
  });
  afirmar(
    todasDentroDoLimite,
    "cada imagem gerada fica dentro do limite seguro (ou é uma sessão sozinha que já excede sozinha)"
  );
}

// ---------------------------------------------------------------
// Caso 17: agruparBlocosEmImagens — uma única sessão gigantesca que sozinha
// já ultrapassa o limite não trava nem é descartada: vira uma imagem própria
// (não dá pra dividir uma sessão ao meio sem quebrar a lista de produção).
// ---------------------------------------------------------------
{
  const produtoUnico: Produto = {
    codigoPdv: 2000,
    nome: "PRODUTO ÚNICO",
    categoria: "BOLOS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const sessaoGigante = [
    {
      rotuloSessao: "Sessão gigante",
      itens: Array.from({ length: 200 }, () => ({ codigoPdv: produtoUnico.codigoPdv, quantidadeUnidades: 1 })),
    },
  ];
  const blocos = computarBlocos(sessaoGigante, [produtoUnico], true);
  afirmar(
    blocos[0].altura > ALTURA_MAXIMA_SEGURA_PX,
    "sessão de teste realmente ultrapassa o limite sozinha (pré-condição do teste)"
  );

  const grupos = agruparBlocosEmImagens(blocos);
  afirmar(
    grupos.length === 1 && grupos[0].length === 1,
    "sessão gigante sozinha vira 1 imagem própria, sem travar nem duplicar"
  );
}

// ---------------------------------------------------------------
// Caso 18: a assinatura ("Montado por") passou a sair no rodapé de CADA
// sessão (ago/2026), porque a fita é cortada e cada pedaço vai para o
// quadro de um setor — antes só o último pedaço saía assinado.
// Isso torna cada bloco mais alto, e é essa altura que decide se a fita
// cabe em uma imagem só. Se computarBlocos ignorasse a assinatura, a
// conta ficaria menor que o desenho real e voltaria o bug do canvas
// grande demais — por isso o teste cobre a diferença explicitamente.
// ---------------------------------------------------------------
{
  const produto: Produto = {
    codigoPdv: 9100,
    nome: "PAO TESTE ASSINATURA",
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
  };
  const sessoes = [
    {
      rotuloSessao: "Pães e Roscas",
      itens: [{ codigoPdv: produto.codigoPdv, quantidadeUnidades: 10 }],
    },
  ];

  const semAssinatura = computarBlocos(sessoes, [produto], false);
  const comAssinatura = computarBlocos(sessoes, [produto], true);

  afirmar(
    comAssinatura[0].altura > semAssinatura[0].altura,
    `bloco assinado é mais alto que o não assinado (${semAssinatura[0].altura} -> ${comAssinatura[0].altura})`
  );

  // Com N sessões, a assinatura é somada N vezes — não uma vez só no fim.
  const cincoSessoes = Array.from({ length: 5 }, (_, i) => ({
    rotuloSessao: `Sessão ${i}`,
    itens: [{ codigoPdv: produto.codigoPdv, quantidadeUnidades: 10 }],
  }));
  const cincoSem = computarBlocos(cincoSessoes, [produto], false);
  const cincoCom = computarBlocos(cincoSessoes, [produto], true);
  const totalSem = cincoSem.reduce((soma, b) => soma + b.altura, 0);
  const totalCom = cincoCom.reduce((soma, b) => soma + b.altura, 0);
  const diferencaPorBloco = comAssinatura[0].altura - semAssinatura[0].altura;
  afirmar(
    totalCom - totalSem === diferencaPorBloco * 5,
    `assinatura entra em cada uma das 5 sessões (esperado +${diferencaPorBloco * 5}, obtido +${totalCom - totalSem})`
  );

  // O rodapé final virou constante (não assina mais) — a divisão em
  // imagens não depende mais de "tem assinatura ou não" naquele ponto.
  afirmar(
    typeof ALTURA_RODAPE_FINAL === "number" && ALTURA_RODAPE_FINAL > 0,
    "rodapé final tem altura fixa, independente de assinatura"
  );
}

// ---------------------------------------------------------------
// Caso 19: produção realizada × planejada (ago/2026). Na rotina da padaria
// acontece de um item da lista simplesmente não sair. Antes o app tratava
// plano como realidade, o que contaminava justamente a métrica que ele
// existe para medir: taxa de perda = perdido ÷ produzido.
// ---------------------------------------------------------------
{
  const planoBase: PlanoDeProducaoDiario = {
    id: "plano-real",
    data: "2026-08-20",
    diaDaSemana: "quinta",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-08-19T18:00:00Z",
    sessoes: [
      {
        id: "s1",
        categoria: "PÃES E ROSCAS",
        itens: [
          { codigoPdv: 112, quantidadeUnidades: 200 },
          { codigoPdv: 999, quantidadeUnidades: 50 },
        ],
      },
    ],
  };

  // Sem confirmação: tudo conta como produzido (comportamento anterior preservado).
  afirmar(!producaoFoiConfirmada(planoBase), "plano sem confirmação é reconhecido como não confirmado");
  afirmar(unidadesProduzidas(planoBase) === 250, `sem confirmação, conta o plano inteiro (obtido: ${unidadesProduzidas(planoBase)})`);

  // Com confirmação dizendo que o 999 não saiu.
  const planoConfirmado: PlanoDeProducaoDiario = {
    ...planoBase,
    producaoRealizada: {
      confirmadoPor: "teste",
      confirmadoEm: "2026-08-20T20:00:00Z",
      codigosNaoProduzidos: [999],
    },
  };
  afirmar(producaoFoiConfirmada(planoConfirmado), "plano com confirmação é reconhecido");
  afirmar(naoFoiProduzido(planoConfirmado, 999), "item marcado como não produzido é reconhecido");
  afirmar(!naoFoiProduzido(planoConfirmado, 112), "item que saiu continua contando como produzido");
  afirmar(
    unidadesProduzidas(planoConfirmado) === 200,
    `item não produzido sai da conta (esperado 200, obtido: ${unidadesProduzidas(planoConfirmado)})`
  );
  afirmar(
    itensPlanejados(planoConfirmado).length === 2,
    "o PLANO não é reescrito — os 2 itens planejados continuam registrados"
  );

  // O efeito que motivou tudo isso: a taxa de perda muda de denominador.
  const perdaDoDia: RegistroPerda[] = [
    {
      id: "perda-real",
      codigoPdv: 112,
      planoDeProducaoId: "plano-real",
      data: "2026-08-20",
      diaDaSemana: "quinta",
      quantidadeQuilos: 1,
      pesoUnitarioGramasInformado: 50,
      quantidadeUnidadesEstimada: 20,
      motivo: "queimado",
      registradoPor: "teste",
      registradoEm: "2026-08-20T20:00:00Z",
    },
  ];
  const taxaSemConfirmar = calcularTaxaPerdaPorProduto([paoFrances], [planoBase], perdaDoDia);
  const taxaConfirmada = calcularTaxaPerdaPorProduto([paoFrances], [planoConfirmado], perdaDoDia);
  afirmar(
    taxaSemConfirmar[0].perdaPercentual === 10 && taxaConfirmada[0].perdaPercentual === 10,
    "produto que SAIU mantém a taxa (200 produzidas, 20 perdidas = 10%)"
  );

  // Caso extremo: nada saiu — a produção do dia é 0, não a lista inteira.
  const nadaSaiu: PlanoDeProducaoDiario = {
    ...planoBase,
    producaoRealizada: {
      confirmadoPor: "teste",
      confirmadoEm: "2026-08-20T20:00:00Z",
      codigosNaoProduzidos: [112, 999],
    },
  };
  afirmar(unidadesProduzidas(nadaSaiu) === 0, "dia em que nada saiu conta produção 0");
  const volumeNada = calcularVolumeProducaoPorDiaDaSemana([nadaSaiu]);
  afirmar(
    volumeNada[0].totalPlanejado === 0,
    `volume do dia reflete o que saiu, não o que foi planejado (obtido: ${volumeNada[0].totalPlanejado})`
  );

  // Não se perde o que não foi produzido: o item cortado sai dos candidatos.
  const produto999: Produto = { ...paoFrances, codigoPdv: 999, nome: "PAO TESTE 999", prazoValidadeDias: 5 };
  const candidatos = calcularCandidatosPerda("2026-08-20", [paoFrances, produto999], [planoConfirmado]);
  afirmar(
    candidatos.some((c) => c.produto.codigoPdv === 112),
    "produto que saiu do forno continua podendo receber perda"
  );
  afirmar(
    !candidatos.some((c) => c.produto.codigoPdv === 999),
    "produto que NÃO saiu do forno não pode receber perda (não existe fornada dele)"
  );
}

// ---------------------------------------------------------------
// Caso 20: tradução de falhas de gravação (ago/2026). Nasceu de um
// defeito real em produção: logado como filial, editar um produto ficava
// preso em "Salvando..." para sempre, sem mensagem nenhuma. Eram duas
// falhas somadas — a tela não tinha `finally`, e nada traduzia o erro do
// Firestore para uma frase que o operador entendesse.
// ---------------------------------------------------------------
{
  const permissao = mensagemDeFalhaAoSalvar({ code: "firestore/permission-denied" });
  afirmar(
    /permiss/i.test(permissao) && /matriz/i.test(permissao),
    "permissão negada explica que o catálogo é mantido pela matriz"
  );
  afirmar(
    !permissao.includes("permission-denied") && !permissao.includes("firestore/"),
    "mensagem não vaza o código técnico para a tela"
  );

  const semRede = mensagemDeFalhaAoSalvar({ code: "unavailable" });
  afirmar(
    /guardado no aparelho|internet voltar/i.test(semRede),
    "falta de rede avisa que o dado está guardado e vai subir sozinho"
  );
  afirmar(
    ehFalhaTemporariaDeRede({ code: "unavailable" }),
    "falta de rede é classificada como temporária (aviso verde, não vermelho)"
  );
  afirmar(
    ehFalhaTemporariaDeRede({ code: "deadline-exceeded" }),
    "tempo esgotado também conta como temporário"
  );
  afirmar(
    !ehFalhaTemporariaDeRede({ code: "firestore/permission-denied" }),
    "permissão negada NÃO é temporária — refazer não adianta"
  );

  afirmar(
    /sess.o expirou/i.test(mensagemDeFalhaAoSalvar({ code: "unauthenticated" })),
    "sessão expirada manda entrar de novo"
  );

  // Código desconhecido não pode virar tela em branco nem texto técnico.
  const desconhecido = mensagemDeFalhaAoSalvar({ code: "algo-que-nao-mapeamos" });
  afirmar(desconhecido.length > 20, "erro desconhecido ainda produz uma frase útil");
  afirmar(
    !desconhecido.includes("algo-que-nao-mapeamos"),
    "erro desconhecido não vaza o código cru"
  );
  afirmar(
    mensagemDeFalhaAoSalvar(new Error("erro sem code")).length > 20,
    "erro sem código nenhum também é tratado"
  );
  afirmar(mensagemDeFalhaAoSalvar(undefined).length > 20, "erro nulo não quebra a tradução");
}

// ---------------------------------------------------------------
// Caso 21: anulação de lançamento de perda (ago/2026). Pedido do dono do
// negócio: um funcionário pode digitar 1000 onde eram 10, e um erro
// desses sozinho destrói a taxa de perda do mês. A correção é ANULAÇÃO,
// não exclusão — o registro fica no histórico, marcado, e sai de todos
// os cálculos.
// ---------------------------------------------------------------
{
  const planoDoDia: PlanoDeProducaoDiario = {
    id: "plano-anul",
    data: "2026-08-20",
    diaDaSemana: "quinta",
    status: "confirmado",
    criadoPor: "teste",
    criadoEm: "2026-08-19T18:00:00Z",
    sessoes: [{ id: "s1", categoria: "PÃES E ROSCAS", itens: [{ codigoPdv: 112, quantidadeUnidades: 200 }] }],
  };
  const base = {
    codigoPdv: 112,
    planoDeProducaoId: "plano-anul",
    data: "2026-08-20",
    diaDaSemana: "quinta" as const,
    pesoUnitarioGramasInformado: 50,
    motivo: "sobra_nao_vendida" as const,
    registradoPor: "teste",
    registradoEm: "2026-08-20T20:00:00Z",
  };
  const perdaCerta: RegistroPerda = {
    ...base, id: "ok", quantidadeQuilos: 1, quantidadeUnidadesEstimada: 20,
  };
  // O erro de digitação clássico: 100kg no lugar de 1kg.
  const perdaErrada: RegistroPerda = {
    ...base, id: "erro", quantidadeQuilos: 100, quantidadeUnidadesEstimada: 2000,
  };

  const comErro = calcularTaxaPerdaPorProduto([paoFrances], [planoDoDia], [perdaCerta, perdaErrada]);
  afirmar(
    comErro[0].perdaPercentual > 100,
    `sem anular, o erro de digitação estoura a taxa (obtido: ${comErro[0].perdaPercentual}%)`
  );

  const anulada: RegistroPerda = {
    ...perdaErrada,
    cancelada: true,
    canceladaPor: "Daniel",
    canceladaEm: "2026-08-20T21:00:00Z",
    motivoCancelamento: "quantidade digitada errada",
  };
  const corrigido = calcularTaxaPerdaPorProduto([paoFrances], [planoDoDia], [perdaCerta, anulada]);
  afirmar(
    corrigido[0].perdaPercentual === 10,
    `anulando, a taxa volta ao valor real (esperado 10%, obtido: ${corrigido[0].perdaPercentual}%)`
  );
  afirmar(
    corrigido[0].totalPerdido === 20,
    `unidades perdidas ignoram o registro anulado (obtido: ${corrigido[0].totalPerdido})`
  );
  afirmar(
    corrigido[0].totalPerdidoQuilos === 1,
    `os quilos também ignoram o anulado (obtido: ${corrigido[0].totalPerdidoQuilos})`
  );

  afirmar(perdaEstaValida(perdaCerta), "lançamento normal é válido");
  afirmar(!perdaEstaValida(anulada), "lançamento anulado não é válido");
  // Registro antigo, anterior ao campo, nunca pode ser lido como anulado.
  afirmar(perdaEstaValida({ ...perdaCerta, cancelada: undefined }), "registro sem o campo continua valendo");

  // Picos por dia da semana também precisam ignorar o anulado, senão a
  // análise de "qual dia mais desperdiça" apontaria o dia errado.
  const picos = identificarPicosDePerda([paoFrances], [planoDoDia], [perdaCerta, anulada], false);
  afirmar(
    picos[0].perdaPercentualMedia === 10,
    `picos de perda ignoram o anulado (obtido: ${picos[0].perdaPercentualMedia}%)`
  );
}

// ---------------------------------------------------------------
// Caso 22: consolidação matriz + filiais (Parte B, ago/2026). É a conta
// que decide o que o padeiro produz e o que vai para cada loja — errar
// aqui é produzir a menos (loja abre sem mercadoria) ou a mais (vira
// perda). Por isso está coberta caso a caso.
// ---------------------------------------------------------------
{
  const MATRIZ = "MATRIZ";
  const ARTHUR = "FILIAL_ARTHUR_BERNARDES";
  const BENJAMIN = "FILIAL_BENJAMIN_CONSTANT";

  const pedidoArthur: PedidoFilial = {
    id: "2026-08-27_" + ARTHUR,
    lojaId: ARTHUR,
    data: "2026-08-27",
    itens: [{ codigoPdv: 112, quantidadeUnidades: 15 }, { codigoPdv: 200, quantidadeUnidades: 5 }],
    status: "enviado",
    criadoPor: "filial",
    criadoEm: "2026-08-26T20:00:00Z",
    enviadoEm: "2026-08-26T20:05:00Z",
  };
  const pedidoBenjaminRascunho: PedidoFilial = {
    ...pedidoArthur,
    id: "2026-08-27_" + BENJAMIN,
    lojaId: BENJAMIN,
    itens: [{ codigoPdv: 112, quantidadeUnidades: 99 }],
    status: "rascunho",
    enviadoEm: undefined,
  };

  const daMatriz = [{ codigoPdv: 112, quantidadeUnidades: 40 }];

  const consolidado = consolidarProducao(daMatriz, [pedidoArthur, pedidoBenjaminRascunho], MATRIZ);
  const pao = consolidado.find((c) => c.codigoPdv === 112)!;

  afirmar(
    pao.totalUnidades === 55,
    `total soma matriz (40) + filial que enviou (15) = 55, obtido: ${pao.totalUnidades}`
  );
  afirmar(
    !pao.destinos.some((d) => d.lojaId === BENJAMIN),
    "pedido em RASCUNHO não entra na produção — a filial ainda está mexendo nele"
  );
  afirmar(quantidadeDaLoja(pao, MATRIZ) === 40, "a matriz leva o que ela mesma programou");
  afirmar(quantidadeDaLoja(pao, ARTHUR) === 15, "Arthur Bernardes leva o que pediu");
  afirmar(quantidadeDaLoja(pao, BENJAMIN) === 0, "loja sem pedido enviado não leva nada");

  // Produto que só a filial pediu tem que entrar na produção mesmo a
  // matriz não tendo programado nada dele.
  const soDaFilial = consolidado.find((c) => c.codigoPdv === 200);
  afirmar(
    soDaFilial !== undefined && soDaFilial.totalUnidades === 5,
    "produto pedido só pela filial entra na produção da matriz"
  );
  afirmar(
    soDaFilial !== undefined && quantidadeDaLoja(soDaFilial, MATRIZ) === 0,
    "esse produto não sobra para a matriz — vai inteiro para a filial"
  );

  // O romaneio de separação de cada loja.
  const romaneioArthur = itensParaLoja(consolidado, ARTHUR);
  afirmar(romaneioArthur.length === 2, `romaneio de Arthur tem 2 itens (obtido: ${romaneioArthur.length})`);
  afirmar(
    romaneioArthur.every((i) => i.quantidadeUnidades > 0),
    "romaneio nunca traz linha com quantidade zero"
  );
  const romaneioBenjamin = itensParaLoja(consolidado, BENJAMIN);
  afirmar(romaneioBenjamin.length === 0, "loja sem pedido enviado não gera romaneio");

  // A soma dos romaneios + o que fica na matriz TEM que fechar com o
  // total produzido — se não fechar, sobra ou falta mercadoria no
  // despacho, que é o erro mais caro dessa operação.
  const totalProduzido = consolidado.reduce((soma, c) => soma + c.totalUnidades, 0);
  const totalDistribuido = [MATRIZ, ARTHUR, BENJAMIN]
    .flatMap((loja) => itensParaLoja(consolidado, loja))
    .reduce((soma, i) => soma + i.quantidadeUnidades, 0);
  afirmar(
    totalProduzido === totalDistribuido,
    `o que se produz fecha com o que se distribui (${totalProduzido} = ${totalDistribuido})`
  );

  // Sem pedido nenhum, o comportamento é o de antes das filiais.
  const soMatriz = consolidarProducao(daMatriz, [], MATRIZ);
  afirmar(
    soMatriz.length === 1 && soMatriz[0].totalUnidades === 40,
    "sem pedidos, o total é exatamente o que a matriz programou"
  );

  // O id do pedido é derivado da data e da loja: enviar duas vezes
  // atualiza o mesmo documento em vez de somar dois pedidos.
  afirmar(
    idDoPedido("2026-08-27", ARTHUR) === idDoPedido("2026-08-27", ARTHUR),
    "id do pedido é estável para a mesma data e loja"
  );
  afirmar(
    idDoPedido("2026-08-27", ARTHUR) !== idDoPedido("2026-08-28", ARTHUR),
    "dias diferentes geram pedidos diferentes"
  );
  afirmar(totalDoPedido(pedidoArthur) === 20, `total do pedido soma os itens (obtido: ${totalDoPedido(pedidoArthur)})`);
  afirmar(totalDoPedido(undefined) === 0, "pedido inexistente conta como zero");
}

// ---------------------------------------------------------------
// Caso 23: escopo de perdas por loja (ago/2026). A filial vê só o que
// lançou nela; a matriz vê tudo. Registro anterior às filiais não tem
// lojaId e precisa continuar contando como matriz — senão a migração
// faria o histórico antigo sumir da tela de quem o criou.
// ---------------------------------------------------------------
{
  const MATRIZ = "MATRIZ";
  const ARTHUR = "FILIAL_ARTHUR_BERNARDES";
  const base = {
    codigoPdv: 112,
    planoDeProducaoId: "p",
    data: "2026-08-27",
    diaDaSemana: "quinta" as const,
    quantidadeQuilos: 1,
    pesoUnitarioGramasInformado: 50,
    quantidadeUnidadesEstimada: 20,
    motivo: "sobra_nao_vendida" as const,
    registradoPor: "teste",
    registradoEm: "2026-08-27T20:00:00Z",
  };
  const todas: RegistroPerda[] = [
    { ...base, id: "matriz", lojaId: MATRIZ },
    { ...base, id: "arthur", lojaId: ARTHUR },
    { ...base, id: "antiga" }, // anterior às filiais, sem lojaId
  ];

  // A regra que a tela aplica: matriz vê tudo; filial filtra pela própria loja.
  const visiveisPara = (loja: string, ehMatriz: boolean) =>
    todas.filter((p) => ehMatriz || (p.lojaId ?? MATRIZ) === loja);

  afirmar(visiveisPara(MATRIZ, true).length === 3, "matriz enxerga as perdas das três origens");
  const daFilial = visiveisPara(ARTHUR, false);
  afirmar(daFilial.length === 1, `filial enxerga só a própria perda (obtido: ${daFilial.length})`);
  afirmar(daFilial[0].id === "arthur", "e é exatamente a que ela lançou");
  afirmar(
    visiveisPara(MATRIZ, false).some((p) => p.id === "antiga"),
    "registro sem lojaId (anterior às filiais) continua aparecendo como da matriz"
  );

  // O total de perda do dia continua somando TODAS as lojas — a taxa de
  // perda do negócio é do negócio, não de uma unidade.
  const totalGeral = todas.filter(perdaEstaValida).reduce((s, p) => s + p.quantidadeUnidadesEstimada, 0);
  afirmar(totalGeral === 60, `análise consolidada soma as três lojas (obtido: ${totalGeral})`);
}

// ---------------------------------------------------------------
// Caso 24: fila de impressão no caixa (ago/2026). A imagem viaja em
// base64 dentro de um documento do Firestore, que tem limite de 1 MiB.
// Recusar cedo, com mensagem clara, é muito melhor que o Firestore
// recusar a gravação com erro genérico depois que o operador já achou
// que mandou imprimir.
// ---------------------------------------------------------------
{
  const pequeno = "data:image/png;base64," + "A".repeat(1000);
  afirmar(
    base64DoDataUrl(pequeno, "teste.png").length === 1000,
    "extrai o base64 puro, sem o prefixo data:"
  );
  afirmar(
    !base64DoDataUrl(pequeno, "teste.png").startsWith("data:"),
    "o prefixo não vaza para o documento gravado"
  );

  const gigante = "data:image/png;base64," + "A".repeat(LIMITE_BASE64_BYTES + 1);
  try {
    base64DoDataUrl(gigante, "fita-gigante.png");
    afirmar(false, "deveria ter recusado a imagem acima do limite");
  } catch (e) {
    afirmar(e instanceof ErroImpressao, "imagem grande demais lança ErroImpressao");
    afirmar(
      (e as Error).message.includes("fita-gigante.png"),
      "a mensagem diz QUAL imagem falhou"
    );
    afirmar(
      /WhatsApp/i.test((e as Error).message),
      "a mensagem oferece a saída que continua funcionando (WhatsApp)"
    );
  }

  try {
    base64DoDataUrl("isto-nao-e-um-data-url", "x.png");
    afirmar(false, "deveria ter recusado entrada malformada");
  } catch (e) {
    afirmar(e instanceof ErroImpressao, "data URL malformado também é erro de domínio");
  }

  // O limite tem que ficar com folga real abaixo de 1 MiB do Firestore:
  // além da imagem, o documento carrega nome, loja, datas e status.
  afirmar(
    LIMITE_BASE64_BYTES < 1_048_576 * 0.75,
    `limite de base64 deixa folga para os demais campos (${LIMITE_BASE64_BYTES} bytes)`
  );
}

// ---------------------------------------------------------------
// Caso 25: fornadas recorrentes e reposição (ago/2026). Correção de
// modelo do dono do negócio: pão francês e biscoito de queijo saem VÁRIAS
// vezes ao dia. Produto não é "produzido ou não" — cada fornada é um
// evento com hora própria, e é isso que permite a filial pedir reposição
// enquanto ainda dá tempo de entregar hoje.
// ---------------------------------------------------------------
{
  const HOJE = "2026-08-27";
  const f = (codigo: number, hora: string): FornadaPronta => ({
    id: idDaFornada(HOJE, codigo, `${HOJE}T${hora}:00.000Z`),
    data: HOJE,
    codigoPdv: codigo,
    marcadaPor: "Daniel",
    marcadaEm: `${HOJE}T${hora}:00.000Z`,
  });

  // Pão francês saindo três vezes ao longo do dia.
  const fornadas = [f(112, "09:00"), f(112, "12:00"), f(112, "15:00"), f(999, "10:00")];

  const doPao = fornadasDoProduto(fornadas, HOJE, 112);
  afirmar(doPao.length === 3, `mesmo produto acumula fornadas no dia (obtido: ${doPao.length})`);
  afirmar(
    doPao[0].marcadaEm.includes("15:00"),
    "a mais RECENTE vem primeiro — é a que ainda dá para pedir hoje"
  );
  afirmar(
    fornadasDoProduto(fornadas, HOJE, 555).length === 0,
    "produto que não saiu não tem fornada"
  );
  afirmar(
    fornadasDoProduto(fornadas, "2026-08-26", 112).length === 0,
    "fornada de outro dia não aparece no dia consultado"
  );

  // Ids precisam ser distintos, senão a segunda fornada sobrescreveria a
  // primeira e o histórico do dia se perderia.
  const ids = new Set(fornadas.map((x) => x.id));
  afirmar(ids.size === 4, `cada marcação gera um id próprio (obtido: ${ids.size})`);

  // Base do fechamento pré-marcado.
  const comFornada = codigosComFornadaNoDia(fornadas, HOJE);
  afirmar(comFornada.has(112) && comFornada.has(999), "fechamento reconhece o que saiu");
  afirmar(!comFornada.has(555), "e reconhece o que NÃO saiu");

  // --- Reposição não pode entrar no planejamento de amanhã ---
  const diario: PedidoFilial = {
    id: "d", lojaId: "FILIAL_ARTHUR_BERNARDES", data: HOJE,
    itens: [{ codigoPdv: 112, quantidadeUnidades: 20 }],
    status: "enviado", tipo: "diario", criadoPor: "Ana", criadoEm: "", enviadoEm: "",
  };
  const reposicao: PedidoFilial = {
    ...diario, id: "r", tipo: "reposicao",
    itens: [{ codigoPdv: 112, quantidadeUnidades: 500 }],
  };

  const consolidado = consolidarProducao(
    [{ codigoPdv: 112, quantidadeUnidades: 40 }],
    [diario, reposicao],
    "MATRIZ"
  );
  const pao = consolidado.find((c) => c.codigoPdv === 112)!;
  afirmar(
    pao.totalUnidades === 60,
    `reposição NÃO entra no planejamento: 40 da matriz + 20 do pedido diário = 60 (obtido: ${pao.totalUnidades})`
  );
  afirmar(
    quantidadeDaLoja(pao, "FILIAL_ARTHUR_BERNARDES") === 20,
    "o romaneio da filial também ignora a reposição"
  );

  // Reposição pode acontecer mais de uma vez no mesmo dia — o id leva o
  // instante, senão o segundo pedido apagaria o primeiro.
  const r1 = idDaReposicao(HOJE, "FILIAL_ARTHUR_BERNARDES", "2026-08-27T09:00:00.000Z");
  const r2 = idDaReposicao(HOJE, "FILIAL_ARTHUR_BERNARDES", "2026-08-27T15:00:00.000Z");
  afirmar(r1 !== r2, "duas reposições no mesmo dia geram documentos diferentes");
  afirmar(ehReposicao(reposicao) && !ehReposicao(diario), "os dois tipos são distinguíveis");
  afirmar(
    ehPedidoDiario({ ...diario, tipo: undefined }),
    "pedido anterior ao campo `tipo` continua contando como diário"
  );
}

// ---------------------------------------------------------------
// Caso 17: painel de análises (src/lib/analises.ts)
//
// O painel existe para responder "que dia da semana desperdiça mais?".
// Um erro aqui não trava o app — ele mostra um número plausível e errado,
// e o dono do negócio muda o cronograma com base nele. Por isso os casos
// abaixo cobrem principalmente as decisões silenciosas: o que NÃO entra
// na conta e quando a resposta certa é "não sei" em vez de zero.
// ---------------------------------------------------------------
{
  const HOJE = "2026-08-26"; // quarta-feira

  const biscoito: Produto = {
    codigoPdv: 300,
    nome: "BISCOITO DE QUEIJO",
    categoria: "BISCOITOS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
    pesoMedioUnitarioGramas: 25,
  };

  const catalogo: Produto[] = [paoFrances, biscoito];

  function plano(
    id: string,
    data: string,
    diaDaSemana: PlanoDeProducaoDiario["diaDaSemana"],
    itens: { codigoPdv: number; quantidadeUnidades: number }[],
    status: PlanoDeProducaoDiario["status"] = "confirmado"
  ): PlanoDeProducaoDiario {
    return {
      id,
      data,
      diaDaSemana,
      status,
      criadoPor: "teste",
      criadoEm: `${data}T05:00:00Z`,
      sessoes: [{ id: `${id}-s1`, categoria: "PÃES E ROSCAS", itens }],
    };
  }

  function perda(
    id: string,
    data: string,
    diaDaSemana: PlanoDeProducaoDiario["diaDaSemana"],
    codigoPdv: number,
    unidades: number,
    extra: Partial<RegistroPerda> = {}
  ): RegistroPerda {
    return {
      id,
      codigoPdv,
      planoDeProducaoId: "plano",
      data,
      diaDaSemana,
      quantidadeQuilos: unidades * 0.05,
      pesoUnitarioGramasInformado: 50,
      quantidadeUnidadesEstimada: unidades,
      motivo: "sobra_nao_vendida",
      registradoPor: "teste",
      registradoEm: `${data}T20:00:00Z`,
      lojaId: "MATRIZ",
      ...extra,
    };
  }

  // --- semanaDoMes: bordas do bloco de 7 dias corridos ---
  afirmar(semanaDoMes("2026-08-01") === 1, "dia 1 cai na 1ª semana");
  afirmar(semanaDoMes("2026-08-07") === 1, "dia 7 ainda é 1ª semana (bloco fechado em 7)");
  afirmar(semanaDoMes("2026-08-08") === 2, "dia 8 abre a 2ª semana");
  afirmar(semanaDoMes("2026-08-28") === 4, "dia 28 fecha a 4ª semana");
  afirmar(semanaDoMes("2026-08-29") === 5, "dia 29 abre a 5ª semana");
  afirmar(
    semanaDoMes("2026-08-31") === 5,
    "dia 31 continua na 5ª — o mês nunca gera uma 6ª barra"
  );

  // --- Janela de período: inclui hoje, exclui o dia que caiu fora ---
  {
    const planos = [
      plano("p-hoje", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 100 }]),
      // 7 dias antes de hoje: com janela de 7, este JÁ está fora (0..6).
      plano("p-antigo", "2026-08-19", "quarta", [{ codigoPdv: 112, quantidadeUnidades: 100 }]),
    ];
    const recorte = recortar(catalogo, planos, [], HOJE, { dias: 7 });
    afirmar(
      calcularTotais(recorte).produzido === 100,
      `janela de 7 dias pega hoje e exclui o 7º dia atrás (obtido: ${calcularTotais(recorte).produzido})`
    );

    const recorte30 = recortar(catalogo, planos, [], HOJE, { dias: 30 });
    afirmar(calcularTotais(recorte30).produzido === 200, "janela de 30 dias alcança os dois planos");
  }

  // --- Rascunho e produção não realizada não entram no denominador ---
  {
    const rascunho = plano("p-rascunho", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 999 }], "rascunho");
    const confirmado = plano("p-ok", HOJE, "quarta", [
      { codigoPdv: 112, quantidadeUnidades: 100 },
      { codigoPdv: 300, quantidadeUnidades: 80 },
    ]);
    const comNaoProduzido: PlanoDeProducaoDiario = {
      ...confirmado,
      producaoRealizada: {
        confirmadoPor: "teste",
        confirmadoEm: `${HOJE}T12:00:00Z`,
        codigosNaoProduzidos: [300],
      },
    };

    const soRascunho = recortar(catalogo, [rascunho], [], HOJE, { dias: 30 });
    afirmar(
      calcularTotais(soRascunho).produzido === 0,
      "cronograma em rascunho não conta como produção"
    );

    const comFalha = recortar(catalogo, [comNaoProduzido], [], HOJE, { dias: 30 });
    afirmar(
      calcularTotais(comFalha).produzido === 100,
      `item marcado como não produzido sai do denominador (obtido: ${calcularTotais(comFalha).produzido})`
    );
  }

  // --- taxaPerda é null (e não 0) quando não houve produção ---
  {
    const semProducao = recortar(catalogo, [], [perda("x1", HOJE, "quarta", 112, 10)], HOJE, { dias: 30 });
    const totais = calcularTotais(semProducao);
    afirmar(
      totais.taxaPerda === null,
      "sem produção no recorte, a taxa é null — 0% seria afirmar que não se desperdiça"
    );
    afirmar(totais.perdido === 10, "a perda continua sendo somada mesmo sem denominador");
  }

  // --- Perda anulada nunca entra em conta nenhuma ---
  {
    const planos = [plano("p1", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 100 }])];
    const perdas = [
      perda("boa", HOJE, "quarta", 112, 10),
      perda("erro", HOJE, "quarta", 112, 1000, {
        cancelada: true,
        canceladaPor: "matriz",
        canceladaEm: `${HOJE}T21:00:00Z`,
      }),
    ];
    const recorte = recortar(catalogo, planos, perdas, HOJE, { dias: 30 });
    const totais = calcularTotais(recorte);
    afirmar(
      totais.perdido === 10 && totais.taxaPerda === 10,
      `lançamento anulado fica fora da taxa (obtido: ${totais.perdido} un, ${totais.taxaPerda}%)`
    );
  }

  // --- O filtro de loja recorta OS DOIS LADOS da conta ---
  //
  // ESTE CASO MUDOU DE RESPOSTA em ago/2026, e vale registrar por quê.
  //
  // Antes ele afirmava que o filtro de filial devia preservar a produção
  // INTEIRA da matriz como denominador: 30 un perdidas sobre as 200
  // produzidas davam 15%. A justificativa parecia boa — recortar os planos
  // zeraria o denominador e a taxa apareceria como "—".
  //
  // Só que 15% era mentira. A filial não recebeu 200 unidades: ela recebeu
  // o que PEDIU. Dividir a perda dela pela produção das três lojas dava um
  // número baixo e tranquilizador sobre uma loja que podia estar jogando
  // fora metade do que recebia. O defeito ficou invisível enquanto só a
  // matriz via a tela; liberar Análises para as filiais o tornou urgente.
  //
  // A resposta certa: sem pedido daquela filial no período, ela não
  // recebeu nada, e a taxa é NULA — que é "não sei", não "0%".
  {
    const planos = [plano("p1", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 200 }])];
    const perdas = [
      perda("m", HOJE, "quarta", 112, 10, { lojaId: "MATRIZ" }),
      perda("f", HOJE, "quarta", 112, 30, { lojaId: "FILIAL_ARTHUR_BERNARDES" }),
    ];

    const soFilial = recortar(catalogo, planos, perdas, HOJE, {
      dias: 30,
      lojaId: "FILIAL_ARTHUR_BERNARDES",
    });
    const totais = calcularTotais(soFilial);
    afirmar(
      totais.produzido === 0,
      `sem pedido no periodo, a filial nao recebeu nada (obtido: ${totais.produzido})`
    );
    afirmar(totais.perdido === 30, "a perda da filial continua sendo contada");
    afirmar(
      totais.taxaPerda === null,
      `sem denominador a taxa e nula, e nao um numero inventado (obtido: ${totais.taxaPerda})`
    );

    // A matriz, essa sim, fica com o que planejou para si.
    const soMatriz = calcularTotais(
      recortar(catalogo, planos, perdas, HOJE, { dias: 30, lojaId: "MATRIZ" })
    );
    afirmar(soMatriz.produzido === 200 && soMatriz.taxaPerda === 5, "matriz: 10/200 = 5%");

    const semFiltro = calcularTotais(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    afirmar(semFiltro.perdido === 40, "sem filtro de loja, as perdas das três lojas somam");
    afirmar(semFiltro.produzido === 200, "sem filtro, o denominador e tudo que saiu do forno");
  }

  // --- Perda sem lojaId (registro anterior às filiais) conta como matriz ---
  {
    const planos = [plano("p1", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 100 }])];
    const antiga = perda("antiga", HOJE, "quarta", 112, 10, { lojaId: undefined });
    const comoMatriz = recortar(catalogo, planos, [antiga], HOJE, { dias: 30, lojaId: "MATRIZ" });
    afirmar(
      calcularTotais(comoMatriz).perdido === 10,
      "registro sem loja (antes das filiais) é lido como matriz"
    );
    const naFilial = recortar(catalogo, planos, [antiga], HOJE, {
      dias: 30,
      lojaId: "FILIAL_ARTHUR_BERNARDES",
    });
    afirmar(calcularTotais(naFilial).perdido === 0, "e não aparece no recorte de uma filial");
  }

  // --- Filtro de categoria vale para os dois lados da conta ---
  {
    const planos = [
      plano("p1", HOJE, "quarta", [
        { codigoPdv: 112, quantidadeUnidades: 100 }, // PÃES E ROSCAS
        { codigoPdv: 300, quantidadeUnidades: 100 }, // BISCOITOS
      ]),
    ];
    const perdas = [
      perda("a", HOJE, "quarta", 112, 5),
      perda("b", HOJE, "quarta", 300, 40),
    ];
    const soBiscoito = recortar(catalogo, planos, perdas, HOJE, { dias: 30, categoria: "BISCOITOS" });
    const totais = calcularTotais(soBiscoito);
    afirmar(
      totais.produzido === 100 && totais.perdido === 40,
      `categoria recorta produção E perda (obtido: ${totais.produzido} / ${totais.perdido})`
    );
    afirmar(totais.taxaPerda === 40, "e a taxa fecha com o próprio denominador da categoria");
  }

  // --- Comparação entre dias é por PERCENTUAL, não por volume ---
  // Sábado produz muito mais que segunda; sem a taxa, sábado apareceria
  // sempre como o pior dia só por ser o maior.
  {
    const planos = [
      plano("seg", "2026-08-24", "segunda", [{ codigoPdv: 112, quantidadeUnidades: 100 }]),
      plano("sab", "2026-08-22", "sabado", [{ codigoPdv: 112, quantidadeUnidades: 1000 }]),
    ];
    const perdas = [
      perda("ps", "2026-08-24", "segunda", 112, 20), // 20%
      perda("pb", "2026-08-22", "sabado", 112, 50), // 5%, porém o dobro em volume
    ];
    const barras = perdaPorDiaDaSemana(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    const segunda = barras.find((b) => b.rotulo === "Segunda")!;
    const sabado = barras.find((b) => b.rotulo === "Sábado")!;
    afirmar(
      segunda.valor === 20 && sabado.valor === 5,
      `taxa por dia: segunda 20%, sábado 5% (obtido: ${segunda.valor}% / ${sabado.valor}%)`
    );
    afirmar(
      (segunda.valor ?? 0) > (sabado.valor ?? 0) && segunda.perdido < sabado.perdido,
      "o dia pior em taxa é o menor em volume — é este o padrão que o gráfico precisa mostrar"
    );
    afirmar(barras.length === 7, "os sete dias sempre aparecem, mesmo sem movimento");
    const terca = barras.find((b) => b.rotulo === "Terça")!;
    afirmar(terca.valor === null, "dia sem produção fica null (barra vazia), não 0%");
  }

  // --- Semana do mês: só as semanas com movimento viram barra ---
  {
    const planos = [
      plano("s1", "2026-08-03", "segunda", [{ codigoPdv: 112, quantidadeUnidades: 100 }]),
      plano("s3", "2026-08-17", "segunda", [{ codigoPdv: 112, quantidadeUnidades: 100 }]),
    ];
    const perdas = [perda("x", "2026-08-17", "segunda", 112, 25)];
    const barras = perdaPorSemanaDoMes(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    afirmar(barras.length === 2, `só semanas com movimento viram barra (obtido: ${barras.length})`);
    afirmar(
      barras.find((b) => b.rotulo === "3ª semana")?.valor === 25,
      "3ª semana: 25 de 100 = 25%"
    );
    afirmar(barras.find((b) => b.rotulo === "1ª semana")?.valor === 0, "1ª semana produziu e não perdeu: 0%");
  }

  // --- Top produtos: o mínimo de 20 unidades corta o ruído ---
  {
    const planos = [
      plano("p1", HOJE, "quarta", [
        { codigoPdv: 112, quantidadeUnidades: 100 }, // volume bom
        { codigoPdv: 300, quantidadeUnidades: 3 }, // amostra pequena
      ]),
    ];
    const perdas = [
      perda("a", HOJE, "quarta", 112, 10), // 10%
      perda("b", HOJE, "quarta", 300, 1), // 33% — porém sobre 3 unidades
    ];
    const top = topProdutosPorPerda(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    afirmar(
      top.length === 1 && top[0].rotulo === "PÃO FRANCÊS",
      `item com menos de 20 un produzidas não entra no ranking (obtido: ${top.map((t) => t.rotulo).join(", ")})`
    );

    // Com produção suficiente, o mesmo item entra e ordena por taxa.
    const planosMaiores = [
      plano("p2", HOJE, "quarta", [
        { codigoPdv: 112, quantidadeUnidades: 100 },
        { codigoPdv: 300, quantidadeUnidades: 50 },
      ]),
    ];
    const perdasMaiores = [
      perda("a", HOJE, "quarta", 112, 10), // 10%
      perda("b", HOJE, "quarta", 300, 15), // 30%
    ];
    const ranking = topProdutosPorPerda(recortar(catalogo, planosMaiores, perdasMaiores, HOJE, { dias: 30 }));
    afirmar(
      ranking.length === 2 && ranking[0].rotulo === "BISCOITO DE QUEIJO",
      "ranking ordena por taxa, do pior para o melhor"
    );
    afirmar(
      topProdutosPorPerda(recortar(catalogo, planosMaiores, perdasMaiores, HOJE, { dias: 30 }), 1).length === 1,
      "o limite de quantidade do ranking é respeitado"
    );
  }

  // --- Perda de produto sem produção registrada não vira barra de 100% ---
  {
    const planos = [plano("p1", HOJE, "quarta", [{ codigoPdv: 112, quantidadeUnidades: 100 }])];
    const perdas = [perda("órfã", HOJE, "quarta", 300, 40)]; // biscoito não foi produzido
    const top = topProdutosPorPerda(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    afirmar(
      top.every((b) => b.rotulo !== "BISCOITO DE QUEIJO"),
      "perda sem produção no recorte não entra no ranking (evitaria uma barra de taxa infinita)"
    );
  }
}

// ---------------------------------------------------------------
// Caso 18: resposta da matriz à reposição (ago/2026)
//
// A filial pedia e ficava no escuro. O que se protege aqui é a regra que
// dá sentido ao recurso: cancelar SEM MOTIVO não pode existir, porque o
// motivo é a única coisa que diz à loja o que fazer em seguida.
// ---------------------------------------------------------------
{
  const base: PedidoFilial = {
    id: "rep-1",
    lojaId: "FILIAL_ARTHUR_BERNARDES",
    data: "2026-08-26",
    itens: [{ codigoPdv: 112, quantidadeUnidades: 30 }],
    status: "enviado",
    tipo: "reposicao",
    criadoPor: "Ana",
    criadoEm: "2026-08-26T09:00:00.000Z",
    enviadoEm: "2026-08-26T09:00:00.000Z",
  };

  afirmar(desfechoDaReposicao(base) === "pendente", "reposição sem resposta conta como pendente");
  afirmar(reposicaoEstaPendente(base), "e aparece na fila da matriz");

  const confirmada = decidirReposicao(base, "confirmado", "Matriz");
  afirmar(desfechoDaReposicao(confirmada) === "confirmado", "confirmar registra o desfecho");
  afirmar(
    confirmada.atendimento?.decididoPor === "Matriz" && Boolean(confirmada.atendimento?.decididoEm),
    "e registra quem decidiu e quando"
  );
  afirmar(
    confirmada.atendimento?.motivo === undefined,
    "confirmação não carrega motivo — motivo é coisa de recusa"
  );
  afirmar(!reposicaoEstaPendente(confirmada), "decidida sai da fila de pendentes");
  afirmar(
    confirmada.itens[0].quantidadeUnidades === 30 && base.atendimento === undefined,
    "a decisão não altera a quantidade pedida nem muta o pedido original"
  );

  const cancelada = decidirReposicao(base, "cancelado", "Matriz", "  acabou a farinha  ");
  afirmar(
    cancelada.atendimento?.motivo === "acabou a farinha",
    `motivo é gravado sem espaço sobrando (obtido: "${cancelada.atendimento?.motivo}")`
  );

  let recusou = false;
  try {
    decidirReposicao(base, "cancelado", "Matriz", "   ");
  } catch {
    recusou = true;
  }
  afirmar(recusou, "cancelar só com espaços em branco é recusado pelo domínio");

  recusou = false;
  try {
    decidirReposicao(base, "cancelado", "Matriz");
  } catch {
    recusou = true;
  }
  afirmar(recusou, "cancelar sem motivo nenhum é recusado pelo domínio");

  // Pedido diário não entra nesse fluxo: ele é planejamento, não urgência.
  const diarioQualquer: PedidoFilial = { ...base, id: "d1", tipo: "diario" };
  afirmar(
    !reposicaoEstaPendente(diarioQualquer),
    "pedido diário nunca aparece como reposição pendente"
  );
}

// ---------------------------------------------------------------
// Caso 19: contador "não visto" do foguinho (ago/2026)
//
// O número ao lado da chama conta o que chegou DEPOIS da última abertura.
// Um contador que nunca zera vira ruído: às 10h marca 20 e continua 20
// para sempre, e a reação certa passa a ser ignorá-lo.
// ---------------------------------------------------------------
{
  const HOJE = "2026-08-26";
  const memoria = new Map<string, string>();
  // O módulo grava no localStorage; no Node ele não existe.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
  };

  const fornada = (id: string, hora: string, data = HOJE) => ({
    id,
    data,
    codigoPdv: 112,
    marcadaPor: "Padeiro",
    marcadaEm: `${data}T${hora}:00.000Z`,
  });

  const tres = [fornada("a", "06:00"), fornada("b", "07:00"), fornada("c", "08:00")];

  afirmar(
    fornadasNaoVistas("MATRIZ", HOJE, tres) === 3,
    "sem nunca ter aberto, todas as fornadas contam como novas"
  );

  marcarFornadasComoVistas("MATRIZ", HOJE, tres);
  afirmar(fornadasNaoVistas("MATRIZ", HOJE, tres) === 0, "abrir zera o contador");

  const comNova = [...tres, fornada("d", "09:30")];
  afirmar(
    fornadasNaoVistas("MATRIZ", HOJE, comNova) === 1,
    `fornada posterior à abertura volta a contar (obtido: ${fornadasNaoVistas("MATRIZ", HOJE, comNova)})`
  );

  // Cada loja tem a própria marca: a filial abrir não pode zerar a matriz.
  afirmar(
    fornadasNaoVistas("FILIAL_ARTHUR_BERNARDES", HOJE, comNova) === 4,
    "a marca é por loja — abrir numa não zera a outra"
  );

  // E por dia: a marca de ontem não silencia o forno de hoje.
  const ontem = [fornada("x", "06:00", "2026-08-25")];
  afirmar(
    fornadasNaoVistas("MATRIZ", "2026-08-25", ontem) === 1,
    "a marca é por dia — o que foi visto ontem não conta para hoje"
  );

  // Fornada de OUTRO dia nunca entra na conta do dia consultado.
  afirmar(
    fornadasNaoVistas("MATRIZ", HOJE, [...comNova, ...ontem]) === 1,
    "fornada de outro dia fica fora do contador do dia"
  );
}

// ---------------------------------------------------------------
// Caso 20: instruções de permissão por aparelho (ago/2026)
//
// Nenhuma API da web abre a tela de configurações do sistema. Quando o
// usuário já negou, o texto do passo a passo é a ÚNICA coisa que
// resolve — então ele não pode sair vazio, genérico ou com o caminho do
// aparelho errado em nenhum cenário.
// ---------------------------------------------------------------
{
  // `globalThis.navigator` no Node é só-leitura; defineProperty é o
  // único caminho para trocá-lo durante o teste.
  function definir(nome: string, valor: unknown) {
    Object.defineProperty(globalThis, nome, {
      value: valor,
      configurable: true,
      writable: true,
    });
  }

  function simular(userAgent: string, instalado: boolean, toques = 0) {
    definir("navigator", { userAgent, maxTouchPoints: toques, standalone: instalado });
    definir("window", { matchMedia: () => ({ matches: instalado }) });
  }

  const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/151";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1 Safari/604.1";
  const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1 Safari/604.1";
  const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151";

  simular(ANDROID, false);
  afirmar(plataformaAtual() === "android", "Android é reconhecido");

  simular(IPHONE, false);
  afirmar(plataformaAtual() === "ios", "iPhone é reconhecido");

  // iPad moderno se anuncia como Mac — só o toque o denuncia.
  simular(IPAD, false, 5);
  afirmar(plataformaAtual() === "ios", "iPad disfarçado de Mac é reconhecido como iOS");
  simular(WINDOWS, false);
  afirmar(plataformaAtual() === "desktop", "Windows é reconhecido como computador");

  // Mac de verdade (sem toque) não pode virar iOS, senão o dono do
  // negócio receberia instrução de iPhone no computador do caixa.
  definir("navigator", { userAgent: IPAD, maxTouchPoints: 0 });
  definir("window", { matchMedia: () => ({ matches: false }) });
  afirmar(plataformaAtual() === "desktop", "Mac sem toque continua sendo computador");

  const cenarios: [string, string, boolean][] = [
    ["Android instalado", ANDROID, true],
    ["Android no navegador", ANDROID, false],
    ["iPhone instalado", IPHONE, true],
    ["iPhone no navegador", IPHONE, false],
    ["computador", WINDOWS, false],
  ];
  for (const [nome, ua, instalado] of cenarios) {
    simular(ua, instalado, /iPhone|Macintosh/.test(ua) ? 5 : 0);
    const caminho = comoLiberarNotificacao();
    afirmar(
      caminho.passos.length >= 3 && caminho.passos.every((p) => p.trim().length > 0),
      `${nome}: passo a passo tem conteúdo em todos os passos`
    );
    afirmar(
      caminho.titulo.trim().length > 0,
      `${nome}: o passo a passo diz de qual aparelho está falando`
    );
  }

  // Instalado e não instalado têm caminhos DIFERENTES: mandar quem
  // instalou para as configurações do navegador não resolve nada.
  simular(ANDROID, true);
  const androidApp = comoLiberarNotificacao();
  simular(ANDROID, false);
  const androidNavegador = comoLiberarNotificacao();
  afirmar(
    androidApp.titulo !== androidNavegador.titulo,
    "Android instalado e no navegador recebem instruções distintas"
  );

  // Só o computador oferece atalho colável; num celular não existe
  // endereço equivalente, e oferecer um seria falso.
  simular(WINDOWS, false);
  afirmar(Boolean(comoLiberarNotificacao().atalho), "no computador há atalho para copiar");
  simular(IPHONE, true);
  afirmar(
    comoLiberarNotificacao().atalho === undefined,
    "no iPhone não se promete um atalho que não existe"
  );

  // Não restaura: este é o último bloco do script e o processo encerra
  // em seguida. Deixar navigator falso vivo para casos futuros seria a
  // armadilha clássica de teste que contamina o vizinho.
}

// ---------------------------------------------------------------
// Caso 21: desfecho da impressão no caixa (ago/2026)
//
// O que se protege aqui é a diferença entre "ainda não respondeu" e
// "respondeu". Confundir os dois foi o defeito original: a tela tratava
// silêncio como sucesso, e o operador ficava esperando um papel que não
// vinha porque o programa do caixa estava fechado.
// ---------------------------------------------------------------
{
  // Nada respondeu ainda: NÃO está pronto. É este caso que deixa o
  // relógio de desistência correr até avisar sobre o agente fechado.
  afirmar(
    resumoDaImpressao([], 1).pronto === false,
    "sem resposta nenhuma, o desfecho continua em aberto"
  );

  // Uma parte de duas: ainda em aberto — anunciar sucesso aqui faria o
  // operador sair de perto da impressora com metade da lista.
  afirmar(
    resumoDaImpressao([{ id: "a", status: "impresso" }], 2).pronto === false,
    "impressão parcial não conta como concluída"
  );

  const duasPartes = resumoDaImpressao(
    [
      { id: "a", status: "impresso" },
      { id: "b", status: "impresso" },
    ],
    2
  );
  afirmar(duasPartes.pronto && duasPartes.sucesso, "todas as partes impressas fecham com sucesso");
  afirmar(
    duasPartes.texto.includes("2 partes"),
    `o texto diz quantas partes saíram (obtido: "${duasPartes.texto}")`
  );

  const umaParte = resumoDaImpressao([{ id: "a", status: "impresso" }], 1);
  afirmar(
    umaParte.sucesso && !umaParte.texto.includes("partes"),
    "com uma parte só, o texto não fala em partes"
  );

  // Erro manda em qualquer combinação: se uma parte falhou, a lista está
  // incompleta, e dizer "impresso" seria pior que não dizer nada.
  const comFalha = resumoDaImpressao(
    [
      { id: "a", status: "impresso" },
      { id: "b", status: "erro", erro: "Impressora nao encontrada" },
    ],
    2
  );
  afirmar(comFalha.pronto && !comFalha.sucesso, "uma parte com erro reprova o conjunto");
  afirmar(
    comFalha.texto.includes("Impressora nao encontrada"),
    `o motivo do agente chega até a tela (obtido: "${comFalha.texto}")`
  );

  // Erro sem mensagem ainda precisa virar frase apresentável.
  const semMotivo = resumoDaImpressao([{ id: "a", status: "erro" }], 1);
  afirmar(
    semMotivo.pronto && !semMotivo.sucesso && semMotivo.texto.length > 10,
    "erro sem motivo informado ainda produz uma frase legível"
  );

  const motivoVazio = resumoDaImpressao([{ id: "a", status: "erro", erro: "   " }], 1);
  afirmar(
    !motivoVazio.texto.includes("  "),
    "motivo só com espaços não vaza para a mensagem"
  );

  // Pendente é o estado normal logo depois de enviar.
  afirmar(
    resumoDaImpressao([{ id: "a", status: "pendente" }], 1).pronto === false,
    "trabalho pendente mantém o desfecho em aberto"
  );
}

// ---------------------------------------------------------------
// Caso 22: busca sem acento (ago/2026)
//
// Defeito real: a busca de produtos exigia acento. "pao" nao achava
// "PAO FRANCES" e a tela respondia "nenhum produto encontrado" para um
// produto que estava la'. Ninguem digita acento procurando as pressas —
// no teclado do celular o "a" com til exige segurar a tecla e escolher
// numa listinha, com a mao ocupada.
// ---------------------------------------------------------------
{
  afirmar(paraBusca("Pão Francês") === "PAO FRANCES", "acento e caixa somem na normalizacao");
  afirmar(paraBusca("  bolo  ") === "BOLO", "espaco das pontas sai");

  // O caso que originou tudo.
  afirmar(contemBusca("PÃO FRANCÊS", "pao"), '"pao" encontra "PÃO FRANCÊS"');
  afirmar(contemBusca("BOLO DE FUBÁ", "fuba"), '"fuba" encontra "BOLO DE FUBÁ"');

  // E o contrário também: quem digita com acento continua achando.
  afirmar(contemBusca("PAO FRANCES", "pão"), '"pão" encontra um cadastro sem acento');
  afirmar(contemBusca("PÃO FRANCÊS", "pão"), 'digitar com acento continua funcionando');

  // Outros acentos do português, sem tabela de substituição para manter.
  afirmar(contemBusca("AÇÚCAR MASCAVO", "acucar"), "cedilha e til de u: açúcar/acucar");
  afirmar(contemBusca("PÃO DE QUEIJO CONGELADO", "QUEIJO"), "busca no meio do nome");

  // Não pode virar um filtro que aceita qualquer coisa.
  afirmar(!contemBusca("PÃO FRANCÊS", "bolo"), "termo que nao existe continua sem resultado");
  afirmar(contemBusca("PÃO FRANCÊS", ""), "termo vazio nao exclui nada");

  // ----- SINGULAR E PLURAL SÃO A MESMA BUSCA -----
  afirmar(radical("PAES") === radical("PAO"), "PAES e PAO tem o mesmo radical");
  afirmar(radical("SOVADOS") === radical("SOVADO"), "SOVADOS e SOVADO");
  afirmar(radical("FRANCESES") === radical("FRANCES"), "plural duplo: FRANCESES e FRANCES");
  afirmar(radical("PASTEIS") === radical("PASTEL"), "PASTEIS e PASTEL");
  afirmar(radical("PUDINS") === radical("PUDIM"), "PUDINS e PUDIM");
  afirmar(radical("DOCES") === radical("DOCE"), "DOCES e DOCE (nao vira DOC)");
  afirmar(radical("QUEIJOS") === radical("QUEIJO"), "QUEIJOS e QUEIJO");
  afirmar(radical("REIS") !== radical("REL"), "REIS e plural de REI, nao de REL");
  afirmar(radical("BOLO") !== radical("BROA"), "radical nao junta produtos diferentes");
  afirmar(radical("PAO") === "PAO", "palavra no singular passa intacta");
  afirmar(contemBusca("PÃO SOVADO", "pães sovados"), '"pães sovados" acha "PÃO SOVADO"');
  afirmar(contemBusca("PÃO DE QUEIJO CONGELADO", "queijos"), '"queijos" acha o pao de queijo');
  afirmar(contemBusca("PÃO FRANCÊS", "franc"), "busca por trecho continua funcionando");
  afirmar(!contemBusca("PÃO FRANCÊS", "bolos"), "plural nao inventa resultado");
}

// ---------------------------------------------------------------
// Caso 23: relatorio das fornadas (ago/2026)
//
// Pedido do dono do negocio: usar a marcacao de fornada, que ja virou
// habito, para produzir analise. O que precisa ficar travado aqui:
//
//   1. a janela e aplicada sobre a MARCACAO, nao sobre a lista de
//      producao — fornada de outro dia nao entra na conta do periodo;
//   2. o valor plotado e MEDIA POR DIA, nao total: em 90 dias qualquer
//      faixa acumula numero grande e o ritmo do dia some;
//   3. a media divide pelos dias COM fornada, nao pelo tamanho da
//      janela — senao abrir "90 dias" com 5 dias de dado dilui tudo a
//      zero e o grafico mente dizendo que o forno esta parado.
// ---------------------------------------------------------------
{
  const HOJE = "2026-08-25";
  const catalogo: Produto[] = [
    {
      codigoPdv: 1,
      nome: "PAO FRANCES",
      categoria: "PÃES E ROSCAS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 50,
    },
    {
      codigoPdv: 2,
      nome: "BOLO DE FUBA",
      categoria: "CONFEITARIA",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 800,
    },
  ];

  const marcar = (data: string, codigoPdv: number, hora: number, minuto = 0): FornadaPronta => ({
    id: `${data}_${codigoPdv}_${hora}${minuto}`,
    data,
    codigoPdv,
    marcadaPor: "Daniel",
    marcadaEm: new Date(
      Number(data.slice(0, 4)),
      Number(data.slice(5, 7)) - 1,
      Number(data.slice(8, 10)),
      hora,
      minuto
    ).toISOString(),
  });

  // somarDias e a base da janela: comecar um dia errado desloca o
  // relatorio inteiro sem nenhum sinal na tela.
  afirmar(somarDias(HOJE, -6) === "2026-08-19", "janela de 7 dias comeca 6 dias atras");
  afirmar(somarDias("2026-03-01", -1) === "2026-02-28", "somarDias atravessa a virada de mes");
  afirmar(somarDias("2026-01-01", -1) === "2025-12-31", "somarDias atravessa a virada de ano");
  afirmar(diasEntreDatas(somarDias(HOJE, -6), HOJE) === 6, "a janela de 7 dias cobre 7 datas");

  const fornadas: FornadaPronta[] = [
    marcar(HOJE, 1, 5),
    marcar(HOJE, 1, 5, 40),
    marcar(HOJE, 1, 9),
    marcar(HOJE, 2, 8),
    marcar("2026-08-24", 1, 6),
    marcar("2026-08-24", 1, 11),
    // Fora da janela de 7 dias — nao pode entrar em conta nenhuma.
    marcar("2026-07-01", 1, 6),
    // Fora do expediente mapeado (23h): tem que aparecer, e nao sumir.
    marcar(HOJE, 1, 23),
  ];

  const semana = recortarFornadas(fornadas, catalogo, HOJE, { dias: 7 });
  afirmar(semana.length === 7, `janela de 7 dias deixa a marcacao antiga de fora (obtido: ${semana.length})`);
  afirmar(
    semana.every((f) => f.data !== "2026-07-01"),
    "marcacao de outro mes nao entra na janela"
  );

  // Categoria recorta aqui tambem, junto com o resto da tela.
  const soConfeitaria = recortarFornadas(fornadas, catalogo, HOJE, { dias: 7, categoria: "CONFEITARIA" });
  afirmar(soConfeitaria.length === 1 && soConfeitaria[0].codigoPdv === 2, "filtro de categoria recorta as fornadas");

  const totais = totaisDeFornadas(semana);
  afirmar(totais.total === 7, `total conta cada marcacao (obtido: ${totais.total})`);
  afirmar(totais.diasComFornada === 2, `dois dias com marcacao (obtido: ${totais.diasComFornada})`);
  afirmar(totais.mediaPorDia === 3.5, `media divide pelos dias COM fornada (obtido: ${totais.mediaPorDia})`);
  // Primeira fornada: 5h num dia, 6h no outro. A mediana nao pode virar
  // "00h" so porque a lista tem tamanho par.
  afirmar(
    totais.primeiraHoraTipica === "06h",
    `primeira hora tipica sai formatada em duas casas (obtido: "${totais.primeiraHoraTipica}")`
  );

  // Sem nenhuma fornada o relatorio precisa devolver zero, e nao dividir
  // por zero nem estourar Math.min com lista vazia.
  const vazio = totaisDeFornadas([]);
  afirmar(
    vazio.total === 0 && vazio.diasComFornada === 0 && vazio.mediaPorDia === 0,
    "periodo sem fornada devolve zeros"
  );
  afirmar(vazio.primeiraHoraTipica === "—", "sem fornada nao inventa hora");

  const faixas = fornadasPorFaixaDeHora(semana);
  const faixaDe = (rotulo: string) => faixas.find((f) => f.rotulo === rotulo);
  // 04h-07h: 5h, 5h40 (hoje) + 6h (ontem) = 3 marcacoes em 2 dias.
  afirmar(faixaDe("04h–07h")?.valor === 1.5, `faixa da madrugada em media por dia (obtido: ${faixaDe("04h–07h")?.valor})`);
  afirmar(faixaDe("07h–10h")?.valor === 1, "faixa da manha em media por dia");
  afirmar(faixaDe("10h–13h")?.valor === 0.5, "faixa do meio-dia em media por dia");
  afirmar(faixaDe("13h–16h")?.valor === 0, "faixa sem fornada aparece zerada, e nao some");
  afirmar(faixaDe("outros horários")?.valor === 0.5, "marcacao fora do expediente nao e descartada");
  afirmar(
    (faixaDe("04h–07h")?.detalhe ?? "").includes("3 fornadas em 2 dias"),
    `o detalhe conta o numero inteiro por tras da media (obtido: "${faixaDe("04h–07h")?.detalhe}")`
  );
  afirmar(
    (faixaDe("13h–16h")?.detalhe ?? "").includes("nenhuma fornada"),
    "faixa zerada explica que nao houve marcacao"
  );

  // Singular/plural: o app fala portugues, e "1 fornadas em 1 dias" e o
  // tipo de detalhe que faz o operador desconfiar do numero todo.
  const umDia = fornadasPorFaixaDeHora([marcar(HOJE, 1, 5)]);
  afirmar(
    (umDia.find((f) => f.rotulo === "04h–07h")?.detalhe ?? "").includes("1 fornada em 1 dia"),
    `singular concorda (obtido: "${umDia.find((f) => f.rotulo === "04h–07h")?.detalhe}")`
  );

  const repeticao = produtosPorNumeroDeFornadas(semana, catalogo);
  afirmar(repeticao[0].rotulo === "PAO FRANCES", "o item que mais repete fornada vem primeiro");
  // Pao frances: 6 marcacoes em 2 dias = 3/dia. Bolo: 1 em 2 = 0,5/dia.
  afirmar(repeticao[0].valor === 3, `repeticao em media por dia (obtido: ${repeticao[0].valor})`);
  afirmar(repeticao[1].rotulo === "BOLO DE FUBA" && repeticao[1].valor === 0.5, "item de fornada unica fica embaixo");
  afirmar(produtosPorNumeroDeFornadas([], catalogo).length === 0, "sem fornada, nenhuma barra");

  // Produto marcado e depois excluido do catalogo nao pode derrubar a
  // tela nem aparecer como "undefined".
  const orfa = produtosPorNumeroDeFornadas([marcar(HOJE, 99, 5)], catalogo);
  afirmar(orfa[0].rotulo === "#99", `produto fora do catalogo aparece pelo codigo (obtido: "${orfa[0].rotulo}")`);
}

// ---------------------------------------------------------------
// Caso 24: reposicao confirmada entra na producao de hoje (ago/2026)
//
// Pedido do dono do negocio: quando a matriz confirma uma reposicao de
// um item que NAO estava no cronograma, esse item passa a contar como
// produzido hoje. Sem isso ele some da contabilidade — foi produzido e
// entregue, mas o plano do dia nao o conhece, e o plano do dia e o
// DENOMINADOR da taxa de perda. Uma perda lancada amanha sobre ele
// apareceria como perda sem producao.
//
// O que precisa ficar travado:
//   1. item que JA esta na lista nao entra de novo, e a quantidade
//      planejada fica intacta — somar as duas inflaria a producao do dia
//      com mercadoria que nao existiu;
//   2. o resto do plano nao e reescrito: status, autoria e o registro de
//      producaoRealizada continuam como estavam;
//   3. item novo nao citado em codigosNaoProduzidos conta como
//      produzido, que e exatamente o que aconteceu.
// ---------------------------------------------------------------
{
  let contador = 0;
  const novoId = () => `id-${++contador}`;

  const planoBase: PlanoDeProducaoDiario = {
    id: "plano-hoje",
    data: "2026-08-25",
    diaDaSemana: "terca",
    sessoes: [
      { id: "s1", categoria: "PÃES E ROSCAS", itens: [{ codigoPdv: 1, quantidadeUnidades: 400 }] },
    ],
    status: "confirmado",
    criadoPor: "Daniel",
    criadoEm: "2026-08-24T20:00:00.000Z",
    confirmadoEm: "2026-08-24T20:05:00.000Z",
    producaoRealizada: {
      confirmadoPor: "Daniel",
      confirmadoEm: "2026-08-25T19:00:00.000Z",
      codigosNaoProduzidos: [],
    },
  };

  afirmar(planoContemItem(planoBase, 1), "o plano reconhece um item que ele tem");
  afirmar(!planoContemItem(planoBase, 99), "o plano nao inventa item que nao tem");

  // Item ja na lista: nada acontece. E a regra que impede a producao do
  // dia inflar a cada reposicao atendida com o que ja saiu do forno.
  afirmar(
    incluirItemProduzido(planoBase, { codigoPdv: 1, quantidadeUnidades: 30 }, "PÃES E ROSCAS", novoId) === null,
    "item ja planejado nao entra de novo"
  );

  // Item novo, categoria que ja tem sessao: entra na sessao existente.
  const comItemNovo = incluirItemProduzido(
    planoBase,
    { codigoPdv: 2, quantidadeUnidades: 12 },
    "PÃES E ROSCAS",
    novoId
  );
  afirmar(comItemNovo !== null, "item fora da lista entra na producao de hoje");
  afirmar(comItemNovo!.sessoes.length === 1, "categoria com sessao existente nao cria sessao nova");
  afirmar(comItemNovo!.sessoes[0].itens.length === 2, "a sessao passa a ter os dois itens");
  afirmar(
    comItemNovo!.sessoes[0].itens[0].quantidadeUnidades === 400,
    "a quantidade ja planejada fica intacta"
  );
  afirmar(comItemNovo!.sessoes[0].id === "s1", "a sessao existente mantem o proprio id");

  // O plano nao e reescrito em mais nada.
  afirmar(comItemNovo!.id === planoBase.id, "o plano continua sendo o mesmo documento");
  afirmar(comItemNovo!.status === "confirmado", "o status nao muda");
  afirmar(comItemNovo!.criadoPor === "Daniel", "a autoria nao muda");
  afirmar(
    comItemNovo!.producaoRealizada?.confirmadoEm === "2026-08-25T19:00:00.000Z",
    "o registro de producao realizada fica intacto"
  );
  // A consequencia que interessa: item novo nao citado em
  // codigosNaoProduzidos conta como produzido.
  afirmar(
    !comItemNovo!.producaoRealizada!.codigosNaoProduzidos.includes(2),
    "item recem-incluido conta como produzido"
  );
  afirmar(planoBase.sessoes[0].itens.length === 1, "o plano original nao e mutado");

  // Categoria sem sessao ainda: cria a sessao.
  const outraCategoria = incluirItemProduzido(
    planoBase,
    { codigoPdv: 3, quantidadeUnidades: 5 },
    "BOLOS",
    novoId
  );
  afirmar(outraCategoria!.sessoes.length === 2, "categoria nova ganha sessao propria");
  afirmar(
    outraCategoria!.sessoes[1].categoria === "BOLOS" && outraCategoria!.sessoes[1].itens[0].codigoPdv === 3,
    "a sessao nova nasce com o item dentro"
  );

  // Quantidade invalida nao entra: um pedido zerado nao e producao.
  afirmar(
    incluirItemProduzido(planoBase, { codigoPdv: 4, quantidadeUnidades: 0 }, "BOLOS", novoId) === null,
    "quantidade zero nao entra na producao"
  );

  // Dia sem cronograma montado: o plano nasce aqui, ja confirmado.
  const doZero = planoDeHojeCom(
    "2026-08-25",
    "terca",
    { codigoPdv: 7, quantidadeUnidades: 20 },
    "BISCOITOS",
    "Daniel",
    "2026-08-25T14:00:00.000Z",
    novoId
  );
  afirmar(doZero.status === "confirmado", "plano criado pela reposicao nasce confirmado");
  afirmar(
    doZero.sessoes.length === 1 && doZero.sessoes[0].itens[0].codigoPdv === 7,
    "plano criado pela reposicao carrega o item pedido"
  );
  afirmar(doZero.id !== doZero.sessoes[0].id, "plano e sessao recebem ids distintos");
  afirmar(producaoFoiConfirmada(doZero) === false, "plano novo ainda nao teve conferencia de fim de dia");
  afirmar(itensPlanejados(doZero).length === 1, "o item novo aparece como planejado do dia");
}

// ---------------------------------------------------------------
// Caso 25: aba de destino do aviso (ago/2026)
//
// Tocar no push abria o app na ultima aba usada. A filial recebia "PAO
// FRANCES — disponivel para pedidos", tocava, e caia no Cronograma: o
// aviso avisava e nao levava a lugar nenhum.
// ---------------------------------------------------------------
{
  afirmar(abaDaUrl("/?aba=fornada") === "fornada", "a rota do aviso leva a aba Nova Fornada");
  afirmar(abaDaUrl("?aba=perdas") === "perdas", "funciona com a query solta, como vem de location.search");
  afirmar(
    abaDaUrl("https://padaria.vercel.app/?aba=pedido") === "pedido",
    "funciona com URL absoluta, como o service worker manda"
  );
  afirmar(abaDaUrl(urlDaAba("fornada")) === "fornada", "o que o servidor monta e o que o app le");

  // Sem destino reconhecivel o app fica onde estava: um aviso antigo na
  // bandeja, ou uma URL adulterada, nao pode levar a um estado que o app
  // nao sabe renderizar.
  afirmar(abaDaUrl("/") === null, "sem query nao ha destino");
  afirmar(abaDaUrl("") === null, "string vazia nao quebra");
  afirmar(abaDaUrl("/?aba=") === null, "aba vazia nao vira destino");
  afirmar(abaDaUrl("/?aba=inexistente") === null, "aba desconhecida e ignorada");
  afirmar(abaDaUrl("/?outra=fornada") === null, "outro parametro nao vira destino");
  afirmar(abaDaUrl("/?x=1&aba=fornada") === "fornada", "a aba e encontrada entre outros parametros");
}

// ---------------------------------------------------------------
// Caso 26: blocos por categoria na fita impressa (ago/2026)
//
// Quem separa a mercadoria de manha anda pela padaria por SETOR, nao por
// ordem alfabetica de produto. E a ordem dos setores tem que ser a MESMA
// em todo papel do dia: o pedido que a filial manda direto para a
// impressora e o romaneio que a matriz imprime sao conferidos um contra o
// outro, e ordens diferentes transformariam isso em procura.
// ---------------------------------------------------------------
{
  const catalogo: Produto[] = [
    {
      codigoPdv: 1,
      nome: "PAO FRANCES",
      categoria: "PÃES E ROSCAS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 50,
    },
    {
      codigoPdv: 2,
      nome: "BOLO DE FUBA",
      categoria: "BOLOS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 800,
    },
    {
      codigoPdv: 3,
      nome: "BISCOITO DE QUEIJO",
      categoria: "BISCOITOS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 20,
    },
    {
      codigoPdv: 4,
      nome: "ROSCA DOCE",
      categoria: "PÃES E ROSCAS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 300,
    },
    {
      codigoPdv: 5,
      nome: "ITEM DE CATEGORIA ANTIGA",
      categoria: "ENCOMENDAS_E_ESPECIAIS",
      unidadeProducao: "un",
      statusVenda: "Ativo",
      ativoNaProducao: true,
      pesoMedioUnitarioGramas: 100,
    },
  ];

  // Itens fora de ordem de proposito: e o caso real, porque a filial
  // adiciona na ordem em que lembra.
  const blocos = agruparPorCategoria(
    [
      { codigoPdv: 2, quantidadeUnidades: 3 },
      { codigoPdv: 3, quantidadeUnidades: 40 },
      { codigoPdv: 1, quantidadeUnidades: 200 },
      { codigoPdv: 4, quantidadeUnidades: 10 },
    ],
    catalogo
  );

  afirmar(blocos.length === 3, `uma sessao por categoria com item (obtido: ${blocos.length})`);
  // A ordem e a de CATEGORIAS_PRODUCAO, nao a de chegada dos itens.
  afirmar(
    blocos.map((b) => b.rotuloSessao).join(" | ") === "Pães e Roscas | Biscoitos | Bolos",
    `setores na ordem do catalogo (obtido: "${blocos.map((b) => b.rotuloSessao).join(" | ")}")`
  );
  afirmar(blocos[0].itens.length === 2, "os dois paes caem na mesma sessao");
  afirmar(
    blocos[0].itens.map((i) => i.codigoPdv).join(",") === "1,4",
    "dentro da sessao, a ordem de chegada e preservada"
  );
  afirmar(blocos[0].itens[0].quantidadeUnidades === 200, "a quantidade atravessa o agrupamento");

  // Categoria vazia nao vira sessao em branco no papel.
  afirmar(
    !blocos.some((b) => b.itens.length === 0),
    "categoria sem item nao imprime sessao vazia"
  );

  // Categoria fora das cinco nao pode SUMIR: item que nao aparece na
  // lista e item que ninguem separa.
  const comAntiga = agruparPorCategoria(
    [
      { codigoPdv: 5, quantidadeUnidades: 2 },
      { codigoPdv: 1, quantidadeUnidades: 50 },
    ],
    catalogo
  );
  afirmar(comAntiga.length === 2, "categoria fora das cinco continua aparecendo");
  afirmar(
    comAntiga[0].rotuloSessao === "Pães e Roscas",
    "as categorias conhecidas vem primeiro"
  );
  afirmar(
    comAntiga[1].itens[0].codigoPdv === 5,
    "a categoria desconhecida vai para o fim, com o item dentro"
  );

  // Produto que saiu do catalogo tambem nao pode sumir do papel.
  const orfao = agruparPorCategoria([{ codigoPdv: 999, quantidadeUnidades: 5 }], catalogo);
  afirmar(orfao.length === 1, "item sem cadastro ainda gera uma sessao");

  afirmar(agruparPorCategoria([], catalogo).length === 0, "pedido vazio nao gera papel");
}

// ---------------------------------------------------------------
// Caso 27: virada de dia com o app aberto (ago/2026)
//
// Defeito relatado pelo dono do negocio: quinta de manha, e as perdas
// lancadas na quarta apareciam como "lancadas hoje". Os DADOS estavam
// certos — cada perda foi gravada com a data certa. A TELA e que nunca
// soube que o dia mudou, porque no PC do caixa o app fica aberto a noite
// inteira e nada o fazia renderizar de novo.
//
// A mesma raiz atinge Cronograma e Pedido, que abrem no dia SEGUINTE: a
// data-alvo era escolhida uma vez, na montagem da tela, e nunca mais. Na
// quinta de manha ela ainda apontava para a quinta, que ja tinha
// chegado, e quem fosse montar a lista de sexta editava a de quinta.
//
// Avancar sozinho e conveniente e perigoso ao mesmo tempo: as 23h59
// alguem pode estar no meio da digitacao. Dai as guardas.
// ---------------------------------------------------------------
{
  const QUINTA = "2026-08-27";
  const SEXTA = "2026-08-28";
  const QUARTA = "2026-08-26";

  // O caso que motivou tudo: tela parada apontando para um dia que ja
  // chegou, sem nada digitado.
  afirmar(
    proximaDataAlvo(QUINTA, QUINTA, false) === SEXTA,
    `data-alvo que virou hoje avanca para amanha (obtido: ${proximaDataAlvo(QUINTA, QUINTA, false)})`
  );
  // Fim de semana ou feriado com o app esquecido aberto: pula direto.
  afirmar(proximaDataAlvo(QUARTA, QUINTA, false) === SEXTA, "data-alvo no passado tambem avanca");

  // Ja esta certa: nao mexe (e nao dispara render a toa).
  afirmar(proximaDataAlvo(SEXTA, QUINTA, false) === null, "data-alvo ja em amanha nao muda");

  // A guarda que protege o trabalho: 23h59, alguem digitando.
  afirmar(
    proximaDataAlvo(QUINTA, QUINTA, true) === null,
    "com item digitado na tela, a data NAO vira sozinha"
  );

  // Quem escolheu planejar mais adiante nao pode ser jogado de volta.
  afirmar(
    proximaDataAlvo("2026-09-05", QUINTA, false) === null,
    "data futura escolhida a mao e preservada"
  );

  // Viradas de mes e de ano continuam valendo — a conta e a de somarDias.
  afirmar(proximaDataAlvo("2026-08-31", "2026-08-31", false) === "2026-09-01", "vira o mes");
  afirmar(proximaDataAlvo("2026-12-31", "2026-12-31", false) === "2027-01-01", "vira o ano");
}

// ---------------------------------------------------------------
// Caso 28: taxa de perda por LOJA (ago/2026)
//
// Defeito que so apareceu quando a aba de Analises foi liberada para as
// filiais: a tela deixava filtrar por loja, mas o filtro so alcancava as
// PERDAS. O denominador continuava sendo a producao inteira da padaria —
// as tres lojas somadas.
//
// Resultado: a taxa de uma filial saia dividida por um numero varias
// vezes maior que o certo, e parecia otima. Numero errado que parece bom
// e o pior tipo de numero num painel de decisao.
//
// A correcao usa a MESMA consolidacao da fita de producao: sem filtro, o
// denominador e tudo que saiu do forno; com filtro, e o que chegou
// aquela loja — a matriz fica com o que planejou para si, cada filial com
// o que pediu.
// ---------------------------------------------------------------
{
  const DIA = "2026-08-26"; // quarta
  const HOJE = "2026-08-27";
  const ARTHUR = "FILIAL_ARTHUR_BERNARDES";

  const pao: Produto = {
    codigoPdv: 1,
    nome: "PAO FRANCES",
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
    pesoMedioUnitarioGramas: 50,
  };

  // A matriz planejou 100 para si; a filial pediu 50. Total produzido: 150.
  const planoDoDia: PlanoDeProducaoDiario = {
    id: "plano-loja",
    data: DIA,
    diaDaSemana: "quarta",
    sessoes: [{ id: "s1", categoria: "PÃES E ROSCAS", itens: [{ codigoPdv: 1, quantidadeUnidades: 100 }] }],
    status: "confirmado",
    criadoPor: "Daniel",
    criadoEm: `${DIA}T20:00:00.000Z`,
    confirmadoEm: `${DIA}T20:05:00.000Z`,
  };

  const pedidoDaFilial: PedidoFilial = {
    id: `${DIA}_${ARTHUR}`,
    lojaId: ARTHUR,
    data: DIA,
    itens: [{ codigoPdv: 1, quantidadeUnidades: 50 }],
    status: "enviado",
    criadoPor: "Ana",
    criadoEm: `${DIA}T18:00:00.000Z`,
    enviadoEm: `${DIA}T18:00:00.000Z`,
  };

  const umaPerda = (id: string, lojaId: string, unidades: number): RegistroPerda => ({
    id,
    codigoPdv: 1,
    planoDeProducaoId: "plano-loja",
    data: DIA,
    diaDaSemana: "quarta",
    quantidadeQuilos: unidades * 0.05,
    pesoUnitarioGramasInformado: 50,
    quantidadeUnidadesEstimada: unidades,
    motivo: "sobra_nao_vendida",
    registradoPor: "teste",
    registradoEm: `${DIA}T20:00:00Z`,
    lojaId,
  });

  const perdasDasLojas = [umaPerda("m1", "MATRIZ", 10), umaPerda("a1", ARTHUR, 10)];
  const catalogo = [pao];
  const janela = { dias: 7 };

  const totalGeral = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, janela, [pedidoDaFilial])
  );
  afirmar(
    totalGeral.produzido === 150,
    `sem filtro, o denominador soma matriz e filiais (obtido: ${totalGeral.produzido})`
  );
  afirmar(totalGeral.perdido === 20, "sem filtro, todas as perdas contam");

  const daMatriz = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, { ...janela, lojaId: "MATRIZ" }, [
      pedidoDaFilial,
    ])
  );
  afirmar(daMatriz.produzido === 100, `matriz fica com o que planejou para si (obtido: ${daMatriz.produzido})`);
  afirmar(daMatriz.perdido === 10, "matriz conta so as proprias perdas");
  afirmar(daMatriz.taxaPerda === 10, `taxa da matriz = 10/100 (obtido: ${daMatriz.taxaPerda})`);

  // ESTE e o caso que o defeito escondia.
  const daFilial = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, { ...janela, lojaId: ARTHUR }, [
      pedidoDaFilial,
    ])
  );
  afirmar(
    daFilial.produzido === 50,
    `filial fica com o que PEDIU, nao com a producao inteira (obtido: ${daFilial.produzido})`
  );
  afirmar(daFilial.perdido === 10, "filial conta so as proprias perdas");
  afirmar(
    daFilial.taxaPerda === 20,
    `taxa da filial = 10/50 = 20%, e nao 10/150 = 6,7% (obtido: ${daFilial.taxaPerda})`
  );

  // O grafico de produtos usa o mesmo denominador — se ele nao usasse, a
  // tela mostraria duas taxas diferentes para o mesmo produto.
  const porProdutoFilial = topProdutosPorPerda(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, { ...janela, lojaId: ARTHUR }, [
      pedidoDaFilial,
    ])
  );
  afirmar(
    porProdutoFilial.length === 1 && porProdutoFilial[0].produzido === 50,
    `o grafico por produto usa o mesmo denominador (obtido: ${porProdutoFilial[0]?.produzido})`
  );
  afirmar(porProdutoFilial[0].valor === 20, "e a mesma taxa dos numeros-cabecalho");

  // Item marcado como NAO PRODUZIDO no fim do expediente sai do
  // denominador: ninguem recebeu o que nao saiu do forno.
  const naoSaiu: PlanoDeProducaoDiario = {
    ...planoDoDia,
    producaoRealizada: {
      confirmadoPor: "Daniel",
      confirmadoEm: `${DIA}T21:00:00.000Z`,
      codigosNaoProduzidos: [1],
    },
  };
  const semProducao = calcularTotais(
    recortar(catalogo, [naoSaiu], perdasDasLojas, HOJE, janela, [pedidoDaFilial])
  );
  afirmar(semProducao.produzido === 0, "item que nao saiu do forno some do denominador");
  afirmar(semProducao.taxaPerda === null, "sem producao a taxa e nula, e nao zero");

  // Rascunho da filial nao entra: ela ainda esta mexendo no numero.
  const rascunho: PedidoFilial = { ...pedidoDaFilial, status: "rascunho" };
  const comRascunho = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, { ...janela, lojaId: ARTHUR }, [rascunho])
  );
  afirmar(comRascunho.produzido === 0, "pedido em rascunho nao vira denominador");

  // Reposicao tambem nao: ela e de HOJE e ja foi entregue por fora do
  // planejamento (ver ehPedidoDiario em src/types/pedido.ts).
  const reposicao: PedidoFilial = { ...pedidoDaFilial, id: "rep", tipo: "reposicao" };
  const comReposicao = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, HOJE, { ...janela, lojaId: ARTHUR }, [
      reposicao,
    ])
  );
  afirmar(comReposicao.produzido === 0, "reposicao nao entra no denominador do planejamento");

  // Fora da janela, nada conta.
  const forA = calcularTotais(
    recortar(catalogo, [planoDoDia], perdasDasLojas, "2026-10-01", janela, [pedidoDaFilial])
  );
  afirmar(forA.produzido === 0 && forA.perdido === 0, "fora do periodo, o recorte fica vazio");
}

// ---------------------------------------------------------------
// Caso 29: rascunho do cronograma (ago/2026)
//
// Defeito relatado: "apaguei a sessao Paes e Roscas, sai da aba, voltei,
// e ela estava la de novo". A montagem vivia so' na memoria do
// componente; trocar de aba desmontava a tela e ela era reconstruida a
// partir do plano GRAVADO. Nao era so' a limpeza: acrescentar item,
// corrigir quantidade, remover produto — tudo se perdia igual, e em
// silencio, com numeros plausiveis no lugar.
//
// Aqui ficam travadas as duas pecas puras: a comparacao que decide se ha
// "alteracoes nao confirmadas", e a expiracao dos rascunhos velhos.
// ---------------------------------------------------------------
{
  const plano: PlanoDeProducaoDiario = {
    id: "p-rascunho",
    data: "2026-08-28",
    diaDaSemana: "sexta",
    sessoes: [
      { id: "s1", categoria: "PÃES E ROSCAS", itens: [
        { codigoPdv: 1, quantidadeUnidades: 400 },
        { codigoPdv: 2, quantidadeUnidades: 20 },
      ] },
      { id: "s2", categoria: "BOLOS", itens: [{ codigoPdv: 9, quantidadeUnidades: 4 }] },
    ],
    status: "confirmado",
    criadoPor: "Daniel",
    criadoEm: "2026-08-27T20:00:00.000Z",
    confirmadoEm: "2026-08-27T20:05:00.000Z",
  };

  const doPlano = mapaDoPlano(plano);
  afirmar(Object.keys(doPlano).length === 2, "o mapa do plano tem uma entrada por sessao");
  afirmar(doPlano["PÃES E ROSCAS"].length === 2, "os itens da sessao atravessam o mapa");
  afirmar(Object.keys(mapaDoPlano(undefined)).length === 0, "sem plano, o mapa nasce vazio");

  // Igual a si mesmo.
  afirmar(mapasIguais(doPlano, mapaDoPlano(plano)), "o mesmo plano se compara igual");

  // ORDEM nao conta: remover e re-adicionar o mesmo produto muda a ordem
  // sem mudar o pedido, e um alarme nesse caso seria falso.
  const trocado = {
    BOLOS: [{ codigoPdv: 9, quantidadeUnidades: 4 }],
    "PÃES E ROSCAS": [
      { codigoPdv: 2, quantidadeUnidades: 20 },
      { codigoPdv: 1, quantidadeUnidades: 400 },
    ],
  };
  afirmar(mapasIguais(doPlano, trocado), "ordem de sessao e de item nao conta como alteracao");

  // Categoria vazia é o mesmo que categoria ausente.
  afirmar(
    mapasIguais(doPlano, { ...trocado, SALGADOS: [] }),
    "sessao vazia nao conta como alteracao"
  );

  // O CASO RELATADO: sessao inteira apagada tem que contar como alteracao.
  const semPaes = { BOLOS: [{ codigoPdv: 9, quantidadeUnidades: 4 }] };
  afirmar(!mapasIguais(doPlano, semPaes), "apagar a sessao inteira e' alteracao");

  // As outras formas de editar, que se perdiam do mesmo jeito.
  afirmar(
    !mapasIguais(doPlano, {
      ...doPlano,
      "PÃES E ROSCAS": [
        { codigoPdv: 1, quantidadeUnidades: 500 },
        { codigoPdv: 2, quantidadeUnidades: 20 },
      ],
    }),
    "mudar a quantidade e' alteracao"
  );
  afirmar(
    !mapasIguais(doPlano, {
      ...doPlano,
      "PÃES E ROSCAS": [{ codigoPdv: 1, quantidadeUnidades: 400 }],
    }),
    "remover um item e' alteracao"
  );
  afirmar(
    !mapasIguais(doPlano, { ...doPlano, BISCOITOS: [{ codigoPdv: 7, quantidadeUnidades: 30 }] }),
    "acrescentar uma sessao e' alteracao"
  );

  // --- expiracao ---
  const HOJE = "2026-08-27";
  const chaves = [
    chaveDoRascunho("2026-08-28"), // amanha
    chaveDoRascunho(HOJE),
    chaveDoRascunho("2026-08-26"), // ontem
    chaveDoRascunho("2026-08-25"), // anteontem — ainda no prazo
    chaveDoRascunho("2026-08-20"), // vencido
    "padaria:operador:MATRIZ", // de outra coisa: nao pode ser tocado
    "padaria:fornadas-vistas:MATRIZ:2026-08-20",
  ];
  const vencidos = rascunhosVencidos(chaves, HOJE);
  afirmar(
    vencidos.length === 1 && vencidos[0] === chaveDoRascunho("2026-08-20"),
    `so' o rascunho vencido sai (obtidos: ${vencidos.length})`
  );
  afirmar(
    !vencidos.includes("padaria:operador:MATRIZ") &&
      !vencidos.includes("padaria:fornadas-vistas:MATRIZ:2026-08-20"),
    "chave de outra coisa nunca e' apagada"
  );
  afirmar(
    !vencidos.includes(chaveDoRascunho("2026-08-28")),
    "rascunho de data futura nunca vence — planejar a semana e' uso legitimo"
  );
  // Chave estragada pode ir embora: nao da' para saber de que dia e'.
  afirmar(
    rascunhosVencidos([`padaria:rascunho-cronograma:sexta`], HOJE).length === 1,
    "chave de rascunho com data invalida e' descartada"
  );
}

// ---------------------------------------------------------------
// Ordem da lista de anúncios da Reposição: do mais recente para o mais
// antigo, com o que ainda não saiu no fim (ver src/lib/ordemDaReposicao.ts)
// ---------------------------------------------------------------
{
  const DIA = "2026-08-27";
  const forn = (codigoPdv: number, hora: string, data = DIA): FornadaPronta => ({
    id: `${data}_${codigoPdv}_${hora}`,
    data,
    codigoPdv,
    marcadaPor: "MATRIZ",
    marcadaEm: `${data}T${hora}:00.000Z`,
  });

  // A lista chega na ordem do cronograma: 10, 20, 30, 40.
  const doCronograma = [10, 20, 30, 40];
  const fornadas = [
    forn(10, "06:00"),
    forn(30, "09:30"),
    forn(10, "10:15"), // pão francês sai de novo: 10 volta para o topo
    forn(20, "07:45"),
  ];

  const ordenada = ordenarPorAnuncioRecente(doCronograma, fornadas, DIA);
  afirmar(
    JSON.stringify(ordenada) === JSON.stringify([10, 30, 20, 40]),
    `anunciados do mais recente ao mais antigo, nao anunciado por ultimo (obtido: ${ordenada.join(",")})`
  );

  afirmar(
    ordenarPorAnuncioRecente(doCronograma, fornadas, DIA).length === doCronograma.length,
    "reordenar nao perde nem inventa item"
  );

  // Fornada de OUTRO dia nao pode promover nada: a lista e' do dia corrente.
  const deOntem = [forn(40, "05:00", "2026-08-26")];
  afirmar(
    JSON.stringify(ordenarPorAnuncioRecente(doCronograma, deOntem, DIA)) ===
      JSON.stringify(doCronograma),
    "fornada de outro dia nao muda a ordem de hoje"
  );

  // Sem fornada nenhuma, a ordem do cronograma sobrevive inteira — e' a
  // ordem em que a padaria produz.
  afirmar(
    JSON.stringify(ordenarPorAnuncioRecente(doCronograma, [], DIA)) ===
      JSON.stringify(doCronograma),
    "sem anuncio, mantem a ordem do cronograma"
  );

  // Empate exato de horario: quem vinha antes continua antes (ordem estavel).
  const empate = [forn(20, "08:00"), forn(30, "08:00")];
  afirmar(
    JSON.stringify(ordenarPorAnuncioRecente(doCronograma, empate, DIA)) ===
      JSON.stringify([20, 30, 10, 40]),
    "empate de horario mantem a ordem do cronograma entre os dois"
  );

  const saidas = ultimaSaidaPorProduto(fornadas, DIA);
  afirmar(
    saidas.get(10) === `${DIA}T10:15:00.000Z`,
    "guarda a ULTIMA fornada do produto, nao a primeira"
  );
  afirmar(saidas.get(40) === undefined, "produto sem fornada nao entra no mapa");
}

// ---------------------------------------------------------------
// Rascunho do pedido da filial: chave por loja E data, e a mesma regra
// de expiração do cronograma (ver src/lib/rascunhoPedido.ts)
// ---------------------------------------------------------------
{
  const HOJE_P = "2026-08-27";

  afirmar(
    chaveDoRascunhoPedido("FILIAL_A", "2026-08-28") !==
      chaveDoRascunhoPedido("FILIAL_B", "2026-08-28"),
    "duas filiais no mesmo aparelho nao compartilham rascunho"
  );
  afirmar(
    chaveDoRascunhoPedido("FILIAL_A", "2026-08-28") !==
      chaveDoRascunhoPedido("FILIAL_A", "2026-08-29"),
    "rascunho de um dia nao contamina o do dia seguinte"
  );

  const chavesP = [
    chaveDoRascunhoPedido("FILIAL_A", HOJE_P),
    chaveDoRascunhoPedido("FILIAL_A", "2026-08-25"), // anteontem: no prazo
    chaveDoRascunhoPedido("FILIAL_A", "2026-08-20"), // vencido
    chaveDoRascunhoPedido("FILIAL_B", "2026-08-20"), // vencido, outra loja
    chaveDoRascunhoPedido("FILIAL_A", "2026-09-10"), // futuro: nunca vence
    "padaria:rascunho-cronograma:2026-08-20", // de outra tela: nao pode ir junto
    "padaria:operador:MATRIZ",
  ];
  const vencidosP = rascunhosDePedidoVencidos(chavesP, HOJE_P);
  afirmar(vencidosP.length === 2, `so' os dois vencidos saem (obtidos: ${vencidosP.length})`);
  afirmar(
    !vencidosP.includes("padaria:rascunho-cronograma:2026-08-20") &&
      !vencidosP.includes("padaria:operador:MATRIZ"),
    "chave de outro prefixo nunca e' apagada pela limpeza do pedido"
  );
  afirmar(
    !vencidosP.includes(chaveDoRascunhoPedido("FILIAL_A", "2026-09-10")),
    "rascunho de data futura nunca vence"
  );
  // A loja fica DEPOIS da data na chave: e' o que permite ler a data sem
  // saber o nome da loja.
  afirmar(
    rascunhosDePedidoVencidos(["padaria:rascunho-pedido:sabado:FILIAL_A"], HOJE_P).length === 1,
    "chave de rascunho de pedido com data invalida e' descartada"
  );
}

// ---------------------------------------------------------------
// Ajuste da matriz na lista da filial (ver src/types/pedido.ts)
// ---------------------------------------------------------------
{
  const DIA_A = "2026-08-28";
  const baseDoPedido: PedidoFilial = {
    id: idDoPedido(DIA_A, "FILIAL_A"),
    lojaId: "FILIAL_A",
    data: DIA_A,
    tipo: "diario",
    status: "enviado",
    itens: [
      { codigoPdv: 10, quantidadeUnidades: 150 },
      { codigoPdv: 20, quantidadeUnidades: 30 },
      { codigoPdv: 30, quantidadeUnidades: 12 },
    ],
    criadoPor: "Ana",
    criadoEm: `${DIA_A}T18:00:00.000Z`,
    enviadoEm: `${DIA_A}T18:05:00.000Z`,
  };

  // A matriz corta o 10 para 100 e diz que o 30 nao vem.
  const ajustado = ajustarPedidoPelaMatriz(
    baseDoPedido,
    [
      { codigoPdv: 10, quantidadeUnidades: 100 },
      { codigoPdv: 20, quantidadeUnidades: 30 },
    ],
    "Daniel",
    `${DIA_A}T19:00:00.000Z`
  );
  afirmar(ajustado.itens.length === 2, "item cortado sai da lista a produzir");
  afirmar(
    ajustado.ajusteDaMatriz?.itensOriginais.length === 3,
    "o pedido ORIGINAL da loja continua guardado inteiro"
  );

  const dif = diferencasDoAjuste(ajustado);
  afirmar(dif.length === 2, `so' os itens que mudaram entram na diferenca (obtidos: ${dif.length})`);
  afirmar(
    dif.find((d) => d.codigoPdv === 10)?.pedido === 150 &&
      dif.find((d) => d.codigoPdv === 10)?.confirmado === 100,
    "guarda o que a loja pediu e o que a matriz confirmou"
  );
  afirmar(
    dif.find((d) => d.codigoPdv === 30)?.confirmado === 0,
    "item cortado aparece como confirmado 0 (nao vem)"
  );
  afirmar(
    !dif.some((d) => d.codigoPdv === 20),
    "item que ficou igual nao e' marcado como ajustado"
  );

  // AJUSTAR DE NOVO nao pode transformar o ajuste anterior no "pedido da loja".
  const ajustadoDeNovo = ajustarPedidoPelaMatriz(
    ajustado,
    [{ codigoPdv: 10, quantidadeUnidades: 80 }, { codigoPdv: 20, quantidadeUnidades: 30 }],
    "Daniel",
    `${DIA_A}T19:30:00.000Z`
  );
  afirmar(
    diferencasDoAjuste(ajustadoDeNovo).find((d) => d.codigoPdv === 10)?.pedido === 150,
    "o segundo ajuste continua comparando com o que a LOJA pediu (150), nao com o ajuste anterior"
  );

  // Voltar ao original limpa a marca — senao a filial leria um aviso sobre
  // uma diferenca que nao existe mais.
  const revertido = ajustarPedidoPelaMatriz(
    ajustado,
    baseDoPedido.itens,
    "Daniel",
    `${DIA_A}T20:00:00.000Z`
  );
  afirmar(revertido.ajusteDaMatriz === undefined, "desfazer o ajuste apaga a marca");
  afirmar(diferencasDoAjuste(revertido).length === 0, "sem marca, nao ha diferenca a mostrar");
  afirmar(revertido.itens.length === 3, "desfazer devolve os tres itens da loja");

  // Quantidade zero e' o mesmo que tirar da lista.
  const comZero = ajustarPedidoPelaMatriz(
    baseDoPedido,
    [
      { codigoPdv: 10, quantidadeUnidades: 150 },
      { codigoPdv: 20, quantidadeUnidades: 0 },
      { codigoPdv: 30, quantidadeUnidades: 12 },
    ],
    "Daniel",
    `${DIA_A}T19:00:00.000Z`
  );
  afirmar(
    comZero.itens.length === 2 && diferencasDoAjuste(comZero).length === 1,
    "quantidade zero vira 'nao vem' em vez de item com zero unidades"
  );

  // Pedido sem ajuste nenhum nao produz diferenca.
  afirmar(diferencasDoAjuste(baseDoPedido).length === 0, "pedido intocado nao tem diferenca");

  afirmar(
    itensIguais(
      [{ codigoPdv: 1, quantidadeUnidades: 2 }, { codigoPdv: 2, quantidadeUnidades: 3 }],
      [{ codigoPdv: 2, quantidadeUnidades: 3 }, { codigoPdv: 1, quantidadeUnidades: 2 }]
    ),
    "itensIguais ignora a ordem"
  );
  afirmar(
    !itensIguais([{ codigoPdv: 1, quantidadeUnidades: 2 }], [{ codigoPdv: 1, quantidadeUnidades: 3 }]),
    "itensIguais compara a quantidade"
  );
}

// ---------------------------------------------------------------
// Rascunho do ajuste da matriz: chave por loja e data, prefixo proprio
// ---------------------------------------------------------------
{
  const HOJE_A = "2026-08-27";
  afirmar(
    chaveDoAjuste("FILIAL_A", "2026-08-28") !== chaveDoRascunhoPedido("FILIAL_A", "2026-08-28"),
    "o ajuste da matriz nao divide chave com o rascunho da propria filial"
  );
  const chavesA = [
    chaveDoAjuste("FILIAL_A", "2026-08-20"), // vencido
    chaveDoAjuste("FILIAL_A", HOJE_A),
    chaveDoRascunhoPedido("FILIAL_A", "2026-08-20"), // de outro prefixo
  ];
  const vencidosA = ajustesVencidos(chavesA, HOJE_A);
  afirmar(
    vencidosA.length === 1 && vencidosA[0] === chaveDoAjuste("FILIAL_A", "2026-08-20"),
    "a limpeza do ajuste nao toca no rascunho da filial"
  );
}

// ---------------------------------------------------------------
// Documento continuo: um cabecalho, um rodape (ver gerarImagemLista.ts)
// ---------------------------------------------------------------
{
  const produtosDoc: Produto[] = [10, 20, 30].map((codigoPdv) => ({
    codigoPdv,
    nome: `PRODUTO ${codigoPdv}`,
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
    pesoMedioUnitarioGramas: 50,
  }));

  const blocosDoc = computarBlocosContinuos(
    [
      { rotuloSessao: "Pães e Roscas", itens: [{ codigoPdv: 10, quantidadeUnidades: 100 }] },
      {
        rotuloSessao: "Bolos",
        itens: [
          { codigoPdv: 20, quantidadeUnidades: 10 },
          { codigoPdv: 30, quantidadeUnidades: 5 },
        ],
      },
    ],
    produtosDoc
  );
  afirmar(blocosDoc.length === 2, "uma entrada por sessao");
  afirmar(
    blocosDoc[0].altura ===
      ALTURA_SUBTITULO_SESSAO + ALTURA_LINHA_TESTE + ALTURA_ESPACO_APOS_SESSAO,
    `bloco continuo NAO paga cabecalho nem rodape proprios (obtido: ${blocosDoc[0].altura})`
  );
  afirmar(
    blocosDoc[1].altura > blocosDoc[0].altura,
    "sessao com mais itens e' mais alta"
  );

  // Cabem numa imagem so'.
  afirmar(
    agruparBlocosContinuos(blocosDoc, ALTURA_CABECALHO_DOC, ALTURA_RODAPE_DOC_ASSINADO).length === 1,
    "lista pequena sai em UMA folha"
  );

  // Uma lista enorme divide — e cada folha paga cabecalho e rodape de novo,
  // senao a segunda folha sai orfa, sem data e sem o nome da loja.
  const muitos = Array.from({ length: 40 }, (_, i) => ({
    rotuloSessao: `Sessao ${i}`,
    itens: [{ codigoPdv: 10, quantidadeUnidades: 1 }],
  }));
  const gruposDoc = agruparBlocosContinuos(
    computarBlocosContinuos(muitos, produtosDoc),
    ALTURA_CABECALHO_DOC,
    ALTURA_RODAPE_DOC_ASSINADO
  );
  afirmar(gruposDoc.length > 1, "lista longa demais e' dividida em folhas");
  afirmar(
    gruposDoc.flat().length === 40,
    `nenhuma sessao se perde na divisao (obtidas: ${gruposDoc.flat().length})`
  );
  const maiorFolha = Math.max(
    ...gruposDoc.map(
      (g) =>
        ALTURA_CABECALHO_DOC +
        ALTURA_RODAPE_DOC_ASSINADO +
        g.reduce((soma, b) => soma + b.altura, 0)
    )
  );
  afirmar(maiorFolha <= 4000, `nenhuma folha passa do limite seguro (maior: ${maiorFolha}px)`);
}

// ---------------------------------------------------------------
// Uma tira por LOJA: cabecalho e rodape uma vez, tesoura so' entre lojas
// (ver PecaContinua em src/lib/gerarImagemLista.ts)
// ---------------------------------------------------------------
{
  const produtosPeca: Produto[] = [10, 20, 30].map((codigoPdv) => ({
    codigoPdv,
    nome: `PRODUTO ${codigoPdv}`,
    categoria: "PÃES E ROSCAS",
    unidadeProducao: "un",
    statusVenda: "Ativo",
    ativoNaProducao: true,
    pesoMedioUnitarioGramas: 50,
  }));

  const CAB = ALTURA_CABECALHO_DOC;
  const ROD = ALTURA_RODAPE_DOC_ASSINADO;

  const bobina = montarPecasContinuas(
    [
      {
        rotuloSessao: "Pães e Roscas",
        itens: [{ codigoPdv: 10, quantidadeUnidades: 100 }],
        inicioDeDestino: "Filial Arthur Bernardes",
      },
      { rotuloSessao: "Biscoitos", itens: [{ codigoPdv: 20, quantidadeUnidades: 30 }] },
      {
        rotuloSessao: "Pães e Roscas",
        itens: [{ codigoPdv: 10, quantidadeUnidades: 90 }],
        inicioDeDestino: "Filial Benjamin Constant",
      },
    ],
    produtosPeca,
    "",
    CAB,
    ROD
  );

  afirmar(bobina.length === 2, `duas lojas viram DUAS pecas (obtidas: ${bobina.length})`);
  afirmar(
    bobina[0].titulo === "Filial Arthur Bernardes" && bobina[1].titulo === "Filial Benjamin Constant",
    "cada peca leva o nome completo da loja"
  );
  afirmar(
    bobina[0].blocos.length === 2,
    `os dois setores da primeira loja ficam na MESMA tira (obtidos: ${bobina[0].blocos.length})`
  );
  afirmar(
    bobina[0].altura === CAB + ROD + bobina[0].blocos.reduce((s, b) => s + b.altura, 0),
    "a peca paga cabecalho e rodape UMA vez, nao um por setor"
  );
  afirmar(
    bobina.every((p) => p.folha === undefined),
    "lista pequena nao vira 'folha 1/2'"
  );

  // Sem destino nenhum (a lista de UMA loja) sai uma peca so'.
  const umaLoja = montarPecasContinuas(
    [
      { rotuloSessao: "Pães e Roscas", itens: [{ codigoPdv: 10, quantidadeUnidades: 1 }] },
      { rotuloSessao: "Bolos", itens: [{ codigoPdv: 20, quantidadeUnidades: 2 }] },
    ],
    produtosPeca,
    "Filial Arthur Bernardes",
    CAB,
    ROD
  );
  afirmar(
    umaLoja.length === 1 && umaLoja[0].titulo === "Filial Arthur Bernardes",
    "sem destino marcado, uma peca so', com o titulo recebido"
  );

  // As duas pecas cabem numa imagem — e a tesoura entre elas entra na conta.
  const imagens = agruparPecasEmImagens(bobina);
  afirmar(imagens.length === 1, "as duas lojas cabem na mesma bobina");
  afirmar(imagens[0].length === 2, "e continuam sendo duas pecas dentro dela");

  // Loja grande demais para uma folha: divide, e cada folha se identifica.
  const setoresDemais = Array.from({ length: 40 }, (_, i) => ({
    rotuloSessao: `Setor ${i}`,
    itens: [{ codigoPdv: 10, quantidadeUnidades: 1 }],
    ...(i === 0 ? { inicioDeDestino: "Filial Arthur Bernardes" } : {}),
  }));
  const grandes = montarPecasContinuas(setoresDemais, produtosPeca, "", CAB, ROD);
  afirmar(grandes.length > 1, "destino grande demais vira mais de uma folha");
  afirmar(
    grandes.every((p) => p.folha !== undefined && p.titulo === "Filial Arthur Bernardes"),
    "toda folha se identifica: nome da loja e 'folha N/M'"
  );
  afirmar(
    grandes.reduce((s, p) => s + p.blocos.length, 0) === 40,
    "nenhum setor se perde na divisao"
  );
  afirmar(
    grandes.every((p) => p.altura <= 4000),
    "nenhuma folha passa do limite seguro de canvas"
  );
  afirmar(
    grandes.every((p) => p.totalDoDestino === 40),
    "o rodape conta o DESTINO inteiro, nao so' o que coube na folha"
  );
}

// ---------------------------------------------------------------
// Suprimentos: id normalizado, agrupamento por segmento
// (ver src/types/suprimento.ts)
// ---------------------------------------------------------------
{
  // O id vem do NOME NORMALIZADO: e' o que impede o catalogo de encher de
  // quase-duplicatas quando cada loja digita do seu jeito.
  afirmar(
    idDoSuprimento("Saco Kraft 1kg") === idDoSuprimento("SACO KRAFT 1KG"),
    "caixa diferente e' o mesmo item"
  );
  afirmar(
    idDoSuprimento("Guardanapo  branco") === idDoSuprimento("guardanapo branco"),
    "espaco extra nao cria item novo"
  );
  afirmar(
    idDoSuprimento("Sacola Alça 40x50") === idDoSuprimento("sacola alca 40x50"),
    "acento nao cria item novo"
  );
  afirmar(
    !idDoSuprimento("Saco 1/2 kg").includes("/"),
    "id nunca leva barra — o Firestore usaria como separador de caminho"
  );
  afirmar(
    idDoSuprimento("Detergente") !== idDoSuprimento("Desinfetante"),
    "itens diferentes continuam diferentes"
  );

  afirmar(
    idDoPedidoSuprimentos("2026-08-28", "FILIAL_A") ===
      idDoPedidoSuprimentos("2026-08-28", "FILIAL_A"),
    "reenviar no mesmo dia sobrescreve o mesmo documento"
  );
  afirmar(
    idDoPedidoSuprimentos("2026-08-28", "FILIAL_A") !==
      idDoPedidoSuprimentos("2026-08-28", "FILIAL_B"),
    "cada loja tem a lista dela"
  );

  const catalogo: Suprimento[] = [
    { id: "SACO_KRAFT", nome: "Saco kraft", segmento: "EMBALAGENS", ativo: true },
    { id: "GUARDANAPO", nome: "Guardanapo", segmento: "EMBALAGENS", ativo: true },
    { id: "DETERGENTE", nome: "Detergente", segmento: "LIMPEZA", ativo: true },
  ];
  const grupos = agruparPorSegmento(
    [
      { suprimentoId: "DETERGENTE", quantidade: 4 },
      { suprimentoId: "SACO_KRAFT", quantidade: 10 },
      { suprimentoId: "GUARDANAPO", quantidade: 0 }, // zero nao entra
      { suprimentoId: "ITEM_SUMIDO", quantidade: 2 }, // fora do catalogo
    ],
    catalogo
  );
  afirmar(
    grupos[0].chave === "EMBALAGENS",
    "embalagens vem antes de limpeza — a ordem da compra"
  );
  afirmar(
    grupos[0].itens.length === 1 && grupos[0].itens[0].nome === "Saco kraft",
    "quantidade zero nao entra na lista de compra"
  );
  const outros = grupos.find((g) => g.chave === "OUTROS");
  afirmar(
    outros !== undefined && outros.itens[0].nome === "ITEM_SUMIDO",
    "item fora do catalogo NAO some da lista — cai em Outros"
  );

  afirmar(
    variedadesDoPedidoSuprimentos({
      id: "x",
      lojaId: "FILIAL_A",
      data: "2026-08-28",
      itens: [
        { suprimentoId: "A", quantidade: 3 },
        { suprimentoId: "B", quantidade: 0 },
      ],
      status: "enviado",
      criadoPor: "Ana",
      criadoEm: "2026-08-28T10:00:00.000Z",
    }) === 1,
    "a contagem ignora item zerado"
  );

  // A aba nova precisa ser destino valido de push, senao o toque no aviso
  // nao leva a lugar nenhum.
  afirmar(abaDaUrl("/?aba=suprimentos") === "suprimentos", "push de suprimentos abre a aba certa");
}

// ---------------------------------------------------------------
// Voz: entender a quantidade dita (ver src/lib/vozRespostas.ts)
// ---------------------------------------------------------------
{
  // --- quantidade
  const casos: [string, number | null][] = [
    ["40", 40],
    ["quarenta", 40],
    ["quarenta unidades", 40],
    ["são quarenta", 40],
    ["quarenta e dois", 42],
    ["cento e vinte", 120],
    ["cem", 100],
    ["duzentos e cinquenta", 250],
    ["uma dúzia", 12],
    ["meia dúzia", 6],
    ["duas dúzias", 24],
    ["três dúzias", 36],
    ["dúzia", 12],
    ["12 pães", 12],
    ["não sei", null],
    ["", null],
    ["zero", null],
  ];
  for (const [dito, esperado] of casos) {
    const obtido = entenderQuantidade(dito);
    afirmar(obtido === esperado, `"${dito}" -> ${esperado} (obtido: ${obtido})`);
  }

}

// ---------------------------------------------------------------
// Uma frase inteira vira lista de itens
// (ver src/lib/interpretarPedidoFalado.ts)
// ---------------------------------------------------------------
{
  const CATALOGO = [
    "PAO FRANCES",
    "PAO DE QUEIJO CONGELADO GRANDE",
    "BROA DE FUBA",
    "PALITO VEGETARIANO",
    "SONHO DE CREME",
    "BOLO DE FUBA COM GOIABADA",
  ];

  // O caso da matriz: a frase inteira, com o comando na frente.
  const anuncio = interpretarFrase("anunciar fornada de palito vegetariano", CATALOGO);
  afirmar(
    anuncio.itens.length === 1 && anuncio.itens[0].nome === "PALITO VEGETARIANO",
    "a frase de anuncio vira um item, sem o comando virar produto"
  );
  afirmar(anuncio.itens[0].quantidade === null, "anuncio sem numero nao inventa quantidade");

  // O caso da filial: varios itens numa frase so'.
  const pedido = interpretarFrase("quero 20 pão francês e 10 broa de fubá", CATALOGO);
  afirmar(pedido.itens.length === 2, `dois itens na mesma frase (obtidos: ${pedido.itens.length})`);
  afirmar(
    pedido.itens[0].nome === "PAO FRANCES" && pedido.itens[0].quantidade === 20,
    "primeiro item com a quantidade certa"
  );
  afirmar(
    pedido.itens[1].nome === "BROA DE FUBA" && pedido.itens[1].quantidade === 10,
    "segundo item com a quantidade certa"
  );

  // Virgulas tambem separam, e o numero pode vir por extenso.
  const tres = interpretarFrase("manda 12 sonho de creme, cinco broa de fubá", CATALOGO);
  afirmar(tres.itens.length === 2, "virgula separa itens");
  afirmar(
    tres.itens.find((i) => i.nome === "BROA DE FUBA")?.quantidade === 5,
    "numero por extenso vira numero"
  );

  // O " E " que separa NAO pode partir um nome que contem "DE".
  const comDe = interpretarFrase("15 pão de queijo congelado grande", CATALOGO);
  afirmar(
    comDe.itens.length === 1 && comDe.itens[0].nome === "PAO DE QUEIJO CONGELADO GRANDE",
    "nome com 'DE' nao e' partido"
  );

  // O mesmo produto dito duas vezes SOMA em vez de virar duas linhas.
  const somado = interpretarFrase("10 pão francês e mais 5 pão francês", CATALOGO);
  afirmar(
    somado.itens.length === 1 && somado.itens[0].quantidade === 15,
    `produto repetido soma (obtido: ${JSON.stringify(somado.itens)})`
  );

  // NAO INVENTA: o que nao casa volta como nao reconhecido, e a tela
  // mostra. Um pedido com o produto errado custa uma entrega errada.
  const desconhecido = interpretarFrase("20 rocambole de nutella", CATALOGO);
  afirmar(desconhecido.itens.length === 0, "produto fora do catalogo nao vira item");
  afirmar(
    desconhecido.naoReconhecidos.length === 1,
    "o trecho nao reconhecido volta para a tela mostrar"
  );

  // "PAO" sozinho casaria com dois produtos — abaixo do limite, nao casa
  // com nenhum, porque escolher o pao errado e' pior que perguntar.
  const vago = interpretarFrase("10 pão", CATALOGO);
  afirmar(vago.itens.length === 0, "termo vago demais nao escolhe produto no chute");

  afirmar(interpretarFrase("", CATALOGO).itens.length === 0, "frase vazia nao produz item");

  /**
   * O TRANSCRITOR ANGLICANIZA NOME PRÓPRIO (caso real, ago/2026).
   *
   * "ROSCA TATU" ditado sai como "ROSCA TATTOO" — o reconhecedor conhece
   * a palavra inglesa e não conhece o bicho. Sem tolerância a grafia, o
   * produto ficava impossível de pedir por voz nas duas cadências.
   */
  const COM_TATU = [...CATALOGO, "ROSCA TATU"];
  for (const frase of ["rosca tattoo 100 unidades", "100 unidades de rosca tattoo"]) {
    const lido = interpretarFrase(frase, COM_TATU);
    afirmar(
      lido.itens.length === 1 &&
        lido.itens[0].nome === "ROSCA TATU" &&
        lido.itens[0].quantidade === 100,
      `"${frase}" acha ROSCA TATU com 100 (obtido: ${JSON.stringify(lido)})`
    );
  }

  /**
   * MAS A APROXIMAÇÃO NÃO PODE VIRAR PALPITE. Sem âncora exata, nada
   * casa: um produto errado custa uma entrega errada.
   */
  afirmar(
    interpretarFrase("50 tattoo", COM_TATU).itens.length === 0,
    "so a palavra parecida, sem ancora exata, nao vira produto"
  );
  afirmar(
    interpretarFrase("10 broa", [...CATALOGO, "BOLO"]).itens.every((i) => i.nome !== "BOLO"),
    "BROA nao vira BOLO (distancia 3, fora da folga)"
  );
  afirmar(
    interpretarFrase("10 pao", CATALOGO).itens.length === 0,
    "uma palavra so de um nome composto continua nao casando"
  );

  /**
   * VÁRIOS PRODUTOS NUMA FRASE SÓ, com e sem conectivo — no balcão
   * ninguém dita vírgula. As duas cadências valem.
   */
  for (const frase of [
    "quero 20 pao frances e 10 broa de fuba",
    "20 pao frances 10 broa de fuba",
    "pao frances 20 broa de fuba 10",
  ]) {
    const lido = interpretarFrase(frase, CATALOGO);
    afirmar(
      lido.itens.length === 2 &&
        lido.itens[0].nome === "PAO FRANCES" &&
        lido.itens[0].quantidade === 20 &&
        lido.itens[1].nome === "BROA DE FUBA" &&
        lido.itens[1].quantidade === 10,
      `"${frase}" vira dois itens (obtido: ${JSON.stringify(lido)})`
    );
  }

  /**
   * QUEM PEDE FALA NO PLURAL (ago/2026, defeito relatado em produção).
   *
   * "pães sovados" não achava "PÃO SOVADO": a comparação exigia a
   * palavra idêntica. Agora as duas pontas viram radical.
   */
  const COM_SOVADO = [...CATALOGO, "PAO SOVADO", "PAO DE MEL"];
  for (const frase of [
    "10 paes sovados",
    "10 pao sovado",
    "10 paes sovado",
    "10 paes sovadas",
  ]) {
    const lido = interpretarFrase(frase, COM_SOVADO);
    afirmar(
      lido.itens.length === 1 && lido.itens[0].nome === "PAO SOVADO",
      `"${frase}" acha PAO SOVADO (obtido: ${JSON.stringify(lido)})`
    );
  }

  /** O plural duplo do produto mais vendido da casa. */
  for (const frase of ["20 paes franceses", "20 pães francêses", "20 pao frances"]) {
    const lido = interpretarFrase(frase, COM_SOVADO);
    afirmar(
      lido.itens.length === 1 && lido.itens[0].nome === "PAO FRANCES",
      `"${frase}" acha PAO FRANCES (obtido: ${JSON.stringify(lido)})`
    );
  }

  /** O plural não pode juntar produtos que são diferentes. */
  afirmar(
    interpretarFrase("10 broas de fuba", COM_SOVADO).itens[0]?.nome === "BROA DE FUBA",
    "plural nao confunde BROA DE FUBA com BOLO DE FUBA"
  );
  afirmar(
    interpretarFrase("10 bolos de fuba com goiabada", COM_SOVADO).itens[0]?.nome ===
      "BOLO DE FUBA COM GOIABADA",
    "plural mantem BOLO DE FUBA COM GOIABADA separado de BROA DE FUBA"
  );

  /**
   * APELIDO DO BALCÃO. Em Minas ninguém pede "pão francês": pede pão de
   * sal. O apelido vale no plural, e só quando o destino existe.
   */
  for (const frase of ["30 paes de sal", "30 pao de sal", "30 paozinho"]) {
    const lido = interpretarFrase(frase, COM_SOVADO);
    afirmar(
      lido.itens.length === 1 &&
        lido.itens[0].nome === "PAO FRANCES" &&
        lido.itens[0].quantidade === 30,
      `"${frase}" vira PAO FRANCES com 30 (obtido: ${JSON.stringify(lido)})`
    );
  }
  afirmar(
    interpretarFrase("30 pao de sal", ["BROA DE FUBA"]).itens.length === 0,
    "apelido nao inventa produto: sem PAO FRANCES no catalogo, nao casa nada"
  );
  const cadastroGanha = interpretarFrase("30 pao de sal", [...COM_SOVADO, "PAO DE SAL"]);
  afirmar(
    cadastroGanha.itens.length === 1 && cadastroGanha.itens[0].nome === "PAO DE SAL",
    `cadastro com o nome do apelido ganha do apelido (obtido: ${JSON.stringify(cadastroGanha)})`
  );

  /** Plural e apelido convivem com vários produtos na mesma frase. */
  const frasePlural = interpretarFrase("20 paes de sal e 10 paes sovados", COM_SOVADO);
  afirmar(
    frasePlural.itens.length === 2 &&
      frasePlural.itens[0].nome === "PAO FRANCES" &&
      frasePlural.itens[0].quantidade === 20 &&
      frasePlural.itens[1].nome === "PAO SOVADO" &&
      frasePlural.itens[1].quantidade === 10,
    `apelido e plural juntos na mesma frase (obtido: ${JSON.stringify(frasePlural)})`
  );

  /** A quantidade por extenso não pode ser destruída pelo radical. */
  const extenso = interpretarFrase("duas duzias de paes sovados", COM_SOVADO);
  afirmar(
    extenso.itens.length === 1 && extenso.itens[0].quantidade === 24,
    `"duas duzias" continua 24 (obtido: ${JSON.stringify(extenso)})`
  );
  const porExtenso = interpretarFrase("tres paes sovados", COM_SOVADO);
  afirmar(
    porExtenso.itens.length === 1 && porExtenso.itens[0].quantidade === 3,
    `"tres" continua 3 (obtido: ${JSON.stringify(porExtenso)})`
  );

  /** E a divisão por número não pode partir um nome que traz "de". */
  const queijo = interpretarFrase("10 pao de queijo", CATALOGO);
  afirmar(
    queijo.itens.length === 1 && queijo.itens[0].quantidade === 10,
    `"10 pao de queijo" continua um item so (obtido: ${JSON.stringify(queijo)})`
  );
}

// ===================================================================
// ENTRADA SEM SENHA (provisória) — api/entrar-como-loja.ts
// ===================================================================
{
  console.log("\n--- Entrada sem senha: token personalizado e chave de desligar ---");

  // Chave descartável, gerada aqui: o teste confere FORMATO e ASSINATURA
  // sem rede e sem chegar perto da conta de serviço de verdade.
  const { generateKeyPairSync, createVerify } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const conta = {
    client_email: "teste@projeto.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };

  const AGORA = 1_700_000_000;
  const token = assinarTokenPersonalizado("uid-da-matriz", conta, AGORA);
  const partes = token.split(".");
  afirmar(partes.length === 3, "token personalizado tem tres partes");

  const decodificar = (p: string) =>
    JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  const cabecalho = decodificar(partes[0]);
  const corpo = decodificar(partes[1]);

  afirmar(cabecalho.alg === "RS256", "assinatura RS256, que e o que o Firebase aceita");
  afirmar(corpo.uid === "uid-da-matriz", "o token carrega o UID da loja");
  afirmar(corpo.iss === conta.client_email && corpo.sub === conta.client_email, "iss e sub sao a conta de servico");
  afirmar(
    corpo.aud ===
      "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    "publico-alvo e o Identity Toolkit"
  );
  afirmar(corpo.exp - corpo.iat === 3600, "validade de uma hora, que e o teto do Firebase");

  const conferente = createVerify("RSA-SHA256");
  conferente.update(`${partes[0]}.${partes[1]}`);
  afirmar(
    conferente.verify(publicKey, Buffer.from(partes[2].replace(/-/g, "+").replace(/_/g, "/"), "base64")),
    "a assinatura confere com a chave publica"
  );

  /**
   * A CHAVE DE DESLIGAR. Sem `UIDS_LOJAS`, o recurso está desligado e a
   * tela de login volta a pedir senha sozinha — é assim que a volta atrás
   * acontece sem publicar versão nova.
   */
  /** A lista repetida na função de API não pode divergir da do app. */
  afirmar(
    IDS_DAS_LOJAS.length === LOJAS.length &&
      IDS_DAS_LOJAS.every((id, i) => id === LOJAS[i].id),
    "as lojas da funcao de API sao as mesmas de src/lib/lojas.ts"
  );

  afirmar(lerUidsConfigurados(undefined) === null, "sem a variavel, o recurso fica desligado");
  afirmar(lerUidsConfigurados("   ") === null, "variavel vazia tambem desliga");
  afirmar(lerUidsConfigurados("{isso nao e json") === null, "JSON quebrado desliga, nao explode");
  afirmar(lerUidsConfigurados('{"OUTRA_COISA":"x"}') === null, "UID de loja desconhecida nao vale");
  afirmar(
    lerUidsConfigurados('{"MATRIZ":"abc","FILIAL_ARTHUR_BERNARDES":"  "}')?.MATRIZ === "abc",
    "UID em branco e descartado, o preenchido vale"
  );
  const so = lerUidsConfigurados('{"MATRIZ":"abc","FILIAL_ARTHUR_BERNARDES":"  "}');
  afirmar(
    so !== null && Object.keys(so).length === 1,
    "loja sem UID configurado nao entra sem senha (cai na senha)"
  );
}

// ===================================================================
// COMPROVANTE DA REPOSIÇÃO: "o que já pedi hoje"
// ===================================================================
{
  console.log("\n--- Reposicao: as duas sanfonas da filial ---");

  const HOJE = "2026-08-28";
  const rep = (
    id: string,
    quando: string,
    itens: { codigoPdv: number; quantidadeUnidades: number }[],
    extra: Partial<PedidoFilial> = {}
  ): PedidoFilial =>
    ({
      id,
      lojaId: "FILIAL_ARTHUR_BERNARDES",
      data: HOJE,
      itens,
      status: "enviado",
      tipo: "reposicao",
      criadoPor: "Teste",
      criadoEm: quando,
      enviadoEm: quando,
      ...extra,
    }) as PedidoFilial;

  /**
   * O CASO RELATADO EM PRODUÇÃO: cinco itens ditados, intervalo, mais
   * dois. Nada do primeiro envio pode sumir por causa do segundo.
   */
  const doisEnvios = [
    rep("a", `${HOJE}T09:00:00.000Z`, [
      { codigoPdv: 1, quantidadeUnidades: 20 },
      { codigoPdv: 2, quantidadeUnidades: 10 },
      { codigoPdv: 3, quantidadeUnidades: 6 },
    ]),
    rep("b", `${HOJE}T11:00:00.000Z`, [
      { codigoPdv: 4, quantidadeUnidades: 15 },
      { codigoPdv: 1, quantidadeUnidades: 5 },
    ]),
  ];

  const linhas = linhasDeReposicaoDoDia(doisEnvios, HOJE, "FILIAL_ARTHUR_BERNARDES");
  afirmar(linhas.length === 5, `os dois envios convivem: 5 linhas (obtido: ${linhas.length})`);
  afirmar(
    linhas.some((l) => l.codigoPdv === 2 && l.unidades === 10),
    "o item do PRIMEIRO envio continua na lista depois do segundo"
  );
  afirmar(linhas[0].quando > linhas[4].quando, "a ordem e do mais recente para o mais antigo");
  afirmar(
    linhas.filter((l) => l.codigoPdv === 1).length === 2,
    "o mesmo produto em dois envios rende duas linhas, e nao uma soma"
  );
  afirmar(linhas.every(semRespostaDaMatriz), "sem decisao da matriz, tudo fica sem resposta");

  /** A decisão da matriz move a linha para a sanfona dos concluídos. */
  const decididos = [
    rep("c", `${HOJE}T09:00:00.000Z`, [{ codigoPdv: 5, quantidadeUnidades: 4 }], {
      atendimento: {
        desfecho: "cancelado",
        motivo: "tem bastante desse produto",
        decididoPor: "Matriz",
        decididoEm: `${HOJE}T09:30:00.000Z`,
      },
    } as Partial<PedidoFilial>),
    rep("d", `${HOJE}T10:00:00.000Z`, [{ codigoPdv: 6, quantidadeUnidades: 4 }], {
      atendimento: {
        desfecho: "confirmado",
        decididoPor: "Matriz",
        decididoEm: `${HOJE}T10:30:00.000Z`,
      },
    } as Partial<PedidoFilial>),
    ...doisEnvios,
  ];
  const todas = linhasDeReposicaoDoDia(decididos, HOJE, "FILIAL_ARTHUR_BERNARDES");
  const semResposta = todas.filter(semRespostaDaMatriz);
  const concluidas = todas.filter((l) => !semRespostaDaMatriz(l));
  afirmar(semResposta.length === 5, `5 linhas sem resposta (obtido: ${semResposta.length})`);
  afirmar(concluidas.length === 2, `2 linhas concluidas (obtido: ${concluidas.length})`);
  afirmar(
    concluidas.find((l) => l.codigoPdv === 5)?.motivo === "tem bastante desse produto",
    "a recusa leva o motivo junto"
  );
  afirmar(
    concluidas.find((l) => l.codigoPdv === 6)?.situacao === "confirmado",
    "o aceite aparece como confirmado"
  );
  afirmar(
    concluidas.find((l) => l.codigoPdv === 6)?.motivo === undefined,
    "aceite nao carrega motivo"
  );

  /** Não mistura loja, dia nem o pedido diário. */
  const ruido = [
    ...doisEnvios,
    rep("e", `${HOJE}T12:00:00.000Z`, [{ codigoPdv: 9, quantidadeUnidades: 1 }], {
      lojaId: "FILIAL_BENJAMIN_CONSTANT",
    }),
    rep("f", "2026-08-27T12:00:00.000Z", [{ codigoPdv: 8, quantidadeUnidades: 1 }], {
      data: "2026-08-27",
    }),
    rep("g", `${HOJE}T12:00:00.000Z`, [{ codigoPdv: 7, quantidadeUnidades: 1 }], {
      tipo: undefined,
    }),
  ];
  afirmar(
    linhasDeReposicaoDoDia(ruido, HOJE, "FILIAL_ARTHUR_BERNARDES").length === 5,
    "outra loja, outro dia e o pedido diario ficam de fora"
  );
  afirmar(
    linhasDeReposicaoDoDia([], HOJE, "FILIAL_ARTHUR_BERNARDES").length === 0,
    "sem pedido nenhum, as duas sanfonas ficam vazias"
  );
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
