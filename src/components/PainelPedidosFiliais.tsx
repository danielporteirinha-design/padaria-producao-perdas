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

/**
 * Quantas VARIEDADES o pedido tem, não quantas unidades (ago/2026): "195
 * unidades" não diz nada a quem confere de relance, enquanto "12
 * produtos" dá a dimensão da lista que vai chegar para separar.
 */
function variedadesDoPedido(pedido: PedidoFilial | undefined): number {
  return pedido?.itens.length ?? 0;
}
import { FILIAIS } from "../lib/lojas";
import { horaDoInstante } from "../lib/data";
import { IconeAtencao, IconeConfere, IconeSeta } from "./Icones";

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
  /** Ausente para quem não é matriz — só ela decide. */
  onDecidirReposicao?: (
    pedido: PedidoFilial,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
}

export function PainelPedidosFiliais({
  pedidos,
  data,
  reposicoesDeHoje = [],
  nomeDoProduto,
  saiuDoForno,
  onDecidirReposicao,
  somenteReposicoes = false,
}: PainelPedidosFiliaisProps) {
  /**
   * Qual reposição está com o campo de motivo aberto. Cancelar é o único
   * caminho que pede digitação, e ele fica escondido até ser escolhido:
   * um campo de texto sempre visível ao lado de "Confirmar" sugeriria que
   * cancelar é tão rotineiro quanto confirmar, e não é.
   */
  /**
   * Quais filiais estão com a lista de reposições aberta.
   *
   * Fechadas por padrão. Com as duas lojas pedindo ao longo do dia, a
   * lista corrida virava a maior coisa da tela do Cronograma — e a
   * matriz vinha aqui para PLANEJAR, não para ler pedido por pedido. O
   * cabeçalho de cada filial já diz quantas estão esperando resposta,
   * que é a única informação necessária para decidir se vale abrir.
   */
  const [filiaisAbertas, setFiliaisAbertas] = useState<Record<string, boolean>>({});
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

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

  // Sem cartões de status e sem reposição não sobra nada para mostrar —
  // e um painel vazio ainda ocuparia margem e borda na tela.
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

      {/* Reposição é de HOJE e não entra no planejamento de amanhã — por
          isso aparece separada, e não somada ao pedido diário da loja.

          Agrupada POR FILIAL, e não em lista corrida: quem separa a
          mercadoria separa por loja, e uma lista misturada obriga a
          matriz a fazer esse agrupamento de cabeça toda vez. */}
      {reposicoesDeHoje.length > 0 && (
        <div className="cartao-reposicoes">
          <strong>Reposições pedidas hoje</strong>

          {FILIAIS.map((filial) => {
            const daFilial = reposicoesDeHoje.filter((p) => p.lojaId === filial.id);
            if (daFilial.length === 0) return null;

            const pendentes = daFilial.filter((p) => desfechoDaReposicao(p) === "pendente").length;
            /**
             * PENDENTE NASCE ABERTA (ago/2026).
             *
             * Estavam todas fechadas, e o resultado apareceu no uso real:
             * a matriz recebia o aviso "filial X pediu reposição", abria o
             * app e via só o cabeçalho do grupo — os botões Confirmar e
             * "não vai" ficavam escondidos atrás de mais um toque, e a
             * conclusão foi que "não apareceu botão nenhum".
             *
             * O que espera resposta não pode exigir descoberta. Grupo já
             * respondido continua fechado: aí é histórico, e histórico é
             * consulta.
             *
             * O estado explícito vence, para que fechar continue
             * funcionando — `?? pendentes > 0` só decide o padrão.
             */
            const aberta = filiaisAbertas[filial.id] ?? pendentes > 0;

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
                      : `${daFilial.length} respondida${daFilial.length > 1 ? "s" : ""}`}
                  </span>
                  <IconeSeta className="seta-sessao" />
                </button>

                {aberta && (
                  <div className="corpo-reposicao">
                    {daFilial.map((pedido) => {
            const desfecho = desfechoDaReposicao(pedido);
            const ocupado = salvando === pedido.id;
            return (
              <div key={pedido.id} className={`linha-reposicao ${desfecho}`}>
                {/* Sem o nome da loja aqui: o cabeçalho do grupo já diz de
                    quem é, e repetir em toda linha era metade do ruído.

                    A HORA, sim (ago/2026, pedido do dono do negócio). Um
                    pedido das 7h e um das 11h têm urgências diferentes, e
                    sem ela a matriz tratava os dois igual — ou tentava
                    deduzir a ordem pela posição na lista, que é a ordem
                    de chegada e ninguém garante que continue sendo. */}
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

                {/* Pedido de item que ainda não saiu do forno hoje: não é
                    separar, é decidir se dá tempo de assar. A marca fica
                    ANTES dos botões de propósito — depois deles seria
                    lida tarde demais. */}
                {saiuDoForno && pedido.itens.some((i) => !saiuDoForno(i.codigoPdv)) && (
                  <span className="marca-precisa-assar">
                    <IconeAtencao tamanho={13} /> ainda não saiu do forno hoje
                  </span>
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
