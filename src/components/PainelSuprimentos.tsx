/**
 * src/components/PainelSuprimentos.tsx
 * ---------------------------------------------------------------
 * A matriz recebe, confere e imprime a lista de suprimentos das filiais
 * (ago/2026, pedido do dono do negócio).
 *
 * POR QUE AQUI, NA REPOSIÇÃO, E NÃO NUMA ABA PRÓPRIA
 * ---------------------------------------------------
 * A aba Reposição já é o lugar onde chega o que as lojas pedem à matriz
 * e espera resposta. Embalagem que acabou é exatamente isso: um pedido de
 * uma loja, com prazo, que alguém na matriz precisa resolver. Uma sexta
 * aba só para isso partiria a mesma pergunta — "o que as lojas estão me
 * pedindo?" — em dois lugares que teriam que ser conferidos separadamente
 * todo dia.
 *
 * Fechado por padrão, um card por loja: a matriz vem a esta aba durante o
 * expediente para anunciar fornada, e uma lista de compras aberta no
 * meio do caminho seria ruído em quase toda visita.
 */

import { useState } from "react";
import { FILIAIS } from "../lib/lojas";
import { horaDoInstante } from "../lib/data";
import {
  agruparPorSegmento,
  variedadesDoPedidoSuprimentos,
  type PedidoSuprimentos,
  type Suprimento,
} from "../types/suprimento";
import { IconeImpressora, IconeSeta } from "./Icones";

interface PainelSuprimentosProps {
  /** Listas de suprimentos de HOJE, de todas as filiais. */
  pedidos: PedidoSuprimentos[];
  catalogo: Suprimento[];
  /** Abre a tela de impressão daquela loja. */
  onImprimir: (pedido: PedidoSuprimentos) => void;
}

export function PainelSuprimentos({ pedidos, catalogo, onImprimir }: PainelSuprimentosProps) {
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  const enviados = pedidos.filter((p) => p.status === "enviado" && p.itens.length > 0);
  // Sem lista nenhuma o painel não aparece: um cartão vazio dizendo
  // "nenhuma lista hoje" ocuparia a tela todo dia para informar o normal.
  if (enviados.length === 0) return null;

  return (
    <div className="cartao-avisos cartao-suprimentos">
      <strong className="titulo-suprimentos">Suprimentos pedidos</strong>

      {FILIAIS.map((filial) => {
        const pedido = enviados.find((p) => p.lojaId === filial.id);
        if (!pedido) return null;
        const aberta = !!abertas[filial.id];
        const grupos = agruparPorSegmento(pedido.itens, catalogo);

        return (
          <div key={filial.id} className={`grupo-reposicao ${aberta ? "aberto" : ""}`}>
            <button
              type="button"
              className="cabecalho-reposicao"
              aria-expanded={aberta}
              onClick={() => setAbertas((a) => ({ ...a, [filial.id]: !a[filial.id] }))}
            >
              <span className="nome-grupo-reposicao">{filial.nomeCurto}</span>
              <span className="status-filial">
                {variedadesDoPedidoSuprimentos(pedido)} itens
                {horaDoInstante(pedido.enviadoEm) ? ` · ${horaDoInstante(pedido.enviadoEm)}` : ""}
              </span>
              <IconeSeta className="seta-sessao" />
            </button>

            {aberta && (
              <div className="corpo-reposicao">
                {grupos.map((grupo) => (
                  <div key={grupo.chave} className="sessao-do-card">
                    <h4>{grupo.rotulo}</h4>
                    {grupo.itens.map((item) => (
                      <div key={item.nome} className="item-da-loja">
                        <span className="nome-item-loja">{item.nome}</span>
                        <span className="qtd-item-loja">{item.quantidade}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="acoes acoes-do-card">
                  <button type="button" className="secundario" onClick={() => onImprimir(pedido)}>
                    <IconeImpressora tamanho={17} /> Imprimir
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
