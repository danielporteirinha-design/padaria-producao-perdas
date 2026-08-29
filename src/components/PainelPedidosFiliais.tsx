/**
 * src/components/PainelPedidosFiliais.tsx
 * ---------------------------------------------------------------
 * Indicador de "quem já mandou o pedido", no topo do Cronograma da
 * matriz (Parte B, ago/2026).
 *
 * Resolve um risco operacional concreto: a matriz monta o cronograma no
 * fim do expediente, e se uma filial atrasar o envio a produção sai sem
 * ela — a loja abre no dia seguinte sem mercadoria e ninguém percebeu a
 * tempo. O indicador põe isso na frente do operador ANTES de confirmar.
 *
 * Não bloqueia a confirmação de propósito: pode ser tarde, a filial pode
 * não ter o que pedir, e travar o cronograma da padaria inteira por causa
 * de uma loja seria pior. O que se garante é que ninguém confirme sem ter
 * visto que faltava alguém.
 *
 * O desenho é de CARTÃO por loja, não de linha de tabela (ago/2026): a
 * primeira versão era compacta demais e exigia leitura para entender o
 * estado. Cada loja agora ocupa um bloco com cor de fundo própria — verde
 * ou âmbar — e o estado se lê pela cor, antes de ler a palavra.
 */

import { useState } from "react";
import { desfechoDaReposicao, type PedidoFilial } from "../types/pedido";
import {
  agruparPorSegmento,
  variedadesDoPedidoSuprimentos,
  type PedidoSuprimentos,
  type Suprimento,
} from "../types/suprimento";
import { FILIAIS } from "../lib/lojas";
import { horaDoInstante } from "../lib/data";
import { IconeAtencao, IconeConfere, IconeImpressora, IconeSeta } from "./Icones";

/**
 * Quantas VARIEDADES o pedido tem, não quantas unidades (ago/2026): "195
 * unidades" não diz nada a quem confere de relance, enquanto "12
 * produtos" dá a dimensão da lista que vai chegar para separar.
 */
function variedadesDoPedido(pedido: PedidoFilial | undefined): number {
  return pedido?.itens.length ?? 0;
}

interface PainelPedidosFiliaisProps {
  pedidos: PedidoFilial[];
  data: string;
  /** Reposições pedidas HOJE — urgentes, aparecem em destaque à parte. */
  reposicoesDeHoje?: PedidoFilial[];
  nomeDoProduto?: (codigoPdv: number) => string;
  /**
   * O produto já saiu do forno hoje? (ago/2026)
   *
   * Desde que a filial pode pedir QUALQUER item do catálogo — e não só o
   * que foi anunciado —, as duas coisas chegam pela mesma porta e exigem
   * decisões diferentes: separar o que já está pronto é uma coisa,
   * decidir se ainda dá tempo de ASSAR é outra. Sem essa marca, a matriz
   * confirmaria um pedido de coisa que ninguém fez, e a filial ficaria
   * esperando uma entrega que não vem.
   */
  saiuDoForno?: (codigoPdv: number) => boolean;
  /**
   * Esconde os cartões de "enviou / aguardando" e deixa só as
   * reposições. Desde ago/2026 esse status vive na linha do título do
   * Cronograma — mostrá-lo aqui de novo seria dizer duas vezes a mesma
   * coisa em telas de altura contada.
   */
  somenteReposicoes?: boolean;
  /**
   * A lista de suprimentos de HOJE de cada filial (ago/2026, decisão do
   * dono do negócio: ela passou a morar DENTRO da sanfona da loja, e não
   * num card à parte).
   */
  pedidosSuprimentos?: PedidoSuprimentos[];
  catalogoSuprimentos?: Suprimento[];
  onImprimirSuprimentos?: (pedido: PedidoSuprimentos) => void;
  /** Ausente para quem não é matriz — só ela decide. */
  onDecidirReposicao?: (
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
  /**
   * Imprime a lista de uma reposição. Existe para o pedido com vários
   * itens (ago/2026): separar oito produtos lendo do celular, com as mãos
   * ocupadas, é o tipo de coisa que se faz com papel.
   */
  onImprimirReposicao?: (pedido: PedidoFilial) => void;
}

export function PainelPedidosFiliais({
  pedidos,
  data,
  reposicoesDeHoje = [],
  nomeDoProduto,
  saiuDoForno,
  onDecidirReposicao,
  onImprimirReposicao,
  somenteReposicoes = false,
  pedidosSuprimentos = [],
  catalogoSuprimentos = [],
  onImprimirSuprimentos,
}: PainelPedidosFiliaisProps) {
  /**
   * Quais filiais estão com a lista de reposições aberta.
   * Fechadas por padrão.
   */
  const [filiaisAbertas, setFiliaisAbertas] = useState<Record<string, boolean>>({});
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  /** Listas de suprimentos com item — as vazias não são pedido nenhum. */
  const suprimentosEnviados = pedidosSuprimentos.filter(
    (p) => p.status === "enviado" && variedadesDoPedidoSuprimentos(p) > 0
  );

  /**
   * Uma entrada da linha do tempo: a lista de suprimentos que a loja mandou.
   */
  function linhaDeSuprimentos(pedido: PedidoSuprimentos) {
    return (
      <div key={pedido.id} className="linha-reposicao suprimentos">
        <span className="status-filial">
          {horaDoInstante(pedido.enviadoEm ?? pedido.criadoEm) && (
            <strong className="hora-pedido">
              {horaDoInstante(pedido.enviadoEm ?? pedido.criadoEm)}
            </strong>
          )}
          Suprimentos · {variedadesDoPedidoSuprimentos(pedido)} itens
        </span>

        {agruparPorSegmento(pedido.itens, catalogoSuprimentos).map((grupo) => (
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

        {onImprimirSuprimentos && (
          <div className="acoes acoes-do-card">
            <button
              type="button"
              className="secundario"
              onClick={() => onImprimirSuprimentos(pedido)}
            >
              <IconeImpressora tamanho={17} /> Imprimir
            </button>
          </div>
        )}
      </div>
    );
  }

  async function decidir(
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    textoMotivo?: string
  ) {
    if (!onDecidirReposicao) return;
    setSalvando(pedido.id);
    try {
      await onDecidirReposicao(pedido, desfecho, textoMotivo);
      setCancelando(null);
      setMotivo("");
    } catch {
      // A faixa de aviso global já explica o que houve.
    } finally {
      setSalvando(null);
    }
  }

  const situacao = FILIAIS.map((filial) => {
    const pedido = pedidos.find(
      (p) => p.data === data && p.lojaId === filial.id && p.tipo !== "reposicao"
    );
    return { filial, pedido, enviado: pedido?.status === "enviado" };
  });

  const faltando = situacao.filter((s) => !s.enviado);

  if (somenteReposicoes && reposicoesDeHoje.length === 0) return null;

  return (
    <div className="painel-pedidos">
      {!somenteReposicoes && situacao.map(({ filial, pedido, enviado }) => (
        <div key={filial.id} className={`cartao-filial ${enviado ? "enviado" : "aguardando"}`}>
          <span className="icone-status">
            {enviado ? <IconeConfere tamanho={22} /> : <IconeAtencao tamanho={22} />}
          </span>
          <span className="dados-filial">
            <strong>{filial.nomeCurto}</strong>
            <span className="status-filial">
              {enviado
                ? `${variedadesDoPedido(pedido)} produtos${
                    horaDoInstante(pedido?.enviadoEm) ? ` · ${horaDoInstante(pedido?.enviadoEm)}` : ""
                  }`
                : "não enviou o pedido"}
            </span>
          </span>
        </div>
      ))}
      {!somenteReposicoes && faltando.length > 0 && (
        <p className="nota-rodape">
          Confirmando agora, o que falta não entra na produção.
        </p>
      )}

      {(reposicoesDeHoje.length > 0 || suprimentosEnviados.length > 0) && (
        <div className="cartao-reposicoes">
          <strong>Pedidos das filiais hoje</strong>

          {FILIAIS.map((filial) => {
            const daFilial = reposicoesDeHoje
              .filter((p) => p.lojaId === filial.id)
              .sort((a, b) =>
                (b.enviadoEm ?? b.criadoEm).localeCompare(a.enviadoEm ?? a.criadoEm)
              );
            const suprimentosDaFilial = suprimentosEnviados.find((p) => p.lojaId === filial.id);
            if (daFilial.length === 0 && !suprimentosDaFilial) return null;

            const envios: {
              chave: string;
              em: string;
              reposicao?: PedidoFilial;
              suprimentos?: PedidoSuprimentos;
            }[] = [
              ...daFilial.map((pedido) => ({
                chave: pedido.id,
                em: pedido.enviadoEm ?? pedido.criadoEm,
                reposicao: pedido,
              })),
              ...(suprimentosDaFilial
                ? [
                    {
                      chave: suprimentosDaFilial.id,
                      em: suprimentosDaFilial.enviadoEm ?? suprimentosDaFilial.criadoEm,
                      suprimentos: suprimentosDaFilial,
                    },
                  ]
                : []),
            ].sort((a, b) => b.em.localeCompare(a.em));

            const pendentes = daFilial.filter((p) => desfechoDaReposicao(p) === "pendente").length;

            // SANFONAS SEMPRE FECHADAS POR PADRÃO (false caso não esteja explicitamente marcada no estado)
            const aberta = filiaisAbertas[filial.id] ?? false;

            return (
              <div key={filial.id} className={`grupo-reposicao ${aberta ? "aberto" : ""}`}>
                <button
                  type="button"
                  className="cabecalho-reposicao"
                  aria-expanded={aberta}
                  onClick={() =>
                    setFiliaisAbertas((atual) => ({ ...atual, [filial.id]: !atual[filial.id] }))
                  }
                >
                  <span className="nome-grupo-reposicao">{filial.nomeCurto}</span>
                  <span className={`resumo-reposicao ${pendentes > 0 ? "pendente" : "ok"}`}>
                    {pendentes > 0
                      ? `${pendentes} esperando`
                      : daFilial.length > 0
                        ? `${daFilial.length} respondida${daFilial.length > 1 ? "s" : ""}`
                        : ""}
                    {suprimentosDaFilial
                      ? `${pendentes > 0 || daFilial.length > 0 ? " · " : ""}${variedadesDoPedidoSuprimentos(
                          suprimentosDaFilial
                        )} suprimentos`
                      : ""}
                  </span>
                  <IconeSeta className="seta-sessao" />
                </button>

                {aberta && (
                  <div className="corpo-reposicao">
                    {envios.map((envio) => {
                      if (envio.suprimentos) return linhaDeSuprimentos(envio.suprimentos);
                      const pedido = envio.reposicao!;
                      const desfecho = desfechoDaReposicao(pedido);
                      const ocupado = salvando === pedido.id;
                      return (
                        <div key={pedido.id} className={`linha-reposicao ${desfecho}`}>
                          <span className="status-filial">
                            {horaDoInstante(pedido.enviadoEm ?? pedido.criadoEm) && (
                              <strong className="hora-pedido">
                                {horaDoInstante(pedido.enviadoEm ?? pedido.criadoEm)}
                              </strong>
                            )}
                            {pedido.itens
                              .map(
                                (i) =>
                                  `${nomeDoProduto ? nomeDoProduto(i.codigoPdv) : i.codigoPdv} (${i.quantidadeUnidades} un)`
                              )
                              .join(", ")}
                          </span>

                          {saiuDoForno && pedido.itens.some((i) => !saiuDoForno(i.codigoPdv)) && (
                            <span className="marca-precisa-assar">
                              <IconeAtencao tamanho={13} /> ainda não saiu do forno hoje
                            </span>
                          )}

                          {onImprimirReposicao && pedido.itens.length > 1 && (
                            <button
                              type="button"
                              className="secundario imprimir-reposicao"
                              onClick={() => onImprimirReposicao(pedido)}
                            >
                              <IconeImpressora tamanho={16} /> Imprimir
                            </button>
                          )}

                          {desfecho === "confirmado" && (
                            <span className="selo-reposicao confirmado">
                              <IconeConfere tamanho={14} /> separado
                            </span>
                          )}
                          {desfecho === "cancelado" && (
                            <span className="selo-reposicao cancelado">
                              não enviado — {pedido.atendimento?.motivo}
                            </span>
                          )}

                          {desfecho === "pendente" && onDecidirReposicao && (
                            <>
                              {cancelando === pedido.id ? (
                                <div className="motivo-cancelamento">
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Por que não vai? A filial vê este texto."
                                    value={motivo}
                                    onChange={(e) => setMotivo(e.target.value)}
                                  />
                                  <button
                                    type="button"
                                    className="perigo"
                                    disabled={ocupado || motivo.trim().length === 0}
                                    onClick={() => decidir(pedido, "cancelado", motivo)}
                                  >
                                    {ocupado ? "..." : "Cancelar pedido"}
                                  </button>
                                  <button
                                    type="button"
                                    className="link"
                                    onClick={() => {
                                      setCancelando(null);
                                      setMotivo("");
                                    }}
                                  >
                                    voltar
                                  </button>
                                </div>
                              ) : (
                                <div className="acoes-reposicao">
                                  <button
                                    type="button"
                                    className="primario"
                                    disabled={ocupado}
                                    onClick={() => decidir(pedido, "confirmado")}
                                  >
                                    {ocupado ? "..." : "Confirmar"}
                                  </button>
                                  <button
                                    type="button"
                                    className="link"
                                    onClick={() => {
                                      setCancelando(pedido.id);
                                      setMotivo("");
                                    }}
                                  >
                                    não vai
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}