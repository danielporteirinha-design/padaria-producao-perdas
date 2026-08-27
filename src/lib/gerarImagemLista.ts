/**
 * src/lib/gerarImagemLista.ts
 * ---------------------------------------------------------------
 * Gera UMA imagem PNG só ("fita"), com todas as sessões confirmadas do
 * cronograma empilhadas verticalmente, pronta para impressão térmica
 * (papel de 79mm). Cada sessão repete seu próprio cabeçalho (padaria,
 * data em destaque, nome da sessão) porque o papel é cortado em pedaços
 * depois de impresso — cada pedaço vira um aviso independente, fixado no
 * quadro do respectivo setor.
 *
 * Entre uma sessão e a próxima fica uma faixa de corte: linha pontilhada
 * + ícone de tesoura, espaço suficiente para cortar com uma tesoura comum
 * sem cortar texto de nenhuma das duas sessões.
 *
 * A impressora térmica disponível não tem conexão com internet, então a
 * comunicação não é automática: a imagem é compartilhada via WhatsApp
 * (Web Share API, quando o navegador suporta arquivos) ou baixada, para
 * o usuário imprimir pelo WhatsApp Web/Desktop no PC da empresa.
 */

import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";

// 576px cobre a área útil de impressoras térmicas de 80mm a 203dpi —
// encaixa com folga em papel de 79mm.
const LARGURA_PX = 576;
const MARGEM = 24;
const ALTURA_LINHA = 56;
/** Só para os testes conferirem a conta de altura sem duplicar o número. */
export const ALTURA_LINHA_TESTE = ALTURA_LINHA;
/**
 * 174 e nao 210: saiu a linha "PADARIA PAO DE MEL" do topo de cada bloco
 * (ago/2026). Só funcionario da padaria usa este app e este papel nunca
 * sai da cozinha — a marca ali gastava 36px de bobina, em toda sessao de
 * todo dia, para informar a padaria o nome dela mesma.
 */
const ALTURA_CABECALHO_BLOCO = 174;
/**
 * Rodapé de CADA sessão. Tem duas alturas porque a assinatura ("Montado
 * por: fulano") entra dentro de cada bloco, não só no fim da fita
 * (decisão do dono do negócio, ago/2026): a fita é cortada em pedaços e
 * cada pedaço vai para o quadro de um setor diferente — um pedaço sem
 * nome é um pedaço sem responsável. Antes a assinatura saía uma única
 * vez, no fim, então só o último pedaço cortado ficava assinado.
 */
const ALTURA_RODAPE_BLOCO = 30;
const ALTURA_RODAPE_BLOCO_ASSINADO = 64;
export const ALTURA_FAIXA_CORTE = 90;
/** Faixa preta com o nome do destino, entre os pedidos de duas lojas. */
export const ALTURA_MARCADOR_DESTINO = 120;
/** Rodapé no fim da imagem inteira (contagem de sessões/itens + nome do app). */
export const ALTURA_RODAPE_FINAL = 36;

/* ---------------------------------------------------------------
   FORMATO CONTÍNUO — a lista de UMA loja (ago/2026, pedido do dono do
   negócio: "recomendo que o pedido das filiais venham com um único
   cabeçalho, um único rodapé, e as sessões podem continuar vindo
   separadas").

   POR QUE DOIS FORMATOS, E NÃO UM
   --------------------------------
   O formato cortável repete cabeçalho e data em CADA sessão porque a
   fita da produção é picotada: cada pedaço vai para o quadro de um setor
   diferente, e um pedaço sem data e sem assinatura é um pedaço sem
   contexto e sem responsável.

   A lista de uma loja não é picotada. Ela vai inteira para uma pessoa
   só — quem separa a mercadoria daquela loja. Repetir o cabeçalho ali
   gastava um palmo de bobina por setor e, pior, fazia a mesma lista
   parecer cinco pedidos diferentes empilhados.

   Aqui a data e o nome da loja saem uma vez no alto, os setores viram
   subtítulos dentro do documento, e a assinatura sai uma vez no fim.
   --------------------------------------------------------------- */
/** Margem + título + faixa preta da data. */
export const ALTURA_CABECALHO_DOC = 126;
/** Nome do setor + régua, dentro do documento. */
export const ALTURA_SUBTITULO_SESSAO = 44;
/** Respiro entre o fim de uma sessão e o subtítulo da próxima. */
export const ALTURA_ESPACO_APOS_SESSAO = 14;
export const ALTURA_RODAPE_DOC = 62;
export const ALTURA_RODAPE_DOC_ASSINADO = 96;

// Limite de altura por imagem, deliberadamente conservador (set/2026):
// alguns navegadores móveis (histórico do Safari no iPhone, entre outros)
// recusam ou falham SILENCIOSAMENTE ao gerar um canvas com mais de ~4096px
// numa única dimensão — canvas.toBlob() simplesmente retorna null, sem
// lançar exceção nenhuma, o que aparecia pro operador como "Não foi possível
// gerar a imagem" mesmo tentando de novo (falha determinística, ligada ao
// tamanho do cronograma daquele dia, não passageira). Quando a fita
// completa ultrapassaria esse limite, ela é dividida em mais de uma imagem —
// sempre por sessão inteira, nunca cortando uma sessão ao meio — a mesma
// lógica de "cada pedaço é autossuficiente" já usada entre sessões.
export const ALTURA_MAXIMA_SEGURA_PX = 4000;

/** Erro de domínio — sempre com mensagem apresentável ao operador. */
export class ErroGeracaoImagem extends Error {}

export interface BlocoSessaoImpressao {
  rotuloSessao: string;
  itens: ItemPlanoProducao[];
  /**
   * Marca o início do documento de OUTRO destino dentro da mesma bobina.
   * Quando as duas filiais são impressas de uma vez, a separação entre
   * elas precisa ser inconfundível — misturar o pedido de uma loja com o
   * da outra na hora de despachar é erro caro e silencioso. A faixa de
   * corte comum entre categorias não basta: é a mesma que aparece
   * dezenas de vezes na mesma fita.
   */
  inicioDeDestino?: string;
}

export interface DadosImpressaoFita {
  /**
   * Linha logo abaixo do nome da padaria. Distingue os DOIS documentos
   * que saem da mesma confirmação (ago/2026):
   *
   * - "Lista de Produção" — quantidades TOTAIS por item, para o padeiro
   * - "Separação — Arthur Bernardes" — o que vai para aquela loja, para
   *   quem separa de manhã
   *
   * Um documento só, com o total, deixaria a separação adivinhando; um
   * documento só, por loja, faria o padeiro somar de cabeça.
   */
  titulo: string;
  dataFormatada: string; // já pronta para exibição, ex.: "Quarta-feira, 26/08/2026"
  sessoes: BlocoSessaoImpressao[];
  produtos: Produto[];
  /** Quem montou/confirmou o cronograma — exibido no rodapé para rastreabilidade. */
  montadoPor?: string;
  /**
   * `cortavel` (padrão) — a fita da produção, um cupom por setor, feita
   * para ser picotada e fixada nos quadros da cozinha.
   * `continuo` — a lista de uma loja: um cabeçalho, um rodapé, setores
   * como subtítulos. Ver o bloco de constantes acima.
   */
  formato?: "cortavel" | "continuo";
}

interface LinhaItem {
  nome: string;
  unidades: number;
}

export interface BlocoComputado {
  rotuloSessao: string;
  linhas: LinhaItem[];
  inicioDeDestino?: string;
  /** Altura que este bloco ocupa sozinho (cabeçalho + linhas + rodapé), sem faixa de corte. */
  altura: number;
}

/**
 * Exportado só para teste (ver scripts/verificar_logica.ts) — puro, sem depender de canvas/DOM.
 *
 * `temAssinatura` precisa entrar na conta: com assinatura cada bloco fica
 * mais alto, e é essa altura que decide se a fita cabe em uma imagem só.
 * Se a conta aqui divergir do que desenharBloco() realmente desenha, a
 * divisão em imagens erra e volta o bug do canvas grande demais.
 */
export function computarBlocos(
  sessoes: BlocoSessaoImpressao[],
  produtos: Produto[],
  temAssinatura: boolean
): BlocoComputado[] {
  const alturaRodape = temAssinatura ? ALTURA_RODAPE_BLOCO_ASSINADO : ALTURA_RODAPE_BLOCO;
  return sessoes.map((sessao) => {
    const linhas = linhasDoBloco(sessao.itens, produtos);
    const alturaMarcador = sessao.inicioDeDestino ? ALTURA_MARCADOR_DESTINO : 0;
    const altura =
      alturaMarcador + ALTURA_CABECALHO_BLOCO + Math.max(linhas.length, 1) * ALTURA_LINHA + alturaRodape;
    return { rotuloSessao: sessao.rotuloSessao, linhas, altura, inicioDeDestino: sessao.inicioDeDestino };
  });
}

/**
 * Agrupa os blocos (sessões já com altura calculada) em grupos que cabem sob
 * ALTURA_MAXIMA_SEGURA_PX — cada grupo vira uma imagem. Nunca separa os itens
 * de uma sessão entre duas imagens (só a fronteira entre sessões é um ponto
 * de corte válido). No caso raro de uma única sessão sozinha já ultrapassar
 * o limite, ela fica em um grupo próprio mesmo assim — não tem como dividir
 * uma sessão ao meio sem quebrar a lógica de "cada pedaço é autossuficiente".
 *
 * Exportado só para teste (ver scripts/verificar_logica.ts) — puro, sem
 * depender de canvas/DOM, o que permite cobrir a lógica de divisão que
 * causou o bug original ("Não foi possível gerar a imagem") sem precisar
 * de um navegador de verdade.
 */
export function agruparBlocosEmImagens(blocos: BlocoComputado[]): BlocoComputado[][] {
  const alturaRodapeFinal = ALTURA_RODAPE_FINAL;
  const grupos: BlocoComputado[][] = [];
  let grupoAtual: BlocoComputado[] = [];
  let alturaGrupoAtual = 0;

  for (const bloco of blocos) {
    const alturaFaixaCorte = grupoAtual.length > 0 ? ALTURA_FAIXA_CORTE : 0;
    const alturaSeAdicionar = alturaGrupoAtual + alturaFaixaCorte + bloco.altura + alturaRodapeFinal;

    if (grupoAtual.length > 0 && alturaSeAdicionar > ALTURA_MAXIMA_SEGURA_PX) {
      grupos.push(grupoAtual);
      grupoAtual = [bloco];
      alturaGrupoAtual = bloco.altura;
    } else {
      grupoAtual.push(bloco);
      alturaGrupoAtual += alturaFaixaCorte + bloco.altura;
    }
  }
  if (grupoAtual.length > 0) grupos.push(grupoAtual);
  return grupos;
}

function desenharCanvasParaGrupo(
  grupo: BlocoComputado[],
  titulo: string,
  dataFormatada: string,
  montadoPor: string | undefined,
  numeroImagem: number,
  totalImagens: number
): HTMLCanvasElement {
  const alturaBlocos = grupo.reduce((soma, b) => soma + b.altura, 0);
  const alturaCortes = Math.max(grupo.length - 1, 0) * ALTURA_FAIXA_CORTE;
  const altura = alturaBlocos + alturaCortes + ALTURA_RODAPE_FINAL;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_PX;
  canvas.height = Math.max(altura, 200);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroGeracaoImagem("Este navegador não suporta geração de imagem (canvas 2D indisponível).");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";

  let y = 0;
  grupo.forEach((bloco, indice) => {
    if (bloco.inicioDeDestino) {
      y = desenharMarcadorDeDestino(ctx, y, bloco.inicioDeDestino);
    }
    y = desenharBloco(
      ctx,
      y,
      bloco.rotuloSessao,
      bloco.linhas,
      titulo,
      dataFormatada,
      montadoPor,
      !bloco.inicioDeDestino
    );
    if (indice < grupo.length - 1) {
      y = desenharFaixaDeCorte(ctx, y);
    }
  });

  ctx.textAlign = "center";
  ctx.font = "17px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#000000";
  const totalItens = grupo.reduce((s, b) => s + b.linhas.length, 0);
  // Sem "app Produção & Perdas": o papel fica na cozinha da própria
  // padaria, e quem o lê já sabe de onde ele veio.
  const rotuloContagem =
    totalImagens > 1
      ? `${grupo.length} sessão(ões) · ${totalItens} itens · imagem ${numeroImagem}/${totalImagens}`
      : `${grupo.length} sessão(ões) · ${totalItens} itens`;
  ctx.fillText(rotuloContagem, LARGURA_PX / 2, y + 10);
  // A assinatura NÃO se repete aqui: ela já sai no rodapé de cada sessão
  // (ver desenharBloco). Repetir no fim só assinaria de novo o último
  // pedaço cortado, que é justamente o único que já estava assinado antes.

  return canvas;
}

/**
 * Gera a fita de produção como uma OU MAIS imagens, conforme necessário para
 * ficar dentro do limite seguro de altura de canvas (ver ALTURA_MAXIMA_SEGURA_PX
 * acima). No caso comum (cronograma do dia dentro do limite) retorna um único
 * canvas, igual ao comportamento anterior — a divisão só entra em ação quando
 * o total de sessões/itens do dia realmente exigir.
 */
export function gerarCanvasesFita(dados: DadosImpressaoFita): HTMLCanvasElement[] {
  if (dados.formato === "continuo") return gerarCanvasesContinuos(dados);

  const temAssinatura = Boolean(dados.montadoPor);
  const blocos = computarBlocos(dados.sessoes, dados.produtos, temAssinatura);
  const grupos = agruparBlocosEmImagens(blocos);
  return grupos.map((grupo, indice) =>
    desenharCanvasParaGrupo(
      grupo,
      dados.titulo,
      dados.dataFormatada,
      dados.montadoPor,
      indice + 1,
      grupos.length
    )
  );
}

/* =================================================================
   FORMATO CONTÍNUO
   ================================================================= */

export interface BlocoContinuo {
  rotuloSessao: string;
  linhas: LinhaItem[];
  /** Subtítulo + linhas + respiro. Não inclui cabeçalho nem rodapé. */
  altura: number;
}

/**
 * Exportado só para teste (ver scripts/verificar_logica.ts) — puro, sem
 * canvas nem DOM.
 *
 * Cada bloco aqui carrega SÓ o que é dele: o subtítulo do setor e as
 * linhas. Cabeçalho e rodapé pertencem ao documento, não à sessão — é
 * exatamente essa a diferença para o formato cortável, e é por isso que
 * a conta de altura é outra.
 */
export function computarBlocosContinuos(
  sessoes: BlocoSessaoImpressao[],
  produtos: Produto[]
): BlocoContinuo[] {
  return sessoes.map((sessao) => {
    const linhas = linhasDoBloco(sessao.itens, produtos);
    return {
      rotuloSessao: sessao.rotuloSessao,
      linhas,
      altura:
        ALTURA_SUBTITULO_SESSAO +
        Math.max(linhas.length, 1) * ALTURA_LINHA +
        ALTURA_ESPACO_APOS_SESSAO,
    };
  });
}

/**
 * Divide os blocos em imagens que caibam sob ALTURA_MAXIMA_SEGURA_PX.
 *
 * CADA IMAGEM PAGA CABEÇALHO E RODAPÉ. Não é desperdício: uma segunda
 * folha sem a data e sem o nome da loja é uma folha órfã, e quem separa
 * de manhã tem duas na mão sem saber de quem é a segunda. Por isso as
 * duas alturas entram na conta de toda imagem, e não só da primeira.
 *
 * Nunca parte uma sessão ao meio. Sessão sozinha maior que o limite fica
 * numa imagem própria mesmo assim — dividir uma sessão exigiria repetir
 * o subtítulo, e aí o setor apareceria duas vezes na mesma lista.
 *
 * Exportado só para teste — puro.
 */
export function agruparBlocosContinuos(
  blocos: BlocoContinuo[],
  alturaCabecalho: number,
  alturaRodape: number
): BlocoContinuo[][] {
  const disponivel = ALTURA_MAXIMA_SEGURA_PX - alturaCabecalho - alturaRodape;
  const grupos: BlocoContinuo[][] = [];
  let grupoAtual: BlocoContinuo[] = [];
  let alturaGrupo = 0;

  for (const bloco of blocos) {
    if (grupoAtual.length > 0 && alturaGrupo + bloco.altura > disponivel) {
      grupos.push(grupoAtual);
      grupoAtual = [bloco];
      alturaGrupo = bloco.altura;
    } else {
      grupoAtual.push(bloco);
      alturaGrupo += bloco.altura;
    }
  }
  if (grupoAtual.length > 0) grupos.push(grupoAtual);
  return grupos;
}

function gerarCanvasesContinuos(dados: DadosImpressaoFita): HTMLCanvasElement[] {
  const alturaRodape = dados.montadoPor ? ALTURA_RODAPE_DOC_ASSINADO : ALTURA_RODAPE_DOC;
  const blocos = computarBlocosContinuos(dados.sessoes, dados.produtos);
  const grupos = agruparBlocosContinuos(blocos, ALTURA_CABECALHO_DOC, alturaRodape);
  const totalItens = blocos.reduce((soma, b) => soma + b.linhas.length, 0);

  return grupos.map((grupo, indice) =>
    desenharDocumentoContinuo(
      grupo,
      dados.titulo,
      dados.dataFormatada,
      dados.montadoPor,
      alturaRodape,
      indice + 1,
      grupos.length,
      totalItens
    )
  );
}

function desenharDocumentoContinuo(
  grupo: BlocoContinuo[],
  titulo: string,
  dataFormatada: string,
  montadoPor: string | undefined,
  alturaRodape: number,
  numeroImagem: number,
  totalImagens: number,
  totalItensDoDocumento: number
): HTMLCanvasElement {
  const altura =
    ALTURA_CABECALHO_DOC + grupo.reduce((soma, b) => soma + b.altura, 0) + alturaRodape;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_PX;
  canvas.height = Math.max(altura, 200);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroGeracaoImagem("Este navegador não suporta geração de imagem (canvas 2D indisponível).");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";

  // --- Cabeçalho, uma vez só (ALTURA_CABECALHO_DOC)
  let y = MARGEM;
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(titulo, LARGURA_PX / 2, y);
  y += 34;

  ctx.fillRect(MARGEM, y, LARGURA_PX - MARGEM * 2, 50);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(dataFormatada, LARGURA_PX / 2, y + 13);
  y += 68;

  // --- Sessões, como subtítulos dentro do mesmo documento
  for (const bloco of grupo) {
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillText(bloco.rotuloSessao.toUpperCase(), MARGEM, y);
    y += 30;
    linhaHorizontal(ctx, y, "#000000", 2);
    y += ALTURA_SUBTITULO_SESSAO - 30;

    if (bloco.linhas.length === 0) {
      ctx.font = "18px system-ui, -apple-system, sans-serif";
      ctx.fillText("Nenhum item nesta sessão.", MARGEM, y);
      y += ALTURA_LINHA;
    }
    for (const linha of bloco.linhas) {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(linha.nome, MARGEM, y, LARGURA_PX - MARGEM * 2 - 120);
      ctx.textAlign = "right";
      ctx.fillText(`${formatarUnidades(linha.unidades)} un`, LARGURA_PX - MARGEM, y);
      y += ALTURA_LINHA - 16;
      linhaHorizontal(ctx, y, "#000000", 1);
      y += 16;
    }
    y += ALTURA_ESPACO_APOS_SESSAO;
  }

  // --- Rodapé, uma vez só
  linhaHorizontal(ctx, y, "#000000", 2);
  y += 12;
  ctx.textAlign = "center";
  ctx.fillStyle = "#000000";
  ctx.font = "18px system-ui, -apple-system, sans-serif";
  const itensNesta = grupo.reduce((soma, b) => soma + b.linhas.length, 0);
  const contagem =
    totalImagens > 1
      ? `${itensNesta} de ${totalItensDoDocumento} itens · folha ${numeroImagem}/${totalImagens}`
      : `${totalItensDoDocumento} ${totalItensDoDocumento === 1 ? "item" : "itens"}`;
  ctx.fillText(contagem, LARGURA_PX / 2, y);

  if (montadoPor) {
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillText(`Montado por: ${montadoPor}`, LARGURA_PX / 2, y + 26);
  }

  return canvas;
}

function linhasDoBloco(itens: ItemPlanoProducao[], produtos: Produto[]): LinhaItem[] {
  return itens
    .map((item) => ({
      nome: produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? `#${item.codigoPdv}`,
      unidades: item.quantidadeUnidades,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Desenha um bloco de sessão (cabeçalho + data + itens) a partir de yInicial; retorna o y logo após o bloco. */
function desenharBloco(
  ctx: CanvasRenderingContext2D,
  yInicial: number,
  rotuloSessao: string,
  linhas: LinhaItem[],
  titulo: string,
  dataFormatada: string,
  montadoPor: string | undefined,
  /**
   * UMA faixa preta por pedaço de papel, nunca duas.
   *
   * Na fita de separação o nome da loja já sai numa faixa preta logo
   * acima; repetir o mesmo peso na data punha duas barras pretas a menos
   * de 120px uma da outra. Duas coisas gritando ao mesmo tempo é o mesmo
   * que nenhuma gritar — e gasta o dobro de tinta térmica na bobina.
   *
   * Quem manda é a identidade daquele papel: na fita de separação é a
   * LOJA de destino; na lista de produção é a DATA.
   */
  dataEmDestaque = true
): number {
  let y = yInicial + MARGEM;

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(titulo, LARGURA_PX / 2, y);
  y += 34;

  const alturaCaixaData = 50;
  if (dataEmDestaque) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(MARGEM, y, LARGURA_PX - MARGEM * 2, alturaCaixaData);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(dataFormatada, LARGURA_PX / 2, y + 13);
  } else {
    // Sem faixa: negrito e uma régua embaixo dão hierarquia suficiente
    // quando a loja de destino já levou o destaque forte.
    ctx.fillStyle = "#000000";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(dataFormatada, LARGURA_PX / 2, y + 13);
    linhaHorizontal(ctx, y + 46, "#000000", 2);
  }
  y += alturaCaixaData + 18;

  ctx.fillStyle = "#000000";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(rotuloSessao.toUpperCase(), LARGURA_PX / 2, y);
  y += 32;

  linhaHorizontal(ctx, y, "#000000", 2);
  y += 14;

  ctx.textAlign = "left";
  if (linhas.length === 0) {
    ctx.font = "18px system-ui, -apple-system, sans-serif";
    ctx.fillText("Nenhum item nesta sessão.", MARGEM, y);
    y += ALTURA_LINHA;
  }
  for (const linha of linhas) {
    ctx.fillStyle = "#000000";
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(linha.nome, MARGEM, y, LARGURA_PX - MARGEM * 2 - 120);
    ctx.textAlign = "right";
    ctx.fillText(`${formatarUnidades(linha.unidades)} un`, LARGURA_PX - MARGEM, y);
    y += ALTURA_LINHA - 16;
    // Preto: um #ccc de 1px some por completo no corte de limiar da
    // termica, e a lista sai sem separacao nenhuma entre os itens.
    linhaHorizontal(ctx, y, "#000000", 1);
    y += 16;
  }

  /**
   * PRETO PURO E FONTE MAIOR — nao e' preferencia estetica.
   *
   * A termica imprime 1 BIT: cada ponto sai preto ou nao sai. Um cinza
   * #555 vira um chuvisco de pontos soltos depois do corte de limiar, e
   * a 14px isso destroi a palavra — foi por isso que "Montado por" saiu
   * ilegivel no papel (ago/2026). Na tela o cinza parecia discreto; no
   * papel ele nao existe.
   */
  ctx.textAlign = "center";
  ctx.font = "18px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.fillText(`${linhas.length} ${linhas.length === 1 ? "item" : "itens"} nesta sessão`, LARGURA_PX / 2, y + 6);

  // Assinatura por sessão: este pedaço vai ser cortado e fixado sozinho no
  // quadro de um setor, então precisa sair com responsável identificado.
  // A altura somada aqui TEM que bater com ALTURA_RODAPE_BLOCO_ASSINADO
  // usada em computarBlocos() — senão a divisão em imagens erra.
  if (montadoPor) {
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#000000";
    ctx.fillText(`Montado por: ${montadoPor}`, LARGURA_PX / 2, y + 30);
    y += ALTURA_RODAPE_BLOCO_ASSINADO;
  } else {
    y += ALTURA_RODAPE_BLOCO;
  }

  return y;
}

/**
 * Faixa preta cheia com o nome da loja, marcando onde começa o pedido de
 * OUTRO destino na mesma bobina. É deliberadamente mais pesada que a
 * faixa de corte comum: quem despacha percorre metros de papel e precisa
 * enxergar essa transição sem procurar.
 */
function desenharMarcadorDeDestino(
  ctx: CanvasRenderingContext2D,
  yInicial: number,
  nomeDestino: string
): number {
  let y = yInicial + 14;

  // Tesoura de corte, mais larga que a comum, avisando que aqui separa.
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 8]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(LARGURA_PX, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;

  ctx.textAlign = "center";
  ctx.fillStyle = "#000000";
  ctx.font = "20px system-ui, -apple-system, sans-serif";
  ctx.fillText("✂", LARGURA_PX / 2, y - 12);
  y += 16;

  const alturaFaixa = 54;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, y, LARGURA_PX, alturaFaixa);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
  ctx.fillText(nomeDestino.toUpperCase(), LARGURA_PX / 2, y + 14);
  y += alturaFaixa;

  return yInicial + ALTURA_MARCADOR_DESTINO;
}

/** Linha pontilhada + ícone de tesoura, marcando onde cortar entre duas sessões. */
function desenharFaixaDeCorte(ctx: CanvasRenderingContext2D, yInicial: number): number {
  const yLinha = yInicial + ALTURA_FAIXA_CORTE / 2;

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(MARGEM, yLinha);
  ctx.lineTo(LARGURA_PX - MARGEM, yLinha);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";
  ctx.font = "22px system-ui, -apple-system, sans-serif";
  // Fundo branco atrás do ícone para "cortar" a linha pontilhada visualmente.
  const larguraFundo = 40;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(LARGURA_PX / 2 - larguraFundo / 2, yLinha - 16, larguraFundo, 32);
  ctx.fillStyle = "#000000";
  ctx.fillText("✂", LARGURA_PX / 2, yLinha + 1);

  ctx.font = "16px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#000000";
  ctx.fillText("corte aqui", LARGURA_PX / 2, yLinha + 26);

  ctx.textBaseline = "top";
  return yInicial + ALTURA_FAIXA_CORTE;
}

function linhaHorizontal(ctx: CanvasRenderingContext2D, y: number, cor: string, largura: number) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = largura;
  ctx.beginPath();
  ctx.moveTo(MARGEM, y);
  ctx.lineTo(LARGURA_PX - MARGEM, y);
  ctx.stroke();
}

function formatarUnidades(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function canvasParaArquivo(canvas: HTMLCanvasElement, nomeArquivo: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(
          new ErroGeracaoImagem(
            `Não foi possível gerar a imagem "${nomeArquivo}" — o navegador recusou converter o desenho em arquivo.`
          )
        );
        return;
      }
      resolve(new File([blob], nomeArquivo, { type: "image/png" }));
    }, "image/png");
  });
}

/** Converte cada canvas gerado por gerarCanvasesFita() num arquivo PNG, numerando o nome quando há mais de um. */
export async function canvasesParaArquivos(canvases: HTMLCanvasElement[], nomeArquivoBase: string): Promise<File[]> {
  return Promise.all(
    canvases.map((canvas, indice) =>
      canvasParaArquivo(
        canvas,
        canvases.length > 1 ? `${nomeArquivoBase}-parte${indice + 1}de${canvases.length}.png` : `${nomeArquivoBase}.png`
      )
    )
  );
}

export type ResultadoCompartilhamento = "compartilhado" | "baixado" | "baixar_manualmente";

/**
 * Tenta compartilhar um ou mais arquivos via Web Share API (abre o seletor
 * do sistema, incluindo WhatsApp, em navegadores Android/iOS que suportam
 * arquivos). Se disponível, um único arquivo é baixado automaticamente como
 * alternativa (ação de um clique só, sempre segura); se forem VÁRIOS
 * arquivos e o compartilhamento não estiver disponível, retorna
 * "baixar_manualmente" em vez de tentar baixar tudo sozinho — ver o
 * comentário abaixo sobre por que o download automático de vários arquivos
 * não é confiável.
 *
 * Não existe uma forma confiável de baixar VÁRIOS arquivos automaticamente
 * disparando vários cliques programáticos em sequência: testado e
 * confirmado que navegadores (a partir de alguns segundos de intervalo
 * inclusive) descartam ou mesclam downloads automáticos além do primeiro —
 * o operador via só 1 das N imagens baixada, sem erro nenhum na tela. Por
 * isso, quando o compartilhamento não é uma opção, a interface (ver
 * ExportarFita.tsx) mostra um botão "Baixar imagem N" por imagem — cada
 * download então é o resultado direto de um clique de verdade do operador,
 * o único jeito garantido de funcionar em qualquer navegador.
 */
export async function compartilharOuBaixar(arquivos: File[]): Promise<ResultadoCompartilhamento> {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: arquivos })) {
    try {
      await nav.share({ files: arquivos, title: arquivos[0]?.name });
      return "compartilhado";
    } catch {
      // Usuário cancelou o seletor de compartilhamento — cai para download.
    }
  }

  if (arquivos.length > 1) return "baixar_manualmente";

  baixarArquivo(arquivos[0]);
  return "baixado";
}

/** Baixa UM arquivo — seguro para chamar tanto automaticamente (caso de 1 arquivo só) quanto a partir de um clique direto do operador. */
export function baixarArquivo(arquivo: File): void {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
