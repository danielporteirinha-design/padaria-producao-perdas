/**
 * src/components/ExportarFita.tsx
 * ---------------------------------------------------------------
 * Preview + botão de exportação da fita ÚNICA com todas as sessões
 * confirmadas do cronograma, separadas por faixa de corte (linha
 * pontilhada + tesoura). Substitui a exportação por sessão individual —
 * agora é uma imagem só, cortada fisicamente depois de impressa.
 */

import { useEffect, useRef, useState } from "react";
import type { Produto } from "../types/produto";
import type { SessaoProducao } from "../types/producao";
import { canvasParaArquivo, compartilharOuBaixar, gerarCanvasFitaCompleta } from "../lib/gerarImagemLista";
import { rotuloDaCategoria } from "../lib/categorias";

interface ExportarFitaProps {
  sessoes: SessaoProducao[];
  dataFormatada: string;
  produtos: Produto[];
  nomeArquivoBase: string;
  montadoPor?: string;
}

export function ExportarFita({ sessoes, dataFormatada, produtos, nomeArquivoBase, montadoPor }: ExportarFitaProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"" | "gerando" | "ok" | "erro">("");
  const [mensagem, setMensagem] = useState("");

  const blocos = sessoes.map((s) => ({ rotuloSessao: rotuloDaCategoria(s.categoria), itens: s.itens }));

  useEffect(() => {
    if (!previewRef.current) return;
    try {
      const canvas = gerarCanvasFitaCompleta({ sessoes: blocos, dataFormatada, produtos, montadoPor });
      canvas.className = "canvas-preview";
      previewRef.current.innerHTML = "";
      previewRef.current.appendChild(canvas);
    } catch {
      // Preview é best-effort — se falhar, o botão de ação ainda tenta gerar de novo.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessoes, dataFormatada, montadoPor]);

  async function handleAcao() {
    setStatus("gerando");
    setMensagem("");
    try {
      const canvas = gerarCanvasFitaCompleta({ sessoes: blocos, dataFormatada, produtos, montadoPor });
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
        Fita de produção <span className="contagem-itens">({sessoes.length} sessão(ões))</span>
      </h3>
      <p className="nota-rodape">
        Imprima em uma tira só, corte em cada linha pontilhada (✂) e fixe cada pedaço no quadro de avisos
        do respectivo setor.
      </p>
      <div className="preview-lista" ref={previewRef} />
      <button type="button" className="primario" onClick={handleAcao} disabled={status === "gerando"}>
        {status === "gerando" ? "Gerando..." : "Compartilhar / Baixar imagem"}
      </button>
      {mensagem && <p className={status === "erro" ? "erro-conversao" : "mensagem-sucesso"}>{mensagem}</p>}
    </div>
  );
}
