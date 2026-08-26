/**
 * src/components/ExportarFita.tsx
 * ---------------------------------------------------------------
 * Preview + botão de exportação da fita com todas as sessões confirmadas
 * do cronograma, separadas por faixa de corte (linha pontilhada + tesoura).
 * Normalmente é UMA imagem só, cortada fisicamente depois de impressa —
 * mas se o cronograma do dia for grande o bastante para passar do limite
 * seguro de tamanho de canvas (alguns navegadores móveis falham em silêncio
 * acima de ~4096px de altura), a própria geração já divide em mais de uma
 * imagem automaticamente (ver ALTURA_MAXIMA_SEGURA_PX em gerarImagemLista.ts).
 *
 * Quando dá mais de uma imagem e o navegador não suporta compartilhar vários
 * arquivos de uma vez, NÃO tentamos baixar tudo sozinho automaticamente —
 * confirmado em teste que navegadores descartam downloads automáticos além
 * do primeiro quando disparados em sequência por código, sem erro nenhum
 * avisando (o operador via só 1 das N imagens, achando que era só isso).
 * Em vez disso aparece um botão "Baixar imagem N" por imagem — cada
 * download é então um clique de verdade do operador, garantido de
 * funcionar em qualquer navegador.
 */

import { useEffect, useRef, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import {
  baixarArquivo,
  canvasesParaArquivos,
  compartilharOuBaixar,
  ErroGeracaoImagem,
  gerarCanvasesFita,
} from "../lib/gerarImagemLista";
import { IconeImpressora } from "./Icones";

interface ExportarFitaProps {
  /** Blocos já prontos: rótulo do bloco + itens. Serve tanto para a fita
   *  de produção (por categoria) quanto para o romaneio de uma filial. */
  blocos: { rotuloSessao: string; itens: ItemPlanoProducao[] }[];
  /** Ver DadosImpressaoFita.titulo — é o que distingue os dois documentos. */
  titulo: string;
  /** Texto acima do preview, explicando o que fazer com este papel. */
  instrucao: string;
  dataFormatada: string;
  produtos: Produto[];
  nomeArquivoBase: string;
  montadoPor?: string;
  /**
   * Envia direto para a impressora do caixa. Ausente quando o perfil não
   * pode imprimir (a impressora fica na matriz) — nesse caso o botão nem
   * aparece, em vez de aparecer e falhar.
   */
  onImprimirNoCaixa?: (canvases: HTMLCanvasElement[], documento: string) => Promise<void>;
}

export function ExportarFita({
  blocos,
  titulo,
  instrucao,
  dataFormatada,
  produtos,
  nomeArquivoBase,
  montadoPor,
  onImprimirNoCaixa,
}: ExportarFitaProps) {
  const [imprimindo, setImprimindo] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"" | "gerando" | "ok" | "erro">("");
  const [mensagem, setMensagem] = useState("");
  // Preenchido só no caso raro de várias imagens sem suporte a
  // compartilhamento — ver comentário em compartilharOuBaixar() sobre por
  // que baixar várias automaticamente não é confiável. Cada uma dessas vira
  // um botão próprio, baixado por um clique de verdade do operador.
  const [arquivosParaBaixar, setArquivosParaBaixar] = useState<File[] | null>(null);

  useEffect(() => {
    if (!previewRef.current) return;
    try {
      const canvases = gerarCanvasesFita({ sessoes: blocos, titulo, dataFormatada, produtos, montadoPor });
      previewRef.current.innerHTML = "";
      canvases.forEach((canvas, indice) => {
        if (canvases.length > 1) {
          const rotulo = document.createElement("p");
          rotulo.className = "nota-rodape";
          rotulo.textContent = `Imagem ${indice + 1} de ${canvases.length}`;
          previewRef.current!.appendChild(rotulo);
        }
        canvas.className = "canvas-preview";
        previewRef.current!.appendChild(canvas);
      });
    } catch (erro) {
      // Preview é best-effort — se falhar, o botão de ação ainda tenta gerar de novo.
      // Ainda assim registramos no console: um erro aqui nunca deve ficar invisível.
      console.error("Falha ao pré-visualizar a fita de produção:", erro);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocos, titulo, dataFormatada, montadoPor]);

  async function handleAcao() {
    setStatus("gerando");
    setMensagem("");
    setArquivosParaBaixar(null);
    try {
      const canvases = gerarCanvasesFita({ sessoes: blocos, titulo, dataFormatada, produtos, montadoPor });
      const arquivos = await canvasesParaArquivos(canvases, nomeArquivoBase);
      const resultado = await compartilharOuBaixar(arquivos);
      setStatus("ok");
      if (resultado === "compartilhado") {
        setMensagem("Compartilhado — escolha o WhatsApp no seletor que abriu.");
      } else if (resultado === "baixar_manualmente") {
        setArquivosParaBaixar(arquivos);
        setMensagem(`Toque em cada botão abaixo para baixar as ${arquivos.length} imagens, uma de cada vez.`);
      } else {
        setMensagem("Imagem baixada — envie pelo WhatsApp e imprima no PC da empresa.");
      }
    } catch (erro) {
      // Nunca engolir o erro em silêncio — registramos no console pra dar pra
      // investigar se acontecer de novo, mesmo com a mensagem na tela sendo simples.
      console.error("Falha ao gerar/baixar a fita de produção:", erro);
      setStatus("erro");
      setMensagem(
        erro instanceof ErroGeracaoImagem
          ? erro.message
          : "Não foi possível gerar a imagem. Tente novamente — se continuar falhando, me avise para eu investigar."
      );
    }
  }

  return (
    <div className="cartao-exportar">
      <h3>
        {titulo} <span className="contagem-itens">({blocos.length} bloco(s))</span>
      </h3>
      <p className="nota-rodape">{instrucao}</p>
      <div className="preview-lista" ref={previewRef} />
      {onImprimirNoCaixa && (
        <button
          type="button"
          className="primario largura-cheia"
          disabled={imprimindo}
          onClick={async () => {
            setImprimindo(true);
            try {
              const canvases = gerarCanvasesFita({
                sessoes: blocos,
                titulo,
                dataFormatada,
                produtos,
                montadoPor,
              });
              await onImprimirNoCaixa(canvases, titulo);
            } catch (erro) {
              console.error("Falha ao enviar para a impressora do caixa:", erro);
            } finally {
              setImprimindo(false);
            }
          }}
        >
          <IconeImpressora tamanho={18} />
          {imprimindo ? "Enviando..." : "Imprimir no caixa"}
        </button>
      )}

      <button
        type="button"
        className="secundario largura-cheia"
        onClick={handleAcao}
        disabled={status === "gerando"}
      >
        {status === "gerando" ? "Gerando..." : "Compartilhar / Baixar imagem"}
      </button>
      {mensagem && <p className={status === "erro" ? "erro-conversao" : "mensagem-sucesso"}>{mensagem}</p>}
      {arquivosParaBaixar && (
        <div className="acoes-download-multiplo">
          {arquivosParaBaixar.map((arquivo, indice) => (
            <button
              key={arquivo.name}
              type="button"
              className="secundario"
              onClick={() => baixarArquivo(arquivo)}
            >
              Baixar imagem {indice + 1} de {arquivosParaBaixar.length}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
