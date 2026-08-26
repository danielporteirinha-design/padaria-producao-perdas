/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * O que já saiu do forno na matriz HOJE, visto da filial, com pedido de
 * reposição embutido (ago/2026).
 *
 * É o objetivo que o dono do negócio descreveu: a filial fica sabendo que
 * o produto ficou pronto AGORA e, se está sem ele no balcão, pede
 * enquanto ainda dá tempo de entregar hoje. A conferência do fim do
 * expediente chega tarde demais para isso.
 *
 * A reposição é separada do pedido diário de propósito — misturar as duas
 * esconderia a urgência. A matriz precisa ver que uma loja está pedindo
 * AGORA, não descobrir junto com o planejamento do dia seguinte.
 *
 * Lista ordenada pela fornada mais RECENTE primeiro: o que acabou de sair
 * é o que ainda está quente e o que a filial tem chance de receber hoje.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { desfechoDaReposicao, ehReposicao, idDaReposicao } from "../types/pedido";
import type { Loja } from "../lib/lojas";
import { dataDeHojeIso } from "../lib/data";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { IconeChama, IconeConfere } from "./Icones";

interface PainelFornadasFilialProps {
  loja: Loja;
  produtos: Produto[];
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  operador: string;
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
}

export function PainelFornadasFilial({
  loja,
  produtos,
  fornadas,
  pedidos,
  operador,
  onSalvarPedido,
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);

  /** Produtos com fornada hoje, o mais recente primeiro. */
  const prontosHoje = useMemo(() => {
    const codigos = [...new Set(fornadas.filter((f) => f.data === hoje).map((f) => f.codigoPdv))];
    return codigos
      .map((codigo) => ({
        produto: produtos.find((p) => p.codigoPdv === codigo),
        doDia: fornadasDoProduto(fornadas, hoje, codigo),
      }))
      .filter((item): item is { produto: Produto; doDia: FornadaPronta[] } => Boolean(item.produto))
      .sort((a, b) => b.doDia[0].marcadaEm.localeCompare(a.doDia[0].marcadaEm));
  }, [fornadas, produtos, hoje]);

  /**
   * O que esta loja já pediu hoje E o que a matriz respondeu.
   *
   * A resposta fica na mesma linha do produto de propósito: quem está sem
   * o item no balcão precisa saber, olhando uma vez só, se adianta
   * esperar. Uma reposição cancelada num canto separado da tela seria
   * descoberta tarde demais para a loja fazer outra coisa.
   *
   * Cancelamento manda no resumo: se a filial pediu duas vezes e a
   * segunda foi recusada, é a recusa que muda o que ela faz agora.
   */
  const jaPedidoHoje = useMemo(() => {
    const mapa = new Map<
      number,
      { unidades: number; cancelado?: string; confirmado: boolean }
    >();
    for (const pedido of pedidos) {
      if (pedido.data !== hoje || pedido.lojaId !== loja.id || !ehReposicao(pedido)) continue;
      const desfecho = desfechoDaReposicao(pedido);
      for (const item of pedido.itens) {
        const atual = mapa.get(item.codigoPdv) ?? { unidades: 0, confirmado: false };
        mapa.set(item.codigoPdv, {
          unidades: atual.unidades + item.quantidadeUnidades,
          cancelado: desfecho === "cancelado" ? pedido.atendimento?.motivo || "sem motivo informado" : atual.cancelado,
          confirmado: atual.confirmado || desfecho === "confirmado",
        });
      }
    }
    return mapa;
  }, [pedidos, hoje, loja.id]);

  async function enviarReposicao(codigoPdv: number) {
    if (!ehNumeroValidoPositivo(quantidade)) return;
    setEnviando(true);
    const agora = new Date().toISOString();
    try {
      await onSalvarPedido({
        id: idDaReposicao(hoje, loja.id, agora),
        lojaId: loja.id,
        data: hoje,
        itens: [{ codigoPdv, quantidadeUnidades: paraNumero(quantidade) }],
        status: "enviado",
        tipo: "reposicao",
        criadoPor: operador,
        criadoEm: agora,
        enviadoEm: agora,
      });
      setCodigoPedindo(null);
      setQuantidade("");
    } catch {
      // Mensagem vem do aviso global (ver App.tsx).
    } finally {
      setEnviando(false);
    }
  }

  if (prontosHoje.length === 0) {
    return (
      <div className="painel-fornadas vazio">
        <IconeChama tamanho={20} />
        <span>Nada saiu do forno na matriz ainda hoje.</span>
      </div>
    );
  }

  /**
   * Sanfona, igual ao painel do forno na matriz. Ao longo do dia esta
   * lista cresce — no fim do expediente são dezenas de itens, e a filial
   * passa a rolar tudo isso para chegar no que está embaixo. Fechada, a
   * contagem no cabeçalho já diz se vale a pena abrir.
   *
   * Abre por padrão: durante a produção, o que saiu do forno é
   * exatamente o que a filial veio ver.
   */
  return (
    <div className="painel-fornadas">
      {/* Sem título aqui dentro: a aba já se chama "Nova fornada", e
          repetir o nome logo abaixo dela é a definição de ruído. */}
      <div className="corpo-fornadas">
      {/* Uma linha, não um parágrafo. O texto longo ensinava na primeira
          semana; agora a filial já sabe para que serve o botão, e o que
          sobra é altura ocupada acima da lista. */}
      <p className="nota-rodape">Está sem no balcão? Peça reposição.</p>

      {prontosHoje.map(({ produto, doDia }) => {
        const pedindo = codigoPedindo === produto.codigoPdv;
        const meuPedido = jaPedidoHoje.get(produto.codigoPdv);
        const jaPedi = meuPedido?.unidades ?? 0;
        return (
          <div key={produto.codigoPdv} className="linha-fornada">
            <div className="info-fornada">
              <strong>{produto.nome}</strong>
              <span className="status-filial">
                {doDia.length > 1 ? `${doDia.length} fornadas · ` : ""}última às{" "}
                {horaDaUltimaFornada(fornadas, hoje, produto.codigoPdv)}
                {jaPedi > 0 && (
                  <>
                    {" · "}
                    <span className="ja-pedido">
                      <IconeConfere tamanho={13} /> já pedi {jaPedi} un
                      {meuPedido?.confirmado && " · separado"}
                    </span>
                  </>
                )}
              </span>
              {meuPedido?.cancelado && (
                <span className="reposicao-negada">
                  Não vem: {meuPedido.cancelado}
                </span>
              )}
            </div>

            {pedindo ? (
              <div className="editor-quantidade">
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  autoFocus
                  placeholder="Quantas unidades?"
                  value={quantidade}
                  onChange={(e) => setQuantidade(sanitizarEntradaNumerica(e.target.value))}
                />
                <span className="unidade-fixa">un</span>
                <button
                  type="button"
                  className="primario"
                  disabled={enviando || !ehNumeroValidoPositivo(quantidade)}
                  onClick={() => enviarReposicao(produto.codigoPdv)}
                >
                  {enviando ? "..." : "Pedir"}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setCodigoPedindo(null);
                    setQuantidade("");
                  }}
                >
                  cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="secundario"
                onClick={() => {
                  setCodigoPedindo(produto.codigoPdv);
                  setQuantidade("");
                }}
              >
                Pedir
              </button>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
