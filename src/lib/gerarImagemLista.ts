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
 * Cabeçalho de cada cupom: nome do destino, data e nome do setor.
 *
 * Já foi 210 e caiu para 174 quando saiu a linha "PADARIA PAO DE MEL" do
 * topo de cada bloco (ago/2026) — só funcionário da padaria usa este app
 * e este papel nunca sai da cozinha; a marca ali gastava 36px de bobina,
 * em toda sessão de todo dia, para informar a padaria o nome dela mesma.
 *
 * Subiu para 186 (ago/2026, pedido do dono do negócio) quando o destino,
 * a data e o setor ganharam corpo. O papel ficou um pouco mais alto e
 * passou a ser lido de longe, que é como ele é lido de verdade: pregado
 * no quadro, com o padeiro de mãos ocupadas a um metro de distância.
 */
const ALTURA_CABECALHO_BLOCO = 186;

/**
 * O vermelho da logomarca, amostrado do arquivo original (ver
 * scripts/gerar_icones.py).
 *
 * NA TÉRMICA ELE SAI PRETO, e é de propósito: a impressora imprime 1 bit
 * por ponto, e este vermelho é escuro o bastante (luminância ~63 de 255)
 * para cair do lado preto do corte de limiar, sólido, sem chuvisco. Na
 * tela e no WhatsApp — para onde a mesma imagem também vai — ele sai
 * vermelho. Um só arquivo serve aos dois destinos.
 */
const VERMELHO_MARCA = "#c40027";
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
/** Margem + nome da loja + data grande + régua. */
export const ALTURA_CABECALHO_DOC = 132;
/** Linha extra somada ao cabeçalho quando `subtitulo` está presente (ver `desenharPeca`). */
export const ALTURA_SUBTITULO_CABECALHO = 32;
/** Nome do setor, centrado e maior que os produtos, + régua. */
export const ALTURA_SUBTITULO_SESSAO = 52;
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
   * Linhas já resolvidas, para o que NÃO é produto de padaria.
   *
   * A lista de suprimentos (embalagens, material de limpeza) não tem
   * `codigoPdv` — os itens vivem em outra coleção, com id de texto (ver
   * src/types/suprimento.ts). Em vez de inventar códigos falsos só para
   * caber neste formato, quem já sabe o nome entrega o nome pronto.
   */
  linhasProntas?: { nome: string; unidades: number }[];
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
  /**
   * Linha extra, menor, logo ABAIXO do título — só no formato `continuo`
   * (ex.: "Pedido de Reposição", no comprovante de reposição da matriz
   * para a filial). Ausente nos demais documentos (Lista de Produção,
   * Suprimentos), que não ganham essa segunda linha no cabeçalho.
   */
  subtitulo?: string;
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
    const linhas = sessao.linhasProntas ?? linhasDoBloco(sessao.itens, produtos);
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
 * Uma PEÇA é um pedaço de papel autossuficiente: cabeçalho (destino +
 * data), os blocos de setor, e um rodapé. É o que alguém arranca da
 * bobina e leva para separar a mercadoria de uma loja.
 *
 * A bobina das duas filiais é uma sequência de peças com uma faixa de
 * corte entre elas — e SÓ entre elas (ago/2026, pedido do dono do
 * negócio: "os segmentos dos produtos das filiais podem ser impressos em
 * uma mesma tira de papel, não precisa cortar a etiqueta entre cada
 * segmento").
 *
 * Antes cada SETOR virava um cupom completo, com cabeçalho, data e
 * rodapé próprios, e a bobina de uma loja com cinco setores saía como
 * cinco recibos empilhados. Quem separa não trabalha assim: ele leva um
 * papel por loja e percorre os setores nele.
 */
export interface PecaContinua {
  /** O destino, em destaque no alto: "Filial Arthur Bernardes". */
  titulo: string;
  /** Ver `DadosImpressaoFita.subtitulo` — mesma linha, repetida em cada peça do lote. */
  subtitulo?: string;
  blocos: BlocoContinuo[];
  /** Itens do destino inteiro — o rodapé conta o todo, não a folha. */
  totalDoDestino: number;
  /** Preenchido só quando o destino não coube em uma folha. */
  folha?: { numero: number; total: number };
  /** Cabeçalho + blocos + rodapé. */
  altura: number;
}

/**
 * Exportado só para teste (ver scripts/verificar_logica.ts) — puro, sem
 * canvas nem DOM.
 *
 * Cada bloco aqui carrega SÓ o que é dele: o subtítulo do setor e as
 * linhas. Cabeçalho e rodapé pertencem à peça, não ao setor — é
 * exatamente essa a diferença para o formato cortável, e é por isso que
 * a conta de altura é outra.
 */
export function computarBlocosContinuos(
  sessoes: BlocoSessaoImpressao[],
  produtos: Produto[]
): BlocoContinuo[] {
  return sessoes.map((sessao) => {
    const linhas = sessao.linhasProntas ?? linhasDoBloco(sessao.itens, produtos);
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
 * Divide os blocos de UM destino em folhas que caibam sob
 * ALTURA_MAXIMA_SEGURA_PX.
 *
 * CADA FOLHA PAGA CABEÇALHO E RODAPÉ. Não é desperdício: uma segunda
 * folha sem a data e sem o nome da loja é uma folha órfã, e quem separa
 * de manhã tem duas na mão sem saber de quem é a segunda.
 *
 * Nunca parte um setor ao meio. Setor sozinho maior que o limite fica
 * numa folha própria mesmo assim — dividir exigiria repetir o subtítulo,
 * e aí o setor apareceria duas vezes na mesma lista.
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

/**
 * Monta as peças a partir das sessões, quebrando A CADA DESTINO NOVO.
 *
 * `inicioDeDestino` é o que marca "daqui para baixo é outra loja" (ver
 * BlocoSessaoImpressao). Sem nenhum destino marcado — a lista de uma
 * loja só — sai uma peça com o título recebido.
 *
 * Exportado só para teste — puro.
 */
export function montarPecasContinuas(
  sessoes: BlocoSessaoImpressao[],
  produtos: Produto[],
  tituloPadrao: string,
  alturaCabecalho: number,
  alturaRodape: number,
  subtituloPadrao?: string
): PecaContinua[] {
  const destinos: { titulo: string; sessoes: BlocoSessaoImpressao[] }[] = [];
  for (const sessao of sessoes) {
    if (destinos.length === 0 || sessao.inicioDeDestino) {
      destinos.push({ titulo: sessao.inicioDeDestino ?? tituloPadrao, sessoes: [] });
    }
    destinos[destinos.length - 1].sessoes.push(sessao);
  }

  const pecas: PecaContinua[] = [];
  for (const destino of destinos) {
    const blocos = computarBlocosContinuos(destino.sessoes, produtos);
    const total = blocos.reduce((soma, b) => soma + b.linhas.length, 0);
    const folhas = agruparBlocosContinuos(blocos, alturaCabecalho, alturaRodape);
    folhas.forEach((folha, indice) => {
      pecas.push({
        titulo: destino.titulo,
        subtitulo: subtituloPadrao,
        blocos: folha,
        totalDoDestino: total,
        folha: folhas.length > 1 ? { numero: indice + 1, total: folhas.length } : undefined,
        altura:
          alturaCabecalho + folha.reduce((soma, b) => soma + b.altura, 0) + alturaRodape,
      });
    });
  }
  return pecas;
}

/**
 * Empacota as peças em imagens. Duas peças na mesma imagem ficam
 * separadas por uma faixa de corte — a única tesoura do papel inteiro,
 * exatamente onde uma loja termina e a outra começa.
 *
 * Exportado só para teste — puro.
 */
export function agruparPecasEmImagens(pecas: PecaContinua[]): PecaContinua[][] {
  const imagens: PecaContinua[][] = [];
  let atual: PecaContinua[] = [];
  let altura = 0;

  for (const peca of pecas) {
    const corte = atual.length > 0 ? ALTURA_FAIXA_CORTE : 0;
    if (atual.length > 0 && altura + corte + peca.altura > ALTURA_MAXIMA_SEGURA_PX) {
      imagens.push(atual);
      atual = [peca];
      altura = peca.altura;
    } else {
      atual.push(peca);
      altura += corte + peca.altura;
    }
  }
  if (atual.length > 0) imagens.push(atual);
  return imagens;
}

function gerarCanvasesContinuos(dados: DadosImpressaoFita): HTMLCanvasElement[] {
  const alturaRodape = dados.montadoPor ? ALTURA_RODAPE_DOC_ASSINADO : ALTURA_RODAPE_DOC;
  // Com subtítulo, o cabeçalho ganha uma linha a mais — soma-se aqui, uma
  // vez só, para a paginação (agruparBlocosContinuos) já contar com o
  // espaço certo, em vez de estourar a folha no meio de um setor.
  const alturaCabecalho =
    ALTURA_CABECALHO_DOC + (dados.subtitulo ? ALTURA_SUBTITULO_CABECALHO : 0);
  const pecas = montarPecasContinuas(
    dados.sessoes,
    dados.produtos,
    dados.titulo,
    alturaCabecalho,
    alturaRodape,
    dados.subtitulo
  );
  return agruparPecasEmImagens(pecas).map((imagem) =>
    desenharImagemContinua(imagem, dados.dataFormatada, dados.montadoPor, alturaRodape)
  );
}

function desenharImagemContinua(
  pecas: PecaContinua[],
  dataFormatada: string,
  montadoPor: string | undefined,
  alturaRodape: number
): HTMLCanvasElement {
  const altura =
    pecas.reduce((soma, p) => soma + p.altura, 0) +
    Math.max(pecas.length - 1, 0) * ALTURA_FAIXA_CORTE;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_PX;
  canvas.height = Math.max(altura, 200);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroGeracaoImagem("Este navegador não suporta geração de imagem (canvas 2D indisponível).");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";

  let y = 0;
  pecas.forEach((peca, indice) => {
    y = desenharPeca(ctx, y, peca, dataFormatada, montadoPor, alturaRodape);
    // A ÚNICA tesoura do papel fica aqui: entre uma loja e a próxima.
    if (indice < pecas.length - 1) y = desenharFaixaDeCorte(ctx, y);
  });

  return canvas;
}

/** Uma peça inteira: cabeçalho, setores e rodapé. Devolve o y do fim. */
function desenharPeca(
  ctx: CanvasRenderingContext2D,
  yInicial: number,
  peca: PecaContinua,
  dataFormatada: string,
  montadoPor: string | undefined,
  alturaRodape: number
): number {
  const yFim = yInicial + peca.altura;

  // --- Cabeçalho (ALTURA_CABECALHO_DOC): destino e data, uma vez só.
  // As duas decisões — vermelho no destino, data grande sem faixa preta —
  // estão explicadas em desenharBloco().
  let y = yInicial + MARGEM;
  ctx.textAlign = "center";
  ctx.fillStyle = VERMELHO_MARCA;
  ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(peca.titulo, LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
  y += 42;

  if (peca.subtitulo) {
    ctx.fillStyle = "#000000";
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
    ctx.fillText(peca.subtitulo, LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
    y += ALTURA_SUBTITULO_CABECALHO;
  }

  ctx.fillStyle = "#000000";
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(dataFormatada, LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
  y += 46;
  linhaHorizontal(ctx, y, "#000000", 3);
  y += 19;

  // --- Setores: blocos dentro da MESMA tira, sem tesoura entre eles.
  for (const bloco of peca.blocos) {
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.font = "bold 27px system-ui, -apple-system, sans-serif";
    ctx.fillText(bloco.rotuloSessao.toUpperCase(), LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
    y += 38;
    linhaHorizontal(ctx, y, "#000000", 2);
    y += ALTURA_SUBTITULO_SESSAO - 38;

    if (bloco.linhas.length === 0) {
      ctx.textAlign = "left";
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

  // --- Rodapé: UM por tira de papel.
  const yRodape = yFim - alturaRodape;
  linhaHorizontal(ctx, yRodape, "#000000", 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#000000";
  ctx.font = "18px system-ui, -apple-system, sans-serif";
  const itensNesta = peca.blocos.reduce((soma, b) => soma + b.linhas.length, 0);
  const contagem = peca.folha
    ? `${itensNesta} de ${peca.totalDoDestino} itens · folha ${peca.folha.numero}/${peca.folha.total}`
    : `${peca.totalDoDestino} ${peca.totalDoDestino === 1 ? "item" : "itens"}`;
  ctx.fillText(contagem, LARGURA_PX / 2, yRodape + 12);

  if (montadoPor) {
    ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
    ctx.fillText(`Montado por: ${montadoPor}`, LARGURA_PX / 2, yRodape + 38);
  }

  return yFim;
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
  void dataEmDestaque;
  let y = yInicial + MARGEM;

  /**
   * O DESTINO EM VERMELHO E GRANDE (ago/2026, pedido do dono do negócio:
   * "aumentar o tamanho da fonte do nome da loja, sem 'Matriz' ou
   * 'Filial', e colocar uma cor mais em destaque").
   *
   * O "Filial" na frente não distinguia nada — todo papel que sai desta
   * fita é de uma loja — e roubava espaço do que distingue: o nome. Quem
   * passa esses papéis adiante lê a primeira linha de relance para saber
   * de quem é aquele monte, e é essa leitura que a palavra atrapalhava.
   */
  ctx.fillStyle = VERMELHO_MARCA;
  ctx.textAlign = "center";
  ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(titulo, LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
  y += 42;

  /**
   * A DATA SEM FAIXA PRETA (ago/2026, pedido do dono do negócio).
   *
   * A faixa gastava tinta térmica em toda sessão de todo dia e, com duas
   * ou três num mesmo palmo de papel, deixava de destacar: quando tudo
   * grita, nada grita. Agora o destaque é o TAMANHO — 34px é a maior
   * coisa do papel, lida de longe, que é como ela é lida de verdade.
   */
  ctx.fillStyle = "#000000";
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.fillText(dataFormatada, LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
  y += 46;
  linhaHorizontal(ctx, y, "#000000", 3);
  y += 19;

  /**
   * O SETOR MAIOR QUE OS PRODUTOS (ago/2026, pedido do dono do negócio:
   * "uma fonte levemente maior do que a dos produtos, para destacar
   * visualmente o que é sessão e o que é produto").
   *
   * Estava MENOR que as linhas de produto — a hierarquia invertida: o
   * título do bloco parecia uma observação, e os produtos, o assunto.
   * 27px contra 24px é pouco no papel e suficiente no olho.
   */
  ctx.fillStyle = "#000000";
  ctx.font = "bold 27px system-ui, -apple-system, sans-serif";
  ctx.fillText(rotuloSessao.toUpperCase(), LARGURA_PX / 2, y, LARGURA_PX - MARGEM * 2);
  y += 38;

  linhaHorizontal(ctx, y, "#000000", 2);
  y += 16;

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
