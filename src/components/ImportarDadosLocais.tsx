/**
 * src/components/ImportarDadosLocais.tsx
 * ---------------------------------------------------------------
 * Migração única de localStorage para a nuvem (ago/2026).
 *
 * Antes da virada, tudo vivia no navegador do celular da matriz. Este
 * cartão só aparece quando as duas condições se confirmam ao mesmo tempo:
 *
 *   1. o catálogo na nuvem ainda está vazio (instalação nova), e
 *   2. existe dado guardado neste aparelho.
 *
 * Ou seja: some sozinho depois da primeira migração e nunca aparece nas
 * filiais. É deliberadamente manual — a migração é irreversível no
 * sentido de que passa a existir uma fonte de verdade nova, e isso é
 * decisão do operador, não efeito colateral de abrir o app.
 *
 * NADA é apagado do aparelho. Se algo falhar no meio, os dados originais
 * continuam onde estavam e dá para tentar de novo: os ids são preservados
 * na gravação, então rodar duas vezes sobrescreve os mesmos documentos em
 * vez de duplicar.
 */

import { useEffect, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import type { RepositorioFirestore } from "../data/repositorioFirestore";

interface ImportarDadosLocaisProps {
  repositorio: RepositorioFirestore;
  onConcluido: () => void;
}

interface DadosLocais {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
}

function lerDadosLocais(): DadosLocais | null {
  try {
    const produtos = JSON.parse(localStorage.getItem("padaria:produtos") ?? "null");
    const planos = JSON.parse(localStorage.getItem("padaria:planos") ?? "null");
    const perdas = JSON.parse(localStorage.getItem("padaria:perdas") ?? "null");
    // Sem catálogo gravado o aparelho nunca chegou a escrever nada — o app
    // servia o catálogo semente sem persistir (ver repositorioLocalStorage).
    if (!Array.isArray(produtos) || produtos.length === 0) return null;
    return {
      produtos,
      planos: Array.isArray(planos) ? planos : [],
      perdas: Array.isArray(perdas) ? perdas : [],
    };
  } catch (erro) {
    console.error("Não foi possível ler os dados locais deste aparelho:", erro);
    return null;
  }
}

export function ImportarDadosLocais({ repositorio, onConcluido }: ImportarDadosLocaisProps) {
  const [dados, setDados] = useState<DadosLocais | null>(null);
  const [estado, setEstado] = useState<"verificando" | "pronto" | "enviando" | "erro">("verificando");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const locais = lerDadosLocais();
        if (!locais) {
          if (!cancelado) onConcluido();
          return;
        }
        const vazio = await repositorio.catalogoEstaVazio();
        if (cancelado) return;
        if (!vazio) {
          // Nuvem já povoada: a migração já aconteceu (aqui ou em outro
          // aparelho). Não oferecer de novo evita sobrescrever dado novo
          // com uma cópia velha guardada neste celular.
          onConcluido();
          return;
        }
        setDados(locais);
        setEstado("pronto");
      } catch (erro) {
        console.error("Falha ao verificar se a migração é necessária:", erro);
        if (!cancelado) {
          setEstado("erro");
          setMensagem(
            "Não foi possível verificar os dados na nuvem. Confira a conexão e recarregue o app."
          );
        }
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar() {
    if (!dados) return;
    setEstado("enviando");
    setMensagem("");
    try {
      const total = await repositorio.importarDoDispositivo(dados);
      setMensagem(
        `Enviado: ${total.produtos} produtos, ${total.planos} cronogramas, ${total.perdas} perdas.`
      );
      onConcluido();
    } catch (erro) {
      console.error("Falha ao enviar os dados do aparelho para a nuvem:", erro);
      setEstado("erro");
      setMensagem(
        "Não foi possível enviar. Nada foi apagado deste aparelho — confira a conexão e tente de novo."
      );
    }
  }

  if (estado === "verificando") {
    return <div className="carregando">Verificando dados...</div>;
  }

  return (
    <div className="tela-identificacao">
      <h1>Dados deste aparelho</h1>
      {dados && (
        <>
          <p>
            Este celular guarda dados que ainda não estão na nuvem. Enviar agora deixa as três lojas
            trabalhando sobre a mesma base.
          </p>
          <table className="tabela-simples">
            <tbody>
              <tr>
                <td>Produtos no catálogo</td>
                <td>{dados.produtos.length}</td>
              </tr>
              <tr>
                <td>Cronogramas</td>
                <td>{dados.planos.length}</td>
              </tr>
              <tr>
                <td>Perdas lançadas</td>
                <td>{dados.perdas.length}</td>
              </tr>
            </tbody>
          </table>
          <button
            type="button"
            className="primario"
            disabled={estado === "enviando"}
            onClick={enviar}
          >
            {estado === "enviando" ? "Enviando..." : "Enviar para a nuvem"}
          </button>
          <button type="button" className="link" onClick={onConcluido}>
            pular por enquanto
          </button>
        </>
      )}
      {mensagem && (
        <p className={estado === "erro" ? "erro-conversao" : "mensagem-sucesso"}>{mensagem}</p>
      )}
      <p className="nota-rodape">
        Nada é apagado deste aparelho. Se falhar no meio, dá para tentar de novo sem duplicar nada.
      </p>
    </div>
  );
}
