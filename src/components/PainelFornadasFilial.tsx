/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * A aba REPOSIÇÃO da filial (reescrita em ago/2026, com suporte a suprimentos).
 */

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { idDaReposicao } from "../types/pedido";
import type { PedidoSuprimentos, Suprimento } from "../types/suprimento";
import { desfechoDosSuprimentos } from "../types/suprimento";
import type { LinhaDoDia } from "../lib/reposicaoDoDia";
import { estaPendente, montarLinhasDoDia } from "../lib/reposicaoDoDia";
import { dispensarFornada, fornadasDispensadas } from "../lib/fornadasDispensadas";
import type { Loja } from "../lib/lojas";
import { dataDeHojeIso, horaDoInstante } from "../lib/data";
import {
  lerConcluidosVistos,
  limparConcluidosVistosAntigos,
  marcarConcluidosVistos,
  naoVistos,
} from "../lib/concluidosVistos";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { contemBusca } from "../lib/texto";
import { IconeConfere, IconeLixeira, IconeSeta, IconeSino } from "./Icones";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import {
  apagarRascunhoReposicao,
  gravarRascunhoReposicao,
  lerRascunhoReposicao,
  limparRascunhosDeReposicaoAntigos,
} from "../lib/rascunhoReposicao";

const MAXIMO_RESULTADOS = 12;

interface PainelFornadasFilialProps {
  loja: Loja;
  produtos: Produto[];
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  pedidosSuprimentos?: PedidoSuprimentos[];
  catalogoSuprimentos?: Suprimento[];
  operador: string;
  encerrados: Set<number>;
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
  /**
   * Manda a lista em montagem para a impressão (set/2026, pedido do dono
   * do negócio). Quem vai buscar a mercadoria na matriz anda com o papel
   * na mão — conferir pelo celular com as mãos ocupadas não funciona.
   */
  onImprimir?: (pedido: PedidoFilial) => void;
}

export function PainelFornadasFilial({
  loja,
  produtos,
  fornadas,
  pedidos,
  pedidosSuprimentos = [],
  catalogoSuprimentos = [],
  operador,
  encerrados,
  onSalvarPedido,
  onImprimir,
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [busca, setBusca] = useState("");
  /** O microfone está aberto? Enquanto estiver, a busca some da tela. */
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [aberta, setAberta] = useState<Record<string, boolean>>({});
  /**
   * O SINO TAMBÉM VALE PARA OS CONCLUÍDOS (set/2026, pedido do dono do
   * negócio): a resposta que chegou e ainda não foi lida precisa chamar,
   * senão ela cai numa sanfona fechada e ninguém descobre que existe.
   *
   * "Lido" é abrir a sanfona — e é uma informação DESTE aparelho, não do
   * banco. Ver src/lib/concluidosVistos.ts.
   */
  const [vistos, setVistos] = useState(() => lerConcluidosVistos(loja.id, hoje));
  useEffect(() => {
    limparConcluidosVistosAntigos(hoje);
  }, [hoje]);

  /** Abrir a sanfona é o gesto de ler: marca tudo o que está nela. */
  function alternarSanfona(chave: string, linhasDaLista: { chave: string }[]) {
    const vaiAbrir = !aberta[chave];
    /**
     * UMA SANFONA ABERTA POR VEZ (set/2026, decisão do dono do negócio).
     *
     * Abrir substitui em vez de somar: as duas listas abertas juntas
     * empurram a de baixo para fora da tela do celular, e a pessoa rola
     * procurando o que já estava vendo. Abrir uma é dizer "é nesta que
     * eu estou" — e fechar a outra é o que torna isso verdade.
     */
    setAberta(vaiAbrir ? { [chave]: true } : {});
    if (vaiAbrir && chave === "concluidos") {
      setVistos(marcarConcluidosVistos(loja.id, hoje, linhasDaLista.map((l) => l.chave)));
    }
  }


  const pedidoSuprimentosHoje = useMemo(
    () => pedidosSuprimentos.find((p) => p.data === hoje && p.lojaId === loja.id),
    [pedidosSuprimentos, hoje, loja.id]
  );
  const desfechoSup = desfechoDosSuprimentos(pedidoSuprimentosHoje);

  const nomePorSuprimentoId = useMemo(
    () => new Map(catalogoSuprimentos.map((s) => [s.id, s.nome])),
    [catalogoSuprimentos]
  );

  const [itens, setItens] = useState<ItemPlanoProducao[]>(
    () => lerRascunhoReposicao(loja.id, hoje) ?? []
  );

  useEffect(() => {
    if (itens.length === 0) apagarRascunhoReposicao(loja.id, hoje);
    else gravarRascunhoReposicao(loja.id, hoje, itens);
  }, [loja.id, hoje, itens]);

  useEffect(() => {
    limparRascunhosDeReposicaoAntigos(hoje);
  }, [hoje]);

  const nomePorCodigo = useMemo(
    () => new Map(produtos.map((p) => [p.codigoPdv, p.nome])),
    [produtos]
  );
  const nomeDoProduto = (codigo: number) => nomePorCodigo.get(codigo) ?? `Produto ${codigo}`;

  const [dispensadas, setDispensadas] = useState(() => fornadasDispensadas(loja.id, hoje));

  const linhas = useMemo(
    () =>
      montarLinhasDoDia({
        fornadas,
        pedidos,
        hoje,
        lojaId: loja.id,
        encerrados,
        dispensadas,
        // O que já está na montagem sai de "sem resposta" na hora.
        naMontagem: new Set(itens.map((i) => i.codigoPdv)),
      }),
    [fornadas, pedidos, hoje, loja.id, encerrados, dispensadas, itens]
  );
  const semResposta = useMemo(() => linhas.filter(estaPendente), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !estaPendente(l)), [linhas]);

  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && !encerrados.has(p.codigoPdv) && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca, encerrados]);

  function acrescentar(novos: { codigoPdv: number; quantidadeUnidades: number }[]) {
    if (novos.length === 0) return;
    setItens((atual) => {
      const lista = [...atual];
      for (const novo of novos) {
        if (novo.quantidadeUnidades <= 0) continue;
        const onde = lista.findIndex((i) => i.codigoPdv === novo.codigoPdv);
        if (onde >= 0) {
          lista[onde] = {
            ...lista[onde],
            quantidadeUnidades: lista[onde].quantidadeUnidades + novo.quantidadeUnidades,
          };
        } else {
          lista.push({ codigoPdv: novo.codigoPdv, quantidadeUnidades: novo.quantidadeUnidades });
        }
      }
      return lista;
    });
  }

  function mudarQuantidade(codigoPdv: number, bruto: string) {
    const limpo = sanitizarEntradaNumerica(bruto);
    setItens((atual) =>
      atual.map((i) =>
        i.codigoPdv === codigoPdv
          ? { ...i, quantidadeUnidades: ehNumeroValidoPositivo(limpo) ? paraNumero(limpo) : 0 }
          : i
      )
    );
  }

  async function enviarPedido() {
    const validos = itens.filter((i) => i.quantidadeUnidades > 0);
    if (validos.length === 0 || enviando) return;
    setEnviando(true);
    const agora = new Date().toISOString();
    try {
      await onSalvarPedido({
        id: idDaReposicao(hoje, loja.id, agora),
        lojaId: loja.id,
        data: hoje,
        itens: validos,
        status: "enviado",
        tipo: "reposicao",
        criadoPor: operador,
        criadoEm: agora,
        enviadoEm: agora,
      });
      setItens([]);
      setBusca("");
      setCodigoPedindo(null);
      setAberta({ semResposta: true });
    } finally {
      setEnviando(false);
    }
  }

  const totalUnidades = itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0);
  const faltaQuantidade = itens.some((i) => i.quantidadeUnidades <= 0);

  /**
   * O SINO É SÓ DA LISTA QUE ESPERA RESPOSTA (set/2026, decisão do dono
   * do negócio).
   *
   * "Pedidos concluídos" é histórico do dia: ele informa, não cobra
   * nada. Um sino balançando ali competiria com o único aviso que
   * realmente pede ação — e dois alarmes na mesma tela é o mesmo que
   * nenhum, porque a pessoa aprende a ignorar os dois.
   */
  function sanfona(
    chave: string,
    titulo: string,
    linhasDaLista: LinhaDoDia[],
    { cobraResposta = false }: { cobraResposta?: boolean } = {}
  ) {
    const abertaAgora = !!aberta[chave];
    // Novidade = concluído que ainda não foi lido neste aparelho.
    const novidades = cobraResposta ? 0 : naoVistos(linhasDaLista, vistos);
    return (
      <div className={`acordeao-sessao ${abertaAgora ? "aberta" : ""}`}>
        <div className="cabecalho-sessao">
          <button
            type="button"
            className="abrir-sessao"
            aria-expanded={abertaAgora}
            onClick={() => alternarSanfona(chave, linhasDaLista)}
          >
            <span className="nome-sessao">{titulo}</span>
            {/* O SINO NO LUGAR DA CONTAGEM ESCRITA (set/2026, pedido do
                dono do negócio: "não precisa gritar, mas é necessário
                chamar a atenção").

                "3 itens" é informação que precisa ser LIDA. O sino é
                reconhecido antes da leitura: quem passa os olhos já sabe
                que há coisa esperando, e só então lê quantas. O balanço
                é curto e para sozinho — animação infinita numa tela que
                fica aberta o dia todo vira ruído, e ruído a pessoa
                aprende a ignorar. */}
            {linhasDaLista.length > 0 && !cobraResposta && novidades === 0 && (
              <span className="contagem-itens">
                {linhasDaLista.length} {linhasDaLista.length === 1 ? "item" : "itens"}
              </span>
            )}
            {(cobraResposta ? linhasDaLista.length > 0 : novidades > 0) && (
              <span
                className="sino-sessao"
                aria-label={`${cobraResposta ? linhasDaLista.length : novidades} ${
                  (cobraResposta ? linhasDaLista.length : novidades) === 1 ? "registro" : "registros"
                }`}
              >
                <IconeSino tamanho={22} />
                <em className="contagem-sino">{cobraResposta ? linhasDaLista.length : novidades}</em>
              </span>
            )}
            <IconeSeta className="seta-sessao" />
          </button>
        </div>

        {abertaAgora && (
          <div className="corpo-sessao">
            {linhasDaLista.length === 0 ? (
              <p className="nota-rodape">Nada aqui hoje.</p>
            ) : (
              linhasDaLista.map((linha) => linhaDoDia(linha))
            )}
          </div>
        )}
      </div>
    );
  }

  function linhaDoDia(linha: LinhaDoDia) {
    const daMatriz = linha.origem === "matriz";
    return (
      <div key={linha.chave} className="linha-reposicao">
        <span className="nome-reposicao">
          <span className="topo-reposicao">
            <em className={`etiqueta-origem ${daMatriz ? "matriz" : "filial"}`}>
              {daMatriz ? "Saiu do forno" : "Eu pedi"}
            </em>
            <strong>{nomeDoProduto(linha.codigoPdv)}</strong>
            <em className="hora-reposicao">{horaDoInstante(linha.quando)}</em>
          </span>

          {linha.situacao === "pendente" && (
            <span className="reposicao-aguardando">
              {daMatriz
                ? `Disponível${linha.vezes && linha.vezes > 1 ? ` · ${linha.vezes} fornadas` : ""} — peça se precisar`
                : "Aguardando a matriz responder"}
            </span>
          )}
          {/* NA LISTA, AINDA NÃO ENVIADO. Sai de "sem resposta" no
              instante em que entra na montagem — pôr o item na lista é a
              resposta ao aviso —, mas o texto avisa que falta o envio,
              que é o passo que a matriz enxerga. */}
          {linha.situacao === "na-lista" && (
            <span className="reposicao-aguardando">
              Está na sua lista — falta enviar o pedido
            </span>
          )}
          {linha.situacao === "confirmado" && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} /> Separado — vem na próxima entrega.
            </span>
          )}
          {linha.situacao === "cancelado" && (
            <span className="reposicao-negada">Não vem: {linha.motivo}</span>
          )}
          {linha.situacao === "atendido" && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} /> Você já pediu este produto hoje.
            </span>
          )}
          {/* RECUSOU, e não "dispensou" (set/2026, decisão do dono do
              negócio). A palavra importa no histórico: quem lê amanhã
              precisa saber que a loja VIU a fornada e decidiu não pedir —
              e não que um aviso sumiu da tela por acaso. */}
          {linha.situacao === "dispensado" && (
            <span className="reposicao-negada">
              Esta loja RECUSOU a fornada — não precisava do produto.
            </span>
          )}

          {daMatriz && linha.situacao === "pendente" && (
            <span className="acoes-fornada">
              <button
                type="button"
                className="botao-fornada pedir"
                onClick={() => {
                  setCodigoPedindo(linha.codigoPdv);
                  setQuantidade("");
                }}
              >
                Pedir
              </button>
              <button
                type="button"
                className="botao-fornada excluir"
                aria-label={`Tirar o aviso de ${nomeDoProduto(linha.codigoPdv)} da lista`}
                onClick={() => setDispensadas(dispensarFornada(loja.id, hoje, linha.codigoPdv))}
              >
                <IconeLixeira tamanho={15} />
              </button>
            </span>
          )}

          {daMatriz && codigoPedindo === linha.codigoPdv && (
            <span className="editor-quantidade">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*"
                autoFocus
                placeholder="Quantas unidades?"
                value={quantidade}
                onChange={(e) => setQuantidade(sanitizarEntradaNumerica(e.target.value))}
              />
              <span className="unidade-fixa">un</span>
              <button
                type="button"
                className="primario"
                disabled={!ehNumeroValidoPositivo(quantidade)}
                onClick={() => {
                  acrescentar([
                    { codigoPdv: linha.codigoPdv, quantidadeUnidades: paraNumero(quantidade) },
                  ]);
                  setCodigoPedindo(null);
                  setQuantidade("");
                }}
              >
                Incluir
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
            </span>
          )}
        </span>

        {linha.unidades !== undefined && <span className="qtd-reposicao">{linha.unidades} un</span>}
      </div>
    );
  }

  return (
    <div className="painel-fornadas">
      <div className="corpo-fornadas">
        {pedidoSuprimentosHoje && pedidoSuprimentosHoje.status === "enviado" && (
          <div className={`cartao-status-suprimentos ${desfechoSup}`}>
            <strong className="titulo-montagem">Lista de Suprimentos enviada hoje</strong>
            <p className="nota-rodape">
              {pedidoSuprimentosHoje.itens
                .map((i) => `${nomePorSuprimentoId.get(i.suprimentoId) ?? i.suprimentoId} (${i.quantidade} un)`)
                .join(", ")}
            </p>
            {desfechoSup === "pendente" && (
              <span className="reposicao-aguardando">Aguardando a matriz responder a lista de suprimentos...</span>
            )}
            {desfechoSup === "confirmado" && (
              <span className="reposicao-confirmada">
                <IconeConfere tamanho={14} /> Suprimentos separados pela matriz!
              </span>
            )}
            {desfechoSup === "cancelado" && (
              <span className="reposicao-negada">
                Suprimentos não enviados: {pedidoSuprimentosHoje.atendimento?.motivo}
              </span>
            )}
          </div>
        )}

        <AssistenteDeVoz
          produtos={produtos}
          modo="pedir"
          acao="adicionar"
          onOuvindoMudou={setOuvindoVoz}
          onConfirmar={async (ditados) =>
            acrescentar(
              ditados
                .filter((i) => i.quantidade && i.quantidade > 0)
                .map((i) => ({
                  codigoPdv: i.produto.codigoPdv,
                  quantidadeUnidades: i.quantidade!,
                }))
            )
          }
        />

        {/* A BUSCA SOME ENQUANTO O MICROFONE ESTÁ ABERTO (set/2026,
            pedido do dono do negócio). Quem está falando não vai digitar
            ao mesmo tempo, e o campo logo abaixo do botão disputa espaço
            e atenção justamente no momento em que a pessoa precisa se
            concentrar na frase. */}
        {!ouvindoVoz && (
          <CampoDeBusca
            className="busca-forno"
            valor={busca}
            onMudar={(v) => {
              setBusca(v);
              setCodigoPedindo(null);
            }}
            placeholder="Buscar produto para pedir..."
            rotulo="Buscar produto pelo nome"
          />
        )}

        {busca.trim().length > 0 &&
          (resultados.length === 0 ? (
            <p className="nota-rodape">Nenhum produto ativo com esse nome.</p>
          ) : (
            resultados.map((produto) => (
              <div key={produto.codigoPdv} className="linha-fornada">
                <div className="info-fornada">
                  <strong>{produto.nome}</strong>
                </div>
                {codigoPedindo === produto.codigoPdv ? (
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
                      disabled={!ehNumeroValidoPositivo(quantidade)}
                      onClick={() => {
                        acrescentar([
                          {
                            codigoPdv: produto.codigoPdv,
                            quantidadeUnidades: paraNumero(quantidade),
                          },
                        ]);
                        setCodigoPedindo(null);
                        setQuantidade("");
                        setBusca("");
                      }}
                    >
                      Incluir
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
                  <div className="acoes-fornada">
                    <button
                      type="button"
                      className="botao-fornada pedir"
                      onClick={() => {
                        setCodigoPedindo(produto.codigoPdv);
                        setQuantidade("");
                      }}
                    >
                      Incluir
                    </button>
                  </div>
                )}
              </div>
            ))
          ))}

        {itens.length > 0 && (
          <div className="pedido-em-montagem">
            <strong className="titulo-montagem">Pedido de reposição</strong>

            {itens.map((item) => (
              <div key={item.codigoPdv} className="linha-montagem">
                <span className="nome-montagem">{nomeDoProduto(item.codigoPdv)}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="qtd-conferencia"
                  aria-label={`Quantidade de ${nomeDoProduto(item.codigoPdv)}`}
                  placeholder="qtd"
                  value={item.quantidadeUnidades > 0 ? String(item.quantidadeUnidades) : ""}
                  onChange={(e) => mudarQuantidade(item.codigoPdv, e.target.value)}
                />
                <button
                  type="button"
                  className="tirar-da-lista"
                  aria-label={`Tirar ${nomeDoProduto(item.codigoPdv)} da lista`}
                  onClick={() =>
                    setItens((atual) => atual.filter((i) => i.codigoPdv !== item.codigoPdv))
                  }
                >
                  <IconeLixeira tamanho={16} />
                </button>
              </div>
            ))}

            <p className="nota-rodape">
              {itens.length} {itens.length === 1 ? "item" : "itens"} · {totalUnidades} unidades
            </p>
            {faltaQuantidade && (
              <p className="nota-rodape">Informe a quantidade dos itens em branco.</p>
            )}

            <div className="acoes-montagem">
              {confirmandoLimpeza ? (
                <>
                  <button
                    type="button"
                    className="perigo"
                    onClick={() => {
                      setItens([]);
                      setConfirmandoLimpeza(false);
                    }}
                  >
                    Apagar os {itens.length}?
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setConfirmandoLimpeza(false)}
                  >
                    não
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="secundario"
                  onClick={() => setConfirmandoLimpeza(true)}
                >
                  Limpar pedido
                </button>
              )}

              {/* IMPRIMIR O QUE ESTÁ MONTADO, enviado ou não: quem vai
                  buscar a mercadoria precisa do papel antes de a matriz
                  responder. */}
              {onImprimir && (
                <button
                  type="button"
                  className="secundario"
                  onClick={() =>
                    onImprimir({
                      id: idDaReposicao(hoje, loja.id, new Date().toISOString()),
                      lojaId: loja.id,
                      data: hoje,
                      itens: itens.filter((i) => i.quantidadeUnidades > 0),
                      status: "rascunho",
                      tipo: "reposicao",
                      criadoPor: operador,
                      criadoEm: new Date().toISOString(),
                    })
                  }
                >
                  Imprimir
                </button>
              )}
              <button
                type="button"
                className="primario"
                disabled={enviando || faltaQuantidade}
                onClick={() => void enviarPedido()}
              >
                {enviando ? "Enviando..." : `Enviar pedido (${itens.length})`}
              </button>
            </div>
          </div>
        )}

        {sanfona("semResposta", "Pedidos sem resposta", semResposta, { cobraResposta: true })}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

      </div>
    </div>
  );
}