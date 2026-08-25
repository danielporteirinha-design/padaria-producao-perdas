/**
 * src/components/ExportarSessao.tsx
 * ---------------------------------------------------------------
 * Cartão de exportação/impressão de UMA sessão confirmada — preview da
 * imagem gerada + botão de compartilhar (WhatsApp) ou baixar. Cada
 * sessão é um cartão independente porque cada uma vira um papel separado
 * no quadro de avisos (item 12 do pedido).
 */

import { useEffect, useRef, useState } from "react";
import type { Produto } from "../types/produto";
import type { SessaoProducao } from "../types/producao";
import { canvasParaArquivo, compartilharOuBaixar, gerarCanvasLista } from "../lib/gerarImagemLista";
import { rotuloDaCategoria } from "../lib/categorias";

interface ExportarSessaoProps {
  sessao: SessaoProducao;
  dataFormatada: string;
  produtos: Produto[];
  nomeArquivoBase: string;
}

export function ExportarSessao({ sessao, dataFormatada, produtos, nomeArquivoBase }: ExportarSessaoProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"" | "gerando" | "ok" | "erro">("");
  const [mensagem, setMensagem] = useState("");

  const rotuloSessao = rotuloDaCategoria(sessao.categoria);

  useEffect(() => {
    if (!previewRef.current) return;
    try {
      const canvas = gerarCanvasLista({ rotuloSessao, dataFormatada, itens: sessao.itens, produtos });
      canvas.className = "canvas-preview";
      previewRef.current.innerHTML = "";
      previewRef.current.appendChild(canvas);
    } catch {
      // Preview é best-effort — se falhar, o botão de ação ainda tenta gerar de novo.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao, dataFormatada]);

  async function handleAcao() {
    setStatus("gerando");
    setMensagem("");
    try {
      const canvas = gerarCanvasLista({ rotuloSessao, dataFormatada, itens: sessao.itens, produtos });
      const arquivo = await canvasParaArquivo(canvas, `${nomeArquivoBase}.png`);
      const resultado = await compartilharOuBaixar(arquivo);
      setStatus("ok");
      setMensagem(
        resultado === "compartilhado"
          ? "Compartilhado — escolha o WhatsApp no seletor que abriu."
          : "Imagem baixada — envie pelo WhatsApp e imprima no PC da empresa."
      );
    } catch {
      setStatus("erro");
      setMensagem("Não foi possível gerar a imagem. Tente novamente.");
    }
  }

  return (
    <div className="cartao-exportar">
      <h3>
        {rotuloSessao} <span className="contagem-itens">({sessao.itens.length} itens)</span>
      </h3>
      <div className="preview-lista" ref={previewRef} />
      <button type="button" className="primario" onClick={handleAcao} disabled={status === "gerando"}>
        {status === "gerando" ? "Gerando..." : "Compartilhar / Baixar imagem"}
      </button>
      {mensagem && <p className={status === "erro" ? "erro-conversao" : "mensagem-sucesso"}>{mensagem}</p>}
    </div>
  );
}
