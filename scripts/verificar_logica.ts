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
// Caso 8: calcularCandidatosPerda — produto SEM prazoValidadeDias
// cadastrado só aceita o plano do próprio dia (comportamento anterior,
// mais restritivo — nunca inventa um prazo que ninguém confirmou).
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

  const semValidadeOntem = calcularCandidatosPerda("2026-08-24", [paoSemValidade], [planoDeOntem]);
  afirmar(
    semValidadeOntem.length === 0,
    "sem prazoValidadeDias: plano de ontem é rejeitado (não pode inventar um prazo)"
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
    precoCusto: 5,
    precoVenda: 12,
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
    precoCusto: 5,
    precoVenda: 12,
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
    precoCusto: 0.2,
    precoVenda: 0.5,
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
    precoCusto: 1,
    precoVenda: 3,
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
    precoCusto: 1,
    precoVenda: 3,
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
    precoCusto: 1,
    precoVenda: 2,
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
    precoCusto: 1,
    precoVenda: 2,
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
    precoCusto: 1,
    precoVenda: 2,
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
    precoCusto: 1,
    precoVenda: 2,
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

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : `${falhas} CASO(S) FALHARAM`}`);
process.exit(falhas === 0 ? 0 : 1);
