/**
 * src/components/ConfirmarProducao.tsx
 * ---------------------------------------------------------------
 * Passo de fim de expediente: confirmar o que REALMENTE saiu do forno.
 *
 * Fica junto das Perdas de propósito (decisão do dono do negócio,
 * ago/2026): é uma parada só no fim do dia, em vez de mais uma
 * interrupção de manhã. Também é o momento em que o operador já está com
 * a balança na mão e a cabeça no fechamento.
 *
 * O desenho parte do caso comum: na maioria dos dias sai tudo. Então
 * TODOS os itens já vêm marcados como produzidos e o operador só desmarca
 * a exceção — um toque em "Confirmar" resolve o dia normal. A marcação é
 * binária porque foi assim que a operação descreveu o problema: quando um
 * item não é produzido, "simplesmente não sai, e pronto", não sai em
 * quantidade menor.
 *
 * Confirmar aqui é o que autoriza a taxa de perda a usar um denominador
 * verdadeiro — ver src/lib/producaoRealizada.ts.
 */

import { useState } from "react";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { Produto } from "../types/produto";
import { itensPlanejados, producaoFoiConfirmada } from "../lib/producaoRealizada";
import { rotuloDaCategoria } from "../lib/categorias";

interface ConfirmarProducaoProps {
  plano: PlanoDeProducaoDiario;
  produtos: Produto[];
  operador: string;
  onConfirmar: (codigosNaoProduzidos: number[]) => Promise<void>;
}

export function ConfirmarProducao({ plano, produtos, operador, onConfirmar }: ConfirmarProducaoProps) {
  const jaConfirmado = producaoFoiConfirmada(plano);
  const [editando, setEditando] = useState(!jaConfirmado);
  const [naoProduzidos, setNaoProduzidos] = useState<Set<number>>(
    () => new Set(plano.producaoRealizada?.codigosNaoProduzidos ?? [])
  );
  const [salvando, setSalvando] = useState(false);

  const nomePorCodigo = new Map(produtos.map((p) => [p.codigoPdv, p.nome]));
  const planejados = itensPlanejados(plano);

  function alternar(codigoPdv: number) {
    setNaoProduzidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(codigoPdv)) proximo.delete(codigoPdv);
      else proximo.add(codigoPdv);
      return proximo;
    });
  }

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar([...naoProduzidos]);
      setEditando(false);
    } catch {
      // Continua em modo de edição com as marcações preservadas — a
      // mensagem de falha vem do aviso global (ver App.tsx).
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    const faltaram = plano.producaoRealizada?.codigosNaoProduzidos ?? [];
    return (
      <div className="cartao-producao-confirmada">
        <div>
          <strong>Produção de hoje confirmada</strong>
          {faltaram.length === 0 ? (
            <span> · saiu tudo conforme a lista</span>
          ) : (
            <span>
              {" "}
              · {faltaram.length} {faltaram.length === 1 ? "item não saiu" : "itens não saíram"}:{" "}
              {faltaram.map((c) => nomePorCodigo.get(c) ?? `#${c}`).join(", ")}
            </span>
          )}
        </div>
        <button type="button" className="link" onClick={() => setEditando(true)}>
          corrigir
        </button>
      </div>
    );
  }

  return (
    <div className="cartao-confirmar-producao">
      <h3>O que saiu do forno hoje?</h3>
      <p className="nota-rodape">
        Tudo já vem marcado como produzido. Desmarque apenas o que não saiu — é isso que faz a taxa
        de perda ser calculada sobre a produção real, e não sobre a lista.
      </p>

      {plano.sessoes.map((sessao) => (
        <div key={sessao.id} className="grupo-confirmacao">
          <h4>{rotuloDaCategoria(sessao.categoria)}</h4>
          {sessao.itens.map((item) => {
            const saiu = !naoProduzidos.has(item.codigoPdv);
            return (
              <label key={item.codigoPdv} className={`linha-confirmacao ${saiu ? "" : "nao-saiu"}`}>
                <input type="checkbox" checked={saiu} onChange={() => alternar(item.codigoPdv)} />
                <span className="nome-confirmacao">{nomePorCodigo.get(item.codigoPdv) ?? `#${item.codigoPdv}`}</span>
                <span className="qtd-confirmacao">
                  {saiu ? `${item.quantidadeUnidades} un` : "não saiu"}
                </span>
              </label>
            );
          })}
        </div>
      ))}

      {planejados.length === 0 && <p className="nota-rodape">Este plano não tem itens.</p>}

      <button type="button" className="primario" disabled={salvando} onClick={confirmar}>
        {salvando
          ? "Confirmando..."
          : naoProduzidos.size === 0
            ? "Confirmar — saiu tudo"
            : `Confirmar — ${naoProduzidos.size} não ${naoProduzidos.size === 1 ? "saiu" : "saíram"}`}
      </button>
      <p className="nota-rodape">Confirmando como {operador}.</p>
    </div>
  );
}
