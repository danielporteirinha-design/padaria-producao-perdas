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
const ALTURA_CABECALHO_BLOCO = 210;
const ALTURA_RODAPE_BLOCO = 30;
const ALTURA_FAIXA_CORTE = 90;

export interface BlocoSessaoImpressao {
  rotuloSessao: string;
  itens: ItemPlanoProducao[];
}

export interface DadosImpressaoFita {
  dataFormatada: string; // já pronta para exibição, ex.: "Quarta-feira, 26/08/2026"
  sessoes: BlocoSessaoImpressao[];
  produtos: Produto[];
  /** Quem montou/confirmou o cronograma — exibido no rodapé final para rastreabilidade. */
  montadoPor?: string;
}

interface LinhaItem {
  nome: string;
  unidades: number;
}

/** Gera a fita completa (todas as sessões + faixas de corte) num único canvas. */
export function gerarCanvasFitaCompleta(dados: DadosImpressaoFita): HTMLCanvasElement {
  const blocos = dados.sessoes.map((sessao) => ({
    rotuloSessao: sessao.rotuloSessao,
    linhas: linhasDoBloco(sessao.itens, dados.produtos),
  }));

  const alturaBlocos = blocos.reduce(
    (soma, b) => soma + ALTURA_CABECALHO_BLOCO + Math.max(b.linhas.length, 1) * ALTURA_LINHA + ALTURA_RODAPE_BLOCO,
    0
  );
  const alturaCortes = Math.max(blocos.length - 1, 0) * ALTURA_FAIXA_CORTE;
  const alturaRodapeFinal = dados.montadoPor ? 56 : 36;
  const altura = alturaBlocos + alturaCortes + alturaRodapeFinal;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_PX;
  canvas.height = Math.max(altura, 200);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não suporta geração de imagem (canvas 2D indisponível).");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";

  let y = 0;
  blocos.forEach((bloco, indice) => {
    y = desenharBloco(ctx, y, bloco.rotuloSessao, bloco.linhas, dados.dataFormatada);
    if (indice < blocos.length - 1) {
      y = desenharFaixaDeCorte(ctx, y);
    }
  });

  ctx.textAlign = "center";
  ctx.font = "13px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#555555";
  const totalItens = blocos.reduce((s, b) => s + b.linhas.length, 0);
  ctx.fillText(`${blocos.length} sessão(ões) · ${totalItens} itens · app Produção & Perdas`, LARGURA_PX / 2, y + 10);

  if (dados.montadoPor) {
    ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#000000";
    ctx.fillText(`Montado por: ${dados.montadoPor}`, LARGURA_PX / 2, y + 30);
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
  dataFormatada: string
): number {
  let y = yInicial + MARGEM;

  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("PADARIA PÃO DE MEL", LARGURA_PX / 2, y);
  y += 36;

  ctx.font = "20px system-ui, -apple-system, sans-serif";
  ctx.fillText("Lista de Produção", LARGURA_PX / 2, y);
  y += 32;

  // Data em destaque — caixa preta, texto branco, bem grande.
  const alturaCaixaData = 50;
  ctx.fillStyle = "#000000";
  ctx.fillRect(MARGEM, y, LARGURA_PX - MARGEM * 2, alturaCaixaData);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(dataFormatada, LARGURA_PX / 2, y + 13);
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
    linhaHorizontal(ctx, y, "#cccccc", 1);
    y += 16;
  }

  ctx.textAlign = "center";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText(`${linhas.length} ${linhas.length === 1 ? "item" : "itens"} nesta sessão`, LARGURA_PX / 2, y + 6);
  y += ALTURA_RODAPE_BLOCO;

  return y;
}

/** Linha pontilhada + ícone de tesoura, marcando onde cortar entre duas sessões. */
function desenharFaixaDeCorte(ctx: CanvasRenderingContext2D, yInicial: number): number {
  const yLinha = yInicial + ALTURA_FAIXA_CORTE / 2;

  ctx.save();
  ctx.strokeStyle = "#999999";
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

  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#777777";
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
        reject(new Error("Não foi possível gerar a imagem."));
        return;
      }
      resolve(new File([blob], nomeArquivo, { type: "image/png" }));
    }, "image/png");
  });
}

export type ResultadoCompartilhamento = "compartilhado" | "baixado";

/**
 * Compartilha o arquivo via Web Share API (abre o seletor do sistema,
 * incluindo WhatsApp, em navegadores Android/iOS que suportam arquivos)
 * ou, se indisponível, baixa a imagem para envio manual.
 */
export async function compartilharOuBaixar(arquivo: File): Promise<ResultadoCompartilhamento> {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (nav.share && nav.canShare?.({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: arquivo.name });
      return "compartilhado";
    } catch {
      // Usuário cancelou o seletor de compartilhamento — cai para download.
    }
  }

  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return "baixado";
}
