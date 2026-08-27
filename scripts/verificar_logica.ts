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
  idDoPedido,
  reposicaoEstaPendente,
  totalDoPedido,
  type PedidoFilial,
} from "../src/types/pedido";
import { fornadasNaoVistas, marcarFornadasComoVistas } from "../src/lib/fornadasVistas";
import { comoLiberarNotificacao, plataformaAtual } from "../src/lib/plataforma";
import { contemBusca, paraBusca } from "../src/lib/texto";
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

  // --- O filtro de loja recorta as PERDAS, nunca os PLANOS ---
  // Produção é sempre da matriz. Se o filtro de filial recortasse os planos,
  // o denominador iria a zero e a taxa da filial apareceria como "—" para
  // sempre — exatamente o número que o dono do negócio quer ver.
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
      totais.produzido === 200,
      `filtro de filial preserva o denominador da matriz (obtido: ${totais.produzido})`
    );
    afirmar(
      totais.perdido === 30 && totais.taxaPerda === 15,
      `filtro de filial isola a perda da filial: 30/200 = 15% (obtido: ${totais.taxaPerda}%)`
    );

    const semFiltro = calcularTotais(recortar(catalogo, planos, perdas, HOJE, { dias: 30 }));
    afirmar(semFiltro.perdido === 40, "sem filtro de loja, as perdas das três lojas somam");
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
}

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
