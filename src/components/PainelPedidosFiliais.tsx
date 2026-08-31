/**
 * src/components/PainelPedidosFiliais.tsx
 * ---------------------------------------------------------------
 * Indicador de "quem já mandou o pedido", no topo do Cronograma da
 * matriz (Parte B, ago/2026).
 */

import { useState } from "react";
import { desfechoDaReposicao, type PedidoFilial } from "../types/pedido";
import {
  agruparPorSegmento,
  desfechoDosSuprimentos,
  variedadesDoPedidoSuprimentos,
  type PedidoSuprimentos,
  type Suprimento,
} from "../types/suprimento";
import { FILIAIS } from "../lib/lojas";
import { horaDoInstante } from "../lib/data";
import { IconeAtencao, IconeConfere, IconeImpressora, IconeSeta } from "./Icones";

function variedadesDoPedido(pedido: PedidoFilial | undefined): number {
  return pedido?.itens.length ?? 0;
}

interface PainelPedidosFiliaisProps {
  pedidos: PedidoFilial[];
  data: string;
  reposicoesDeHoje?: PedidoFilial[];
  nomeDoProduto?: (codigoPdv: number) => string;
  saiuDoForno?: (codigoPdv: number) => boolean;
  somenteReposicoes?: boolean;
  pedidosSuprimentos?: PedidoSuprimentos[];
  catalogoSuprimentos?: Suprimento[];
  onImprimirSuprimentos?: (pedido: PedidoSuprimentos) => void;
  onDecidirReposicao?: (
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
  /** Decisão da matriz sobre a lista de suprimentos da filial (ago/2026). */
  onDecidirSuprimentos?: (
    pedido: PedidoSuprimentos,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
  onImprimirReposicao?: (pedido: PedidoFilial) => void;
}

export function PainelPedidosFiliais({
  pedidos,
  data,
  reposicoesDeHoje = [],
  nomeDoProduto,
  saiuDoForno,
  onDecidirReposicao,
  onDecidirSuprimentos,
  onImprimirReposicao,
  somenteReposicoes = false,
  pedidosSuprimentos = [],
  catalogoSuprimentos = [],
  onImprimirSuprimentos,
}: PainelPedidosFiliaisProps) {
  const [filiaisAbertas, setFiliaisAbertas] = useState<Record<string, boolean>>({});
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  const [cancelandoSup, setCancelandoSup] = useState<string | null>(null);
  const [motivoSup, setMotivoSup] = useState("");
  const [salvandoSup, setSalvandoSup] = useState<string | null>(null);

  const suprimentosEnviados = pedidosSuprimentos.filter(
    (p) => p.data === data && p.status === "enviado" && variedadesDoPedidoSuprimentos(p) > 0
  );

  async function decidirSup(
    pedido: PedidoSuprimentos,
    desfecho: "confirmado" | "cancelado",
    textoMotivo?: string
  ) {
    if (!onDecidirSuprimentos) return;
    setSalvandoSup(pedido.id);
    try {
      await onDecidirSuprimentos(pedido, desfecho, textoMotivo);
      setCancelandoSup(null);
      setMotivoSup("");
    } catch {
      // Erro tratado no contexto superior
    } finally {
      setSalvandoSup(null);
    }
  }

  function linhaDeSuprimentos(pedido: PedidoSuprimentos) {
    const desfecho = desfechoDosSuprimentos(pedido);
    const ocupado = salvandoSup === pedido.id;

    return (
      <div key={pedido.id} className={`linha-reposicao suprimentos ${desfecho}`}>
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

        <div className="acoes acoes-do-card">
          {onImprimirSuprimentos && (
            <button
              type="button"
              className="secundario"
              onClick={() => onImprimirSuprimentos(pedido)}
            >
              <IconeImpressora tamanho={17} /> Imprimir
            </button>
          )}

          {desfecho === "pendente" && onDecidirSuprimentos && (
            <>
              {cancelandoSup === pedido.id ? (
                <div className="motivo-cancelamento" style={{ width: "100%", marginTop: "10px" }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Motivo do cancelamento para a filial..."
                    value={motivoSup}
                    onChange={(e) => setMotivoSup(e.target.value)}
                  />
                  <button
                    type="button"
                    className="perigo"
                    disabled={ocupado || motivoSup.trim().length === 0}
                    onClick={() => decidirSup(pedido, "cancelado", motivoSup)}
                  >
                    {ocupado ? "..." : "Cancelar pedido"}
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setCancelandoSup(null);
                      setMotivoSup("");
                    }}
                  >
                    voltar
                  </button>
                </div>
              ) : (
                <div className="acoes-reposicao" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                  <button
                    type="button"
                    className="primario"
                    disabled={ocupado}
                    onClick={() => decidirSup(pedido, "confirmado")}
                  >
                    {ocupado ? "..." : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setCancelandoSup(pedido.id);
                      setMotivoSup("");
                    }}
                  >
                    não vai
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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
      // Erro tratado acima
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

  if (somenteReposicoes && reposicoesDeHoje.length === 0 && suprimentosEnviados.length === 0) return null;

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

            const pendentesReposicao = daFilial.filter((p) => desfechoDaReposicao(p) === "pendente").length;
            const pendentesSuprimentos = suprimentosDaFilial && desfechoDosSuprimentos(suprimentosDaFilial) === "pendente" ? 1 : 0;
            const pendentesTotal = pendentesReposicao + pendentesSuprimentos;

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
                  <span className={`resumo-reposicao ${pendentesTotal > 0 ? "pendente" : "ok"}`}>
                    {pendentesTotal > 0
                      ? `${pendentesTotal} esperando`
                      : envios.length > 0
                        ? `${envios.length} respondida${envios.length > 1 ? "s" : ""}`
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