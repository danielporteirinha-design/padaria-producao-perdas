/**
 * src/lib/gerarImagemLista.ts
 * ---------------------------------------------------------------
 * Gera uma imagem PNG pronta para impressão térmica (papel de 79mm) com
 * a lista de produção de UMA sessão — fonte grande (a lista é fixada no
 * quadro de avisos da produção), data em destaque.
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

export interface DadosImpressaoSessao {
  rotuloSessao: string;
  dataFormatada: string; // já pronta para exibição, ex.: "Quarta-feira, 26/08/2026"
  itens: ItemPlanoProducao[];
  produtos: Produto[];
}

/** Desenha a lista de uma sessão num canvas novo e retorna o elemento. */
export function gerarCanvasLista(dados: DadosImpressaoSessao): HTMLCanvasElement {
  const linhas = dados.itens
    .map((item) => ({
      nome: dados.produtos.find((p) => p.codigoPdv === item.codigoPdv)?.nome ?? `#${item.codigoPdv}`,
      quilos: item.quantidadeQuilos,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const alturaCabecalho = 210;
  const alturaRodape = 46;
  const altura = alturaCabecalho + Math.max(linhas.length, 1) * ALTURA_LINHA + alturaRodape;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_PX;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não suporta geração de imagem (canvas 2D indisponível).");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LARGURA_PX, altura);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  let y = MARGEM;

  ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("PADARIA PÃO DE MEL", LARGURA_PX / 2, y);
  y += 36;

  ctx.font = "20px system-ui, -apple-system, sans-serif";
  ctx.fillText("Lista de Produção", LARGURA_PX / 2, y);
  y += 32;

  // Data em destaque (item 13 do pedido) — caixa preta, texto branco, bem grande.
  const alturaCaixaData = 50;
  ctx.fillStyle = "#000000";
  ctx.fillRect(MARGEM, y, LARGURA_PX - MARGEM * 2, alturaCaixaData);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
  ctx.fillText(dados.dataFormatada, LARGURA_PX / 2, y + 13);
  y += alturaCaixaData + 18;

  ctx.fillStyle = "#000000";
  ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
  ctx.fillText(dados.rotuloSessao.toUpperCase(), LARGURA_PX / 2, y);
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
    ctx.fillText(`${formatarQuilos(linha.quilos)} kg`, LARGURA_PX - MARGEM, y);
    y += ALTURA_LINHA - 16;
    linhaHorizontal(ctx, y, "#cccccc", 1);
    y += 16;
  }

  ctx.textAlign = "center";
  ctx.font = "14px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText(`${linhas.length} itens · app Produção & Perdas`, LARGURA_PX / 2, y + 6);

  return canvas;
}

function linhaHorizontal(ctx: CanvasRenderingContext2D, y: number, cor: string, largura: number) {
  ctx.strokeStyle = cor;
  ctx.lineWidth = largura;
  ctx.beginPath();
  ctx.moveTo(MARGEM, y);
  ctx.lineTo(LARGURA_PX - MARGEM, y);
  ctx.stroke();
}

function formatarQuilos(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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
