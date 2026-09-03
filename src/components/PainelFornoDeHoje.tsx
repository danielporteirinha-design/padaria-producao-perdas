/**
 * src/components/PainelFornoDeHoje.tsx
 * ---------------------------------------------------------------
 * Marcação de fornada pronta, ao longo do expediente.
 */

import { useEffect, useMemo, useState } from "react";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import type { PedidoSuprimentos, Suprimento } from "../types/suprimento";
import type { LinhaDaMatriz } from "../lib/reposicaoDoDia";
import { anuncioPendente, montarLinhasDaMatriz } from "../lib/reposicaoDoDia";
import { horaDoInstante } from "../lib/data";
import {
  lerConcluidosVistos,
  limparConcluidosVistosAntigos,
  marcarConcluidosVistos,
  naoVistos,
} from "../lib/concluidosVistos";
import { LOJAS } from "../lib/lojas";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { contemBusca } from "../lib/texto";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { IconeConfere, IconeLixeira, IconeSeta, IconeSino } from "./Icones";

const MAXIMO_RESULTADOS = 12;

interface PainelFornoDeHojeProps {
  produtos: Produto[];
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  /** Listas de suprimentos que as filiais mandaram hoje. */
  pedidosSuprimentos?: PedidoSuprimentos[];
  /**
   * O catálogo de suprimentos — só para traduzir id em nome (set/2026).
   *
   * A matriz precisa LER a lista para saber se dá para separar agora:
   * "Suprimentos · 5 itens" não deixa decidir nada, e obrigava a abrir
   * outra aba justamente na tela onde a decisão é tomada.
   */
  catalogoSuprimentos?: Suprimento[];
  dataHoje: string;
  encerrados: Set<number>;
  onEncerrarAnuncio: (codigoPdv: number) => Promise<void>;
  onMarcarFornada: (
    codigoPdv: number,
    nomeConhecido?: string,
    quantidade?: number
  ) => Promise<void>;
  onCadastrarProduto: (input: NovoProdutoInput) => Promise<Produto | undefined>;
  /**
   * A resposta da matriz ao pedido de uma filial (set/2026).
   *
   * Chegou aqui junto com os pedidos das filiais nas sanfonas — antes
   * vivia num card separado, que saiu.
   */
  onDecidirReposicao?: (
    pedido: PedidoFilial,
    codigoPdv: number,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
  /** A resposta da matriz à lista de suprimentos de uma filial. */
  onDecidirSuprimentos?: (
    pedido: PedidoSuprimentos,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) => Promise<void>;
}

export function PainelFornoDeHoje({
  produtos,
  fornadas,
  pedidos,
  pedidosSuprimentos = [],
  catalogoSuprimentos = [],
  dataHoje,
  encerrados,
  onEncerrarAnuncio,
  onMarcarFornada,
  onCadastrarProduto,
  onDecidirReposicao,
  onDecidirSuprimentos,
}: PainelFornoDeHojeProps) {
  const [marcando, setMarcando] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  /** O microfone está aberto? Enquanto estiver, a busca some da tela. */
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [categoriaNova, setCategoriaNova] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [aberta, setAberta] = useState<Record<string, boolean>>({});
  /**
   * O SINO TAMBÉM VALE PARA OS CONCLUÍDOS (set/2026, pedido do dono do
   * negócio): a confirmação que chegou e ainda não foi lida precisa
   * chamar, senão cai numa sanfona fechada e ninguém descobre.
   *
   * "Lido" é abrir a sanfona, e é informação DESTE aparelho — ver
   * src/lib/concluidosVistos.ts.
   */
  const [vistos, setVistos] = useState(() => lerConcluidosVistos("MATRIZ", dataHoje));
  useEffect(() => {
    limparConcluidosVistosAntigos(dataHoje);
  }, [dataHoje]);

  function alternarSanfona(chave: string, lista: { chave: string }[]) {
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
      setVistos(marcarConcluidosVistos("MATRIZ", dataHoje, lista.map((l) => l.chave)));
    }
  }

  /** Qual linha está sendo respondida agora, e o motivo em digitação. */
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ chave: string; motivo: string } | null>(null);

  const nomeDaLoja = (lojaId: string | undefined) =>
    LOJAS.find((l) => l.id === lojaId)?.nomeCurto ?? "Filial";

  /** Grava a decisão e devolve a tela ao estado normal. */
  async function responder(
    linha: LinhaDaMatriz,
    desfecho: "confirmado" | "cancelado",
    motivo?: string
  ) {
    setDecidindo(linha.chave);
    try {
      if (linha.tipo === "suprimentos" && onDecidirSuprimentos && linha.suprimentos) {
        await onDecidirSuprimentos(linha.suprimentos, desfecho, motivo);
      } else if (onDecidirReposicao && linha.pedido) {
        await onDecidirReposicao(linha.pedido, linha.codigoPdv, desfecho, motivo);
      }
      setRecusa(null);
    } finally {
      setDecidindo(null);
    }
  }
  const [feedbackVoz, setFeedbackVoz] = useState<{ tipo: "sucesso" | "alerta"; texto: string } | null>(null);

  const nomeDoProduto = (codigo: number) =>
    produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca]);

  const buscando = busca.trim().length > 0;

  const linhas = useMemo(
    () =>
      montarLinhasDaMatriz({ fornadas, pedidos, hoje: dataHoje, encerrados, pedidosSuprimentos }),
    [fornadas, pedidos, dataHoje, encerrados, pedidosSuprimentos]
  );

  const nomePorSuprimentoId = useMemo(
    () => new Map(catalogoSuprimentos.map((s) => [s.id, s.nome])),
    [catalogoSuprimentos]
  );
  /** Os itens da lista, escritos — o que a matriz vai separar. */
  function itensDaLista(linha: LinhaDaMatriz): string {
    return (linha.suprimentos?.itens ?? [])
      .filter((i) => i.quantidade > 0)
      .map((i) => `${nomePorSuprimentoId.get(i.suprimentoId) ?? i.suprimentoId} (${i.quantidade})`)
      .join(", ");
  }
  const semResposta = useMemo(() => linhas.filter(anuncioPendente), [linhas]);
  /**
   * O HISTÓRICO É SÓ DOS PEDIDOS DAS FILIAIS (set/2026, decisão do dono
   * do negócio: tirar do histórico linhas como "Anunciei BISCOITO
   * ESPREMIDO · 1 loja pediu").
   *
   * O anúncio já respondido não pede nada de ninguém — ele vira número,
   * e número se lê em Análises. O que a matriz precisa reler aqui é o
   * que ELA decidiu: quem pediu, o que foi confirmado e o que foi
   * recusado, com o motivo. Misturado com os anúncios, isso ficava
   * enterrado no meio de linhas que só informam.
   */
  const concluidos = useMemo(
    () => linhas.filter((l) => !anuncioPendente(l) && l.tipo !== "anuncio"),
    [linhas]
  );

  async function cadastrarEAnunciar() {
    const nome = busca.trim();
    if (!nome || !categoriaNova || salvandoNovo) return;
    setSalvandoNovo(true);
    try {
      const novo = await onCadastrarProduto({
        nome,
        categoria: categoriaNova,
        unidadeProducao: "un",
        ativoNaProducao: true,
        prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[categoriaNova] ?? null,
      });
      if (!novo) return;
      await onMarcarFornada(novo.codigoPdv, novo.nome);
      setCadastrando(false);
      setCategoriaNova("");
    } catch {
    } finally {
      setSalvandoNovo(false);
    }
  }

  function linhaDoProduto(codigoPdv: number) {
    const doDia = fornadasDoProduto(fornadas, dataHoje, codigoPdv);
    const saiu = doDia.length > 0;
    return (
      <div key={codigoPdv} className="item-forno">
        <button
          type="button"
          className={`linha-forno ${saiu ? "saiu" : ""}`}
          disabled={marcando === codigoPdv}
          onClick={async () => {
            setMarcando(codigoPdv);
            try {
              await onMarcarFornada(codigoPdv);
            } catch {
            } finally {
              setMarcando(null);
            }
          }}
        >
          <span className="nome-forno">{nomeDoProduto(codigoPdv)}</span>
          <span className="marca-forno">
            {marcando === codigoPdv
              ? "..."
              : saiu
                ? `${doDia.length}× · ${horaDaUltimaFornada(fornadas, dataHoje, codigoPdv)}${
                    doDia[0]?.quantidade ? ` · ${doDia[0].quantidade} un` : ""
                  }`
                : "anunciar"}
          </span>
        </button>
      </div>
    );
  }

  /** O sino é só da lista que espera resposta — ver PainelFornadasFilial. */
  function sanfona(
    chave: string,
    titulo: string,
    lista: LinhaDaMatriz[],
    { cobraResposta = false }: { cobraResposta?: boolean } = {}
  ) {
    const abertaAgora = !!aberta[chave];
    const novidades = cobraResposta ? 0 : naoVistos(lista, vistos);
    return (
      <div className={`acordeao-sessao ${abertaAgora ? "aberta" : ""}`}>
        <div className="cabecalho-sessao">
          <button
            type="button"
            className="abrir-sessao"
            aria-expanded={abertaAgora}
            onClick={() => alternarSanfona(chave, lista)}
          >
            <span className="nome-sessao">{titulo}</span>
            {/* O SINO NO LUGAR DA CONTAGEM ESCRITA — mesmo motivo da tela
                da filial: o número é lido, o sino é reconhecido. */}
            {lista.length > 0 && !cobraResposta && novidades === 0 && (
              <span className="contagem-itens">
                {lista.length} {lista.length === 1 ? "item" : "itens"}
              </span>
            )}
            {(cobraResposta ? lista.length > 0 : novidades > 0) && (
              <span
                className="sino-sessao"
                aria-label={`${cobraResposta ? lista.length : novidades} ${
                  (cobraResposta ? lista.length : novidades) === 1 ? "registro" : "registros"
                }`}
              >
                <IconeSino tamanho={22} />
                <em className="contagem-sino">{cobraResposta ? lista.length : novidades}</em>
              </span>
            )}
            <IconeSeta className="seta-sessao" />
          </button>
        </div>
        {abertaAgora && (
          <div className="corpo-sessao">
            {lista.length === 0 ? (
              <p className="nota-rodape">Nada aqui hoje.</p>
            ) : chave === "concluidos" ? (
              historicoPorLoja(lista)
            ) : (
              lista.map((linha) => linhaAnunciada(linha))
            )}
          </div>
        )}
      </div>
    );
  }

  /**
   * A linha de um pedido de REPOSIÇÃO feito por uma filial (set/2026).
   *
   * É aqui que a matriz responde — o card que fazia isso antes saiu, e
   * ter a resposta no mesmo lugar onde ela já está olhando é o motivo de
   * a mudança valer a pena. Recusar EXIGE motivo: a filial está sem o
   * produto no balcão, e "não vem" sem explicação não deixa ninguém
   * decidir o que fazer em seguida.
   */
  function linhaDePedido(linha: LinhaDaMatriz) {
    /**
     * Uma LISTA de suprimentos no lugar de um produto: o desenho é o
     * mesmo — quem pediu, o quê, e os dois botões —, porque a decisão da
     * matriz é a mesma decisão. O que muda é o nome da coisa.
     */
    const ehSuprimentos = linha.tipo === "suprimentos";
    const nome = ehSuprimentos
      ? `Suprimentos · ${linha.variedades ?? 0} ${(linha.variedades ?? 0) === 1 ? "item" : "itens"}`
      : nomeDoProduto(linha.codigoPdv);
    const recusando = recusa?.chave === linha.chave;
    return (
      <div key={linha.chave} className="linha-reposicao">
        <span className="nome-reposicao">
          <span className="topo-reposicao">
            <em className="etiqueta-origem filial">{nomeDaLoja(linha.lojaId)}</em>
            <strong>{nome}</strong>
            <em className="hora-reposicao">{horaDoInstante(linha.quando)}</em>
          </span>

          {/* A LISTA ESCRITA, e não só a contagem (set/2026, pedido do
              dono do negócio). É o que a matriz vai separar — sem isto a
              linha pede uma decisão sem dizer sobre o quê. */}
          {ehSuprimentos && itensDaLista(linha).length > 0 && (
            <span className="itens-da-lista">{itensDaLista(linha)}</span>
          )}

          {linha.situacao === "pendente" && (
            <span className="reposicao-aguardando">Esperando sua resposta</span>
          )}
          {linha.situacao === "pedido" && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} /> Confirmado — separar para a entrega.
            </span>
          )}
          {linha.situacao === "encerrado" && (
            <span className="reposicao-negada">
              Recusado: {linha.motivo || "sem motivo informado"}
            </span>
          )}

          {linha.situacao === "pendente" &&
            ((ehSuprimentos && onDecidirSuprimentos && linha.suprimentos) ||
              (!ehSuprimentos && onDecidirReposicao && linha.pedido)) && (
            recusando ? (
              <span className="editor-quantidade">
                <input
                  type="text"
                  autoFocus
                  placeholder="Por quê? (a filial vê este texto)"
                  value={recusa.motivo}
                  onChange={(e) => setRecusa({ chave: linha.chave, motivo: e.target.value })}
                />
                <button
                  type="button"
                  className="primario"
                  disabled={recusa.motivo.trim().length === 0 || decidindo === linha.chave}
                  onClick={() => void responder(linha, "cancelado", recusa.motivo.trim())}
                >
                  Enviar recusa
                </button>
                <button type="button" className="link" onClick={() => setRecusa(null)}>
                  cancelar
                </button>
              </span>
            ) : (
              <span className="acoes-fornada">
                <button
                  type="button"
                  className="botao-fornada pedir"
                  disabled={decidindo === linha.chave}
                  onClick={() => void responder(linha, "confirmado")}
                >
                  {decidindo === linha.chave ? "..." : "Confirmar"}
                </button>
                <button
                  type="button"
                  className="botao-fornada excluir"
                  onClick={() => setRecusa({ chave: linha.chave, motivo: "" })}
                >
                  Recusar
                </button>
              </span>
            )
          )}
        </span>

        {linha.pedidoUnidades !== undefined && (
          <span className="qtd-reposicao">{linha.pedidoUnidades} un</span>
        )}
      </div>
    );
  }

  /**
   * O HISTÓRICO DO DIA, AGRUPADO POR LOJA (set/2026, pedido do dono do
   * negócio: "a leitura deve ser rápida, precisa e organizada").
   *
   * Antes era uma lista corrida em que cada linha repetia o nome da loja
   * numa etiqueta. Com dez pedidos de três lojas, ler "quem pediu o quê"
   * exigia percorrer tudo e ir juntando de cabeça.
   *
   * Agora a loja é um cabeçalho e aparece UMA vez; embaixo dela, uma
   * linha por item, sempre na mesma ordem: produto · quantidade ·
   * status. Colunas fixas são o que permite ler na diagonal — o olho
   * aprende onde cada coisa está e para de procurar.
   */
  function historicoPorLoja(lista: LinhaDaMatriz[]) {
    const porLoja = new Map<string, LinhaDaMatriz[]>();
    for (const linha of lista) {
      const loja = linha.lojaId ?? "";
      porLoja.set(loja, [...(porLoja.get(loja) ?? []), linha]);
    }

    return [...porLoja.entries()].map(([lojaId, doGrupo]) => (
      <div key={lojaId} className="grupo-historico">
        <strong className="loja-do-historico">{nomeDaLoja(lojaId)}</strong>
        {doGrupo.map((linha) => (
          <div key={linha.chave} className="linha-historico">
            <span className="produto-historico">
              {linha.tipo === "suprimentos"
                ? `Suprimentos · ${linha.variedades ?? 0} ${(linha.variedades ?? 0) === 1 ? "item" : "itens"}`
                : nomeDoProduto(linha.codigoPdv)}
              <em className="hora-historico">{horaDoInstante(linha.quando)}</em>
              {linha.tipo === "suprimentos" && itensDaLista(linha).length > 0 && (
                <em className="itens-do-historico">{itensDaLista(linha)}</em>
              )}
            </span>
            <span className="qtd-historico">
              {linha.pedidoUnidades !== undefined ? `${linha.pedidoUnidades} un` : ""}
            </span>
            <span
              className={`status-historico ${linha.situacao === "pedido" ? "confirmado" : "recusado"}`}
            >
              {linha.situacao === "pedido" ? "Confirmado" : "Recusado"}
            </span>
            {linha.situacao === "encerrado" && linha.motivo && (
              <span className="motivo-historico">{linha.motivo}</span>
            )}
          </div>
        ))}
      </div>
    ));
  }

  function linhaAnunciada(linha: LinhaDaMatriz) {
    if (linha.tipo === "pedido" || linha.tipo === "suprimentos") return linhaDePedido(linha);
    return (
      <div key={linha.chave} className="linha-reposicao">
        <span className="nome-reposicao">
          <span className="topo-reposicao">
            <em className="etiqueta-origem matriz">Anunciei</em>
            <strong>{nomeDoProduto(linha.codigoPdv)}</strong>
            <em className="hora-reposicao">{horaDoInstante(linha.quando)}</em>
          </span>

          {linha.situacao === "pendente" && (
            <span className="reposicao-aguardando">
              {linha.vezes > 1 ? `${linha.vezes} fornadas · ` : ""}nenhuma loja pediu ainda
            </span>
          )}
          {linha.situacao === "pedido" && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} />{" "}
              {linha.lojasQuePediram === 1 ? "1 loja pediu" : `${linha.lojasQuePediram} lojas pediram`}
            </span>
          )}
          {linha.situacao === "encerrado" && (
            <span className="reposicao-negada">Anúncio excluído pela matriz</span>
          )}

          {/* AÇÃO SÓ NO QUE AINDA ESPERA RESPOSTA (set/2026, decisão do
              dono do negócio: "está gerando ruído").

              Em "Pedidos concluídos" a linha é histórico — já foi
              decidida. A lixeira e o "anunciar novamente" ali ofereciam
              ação sobre coisa resolvida, e cada botão a mais numa lista
              de leitura rápida é uma decisão a mais para tomar. Quem
              ainda pode ser tirado da vitrine é o anúncio pendente. */}
          {linha.situacao === "pendente" && (
            <span className="acoes-fornada">
              <button
                type="button"
                className="botao-fornada excluir"
                title="Tirar da vitrine — as filiais param de ver hoje"
                aria-label={`Tirar ${nomeDoProduto(linha.codigoPdv)} da vitrine`}
                onClick={() => void onEncerrarAnuncio(linha.codigoPdv)}
              >
                <IconeLixeira tamanho={15} />
              </button>
            </span>
          )}
        </span>

        {linha.unidades !== undefined && (
          <span className="qtd-reposicao">{linha.unidades} un</span>
        )}
      </div>
    );
  }

  return (
    <div className="painel-forno">
      <div className="corpo-forno">
        <AssistenteDeVoz
          produtos={produtos}
          modo="anunciar"
          onOuvindoMudou={setOuvindoVoz}
          onConfirmar={async (itens) => {
            if (!itens || itens.length === 0) {
              setFeedbackVoz({
                tipo: "alerta",
                texto: "Nenhum produto cadastrado foi reconhecido pela voz.",
              });
              setTimeout(() => setFeedbackVoz(null), 4000);
              return;
            }

            try {
              for (const item of itens) {
                await onMarcarFornada(
                  item.produto.codigoPdv,
                  item.produto.nome,
                  item.quantidade ?? undefined
                );
              }
              setFeedbackVoz({
                tipo: "sucesso",
                texto:
                  itens.length === 1
                    ? "Produto inserido na lista."
                    : "Produtos inseridos na lista.",
              });
            } catch {
              setFeedbackVoz({
                tipo: "alerta",
                texto: "Ocorreu um erro ao anunciar a fornada.",
              });
            }

            setTimeout(() => setFeedbackVoz(null), 4000);
          }}
        />

        {feedbackVoz && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              marginTop: "12px",
              marginBottom: "12px",
              fontSize: "0.9rem",
              fontWeight: 600,
              textAlign: "center",
              backgroundColor: feedbackVoz.tipo === "sucesso" ? "#e8f5e9" : "#fff3e0",
              color: feedbackVoz.tipo === "sucesso" ? "#2e7d32" : "#e65100",
              border: `1px solid ${feedbackVoz.tipo === "sucesso" ? "#c8e6c9" : "#ffe0b2"}`,
            }}
          >
            {feedbackVoz.texto}
          </div>
        )}

        {/* A BUSCA SOME ENQUANTO O MICROFONE ESTÁ ABERTO (set/2026,
            pedido do dono do negócio). Quem está falando não vai digitar
            ao mesmo tempo, e o campo logo abaixo do botão disputa espaço
            e atenção justamente no momento em que a pessoa precisa se
            concentrar na frase. */}
        {!ouvindoVoz && (
          <CampoDeBusca
            className="busca-forno"
            valor={busca}
            onMudar={setBusca}
            placeholder="Buscar produto para anunciar..."
            rotulo="Buscar produto no catálogo para anunciar a fornada"
          >
            {buscando && (
              <button type="button" className="link" onClick={() => setBusca("")}>
                limpar
              </button>
            )}
          </CampoDeBusca>
        )}

        {buscando ? (
          <>
            {resultados.length === 0 ? (
              <div className="cadastro-relampago">
                {!cadastrando ? (
                  <>
                    <p className="nota-rodape">Não está no catálogo.</p>
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => {
                        setCadastrando(true);
                        setCategoriaNova("");
                      }}
                    >
                      Cadastrar "{busca.trim()}"
                    </button>
                  </>
                ) : (
                  <>
                    <strong className="nome-do-novo">{busca.trim()}</strong>
                    <p className="nota-rodape">Em qual setor?</p>
                    <div className="setores-do-novo">
                      {CATEGORIAS_PRODUCAO.map((categoria) => (
                        <button
                          key={categoria.chave}
                          type="button"
                          className={`chip-setor ${categoriaNova === categoria.chave ? "ativo" : ""}`}
                          aria-pressed={categoriaNova === categoria.chave}
                          onClick={() => setCategoriaNova(categoria.chave)}
                        >
                          {categoria.rotulo}
                        </button>
                      ))}
                    </div>
                    <div className="acoes">
                      <button
                        type="button"
                        className="link"
                        onClick={() => setCadastrando(false)}
                      >
                        cancelar
                      </button>
                      <button
                        type="button"
                        className="primario"
                        disabled={!categoriaNova || salvandoNovo}
                        onClick={() => void cadastrarEAnunciar()}
                      >
                        {salvandoNovo ? "Salvando..." : "Cadastrar e anunciar"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="grupo-forno">{resultados.map((p) => linhaDoProduto(p.codigoPdv))}</div>
            )}
          </>
        ) : null}

        {sanfona("semResposta", "Pedidos sem resposta", semResposta, { cobraResposta: true })}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

        <TesteDeAvisos destino="filial" />
      </div>
    </div>
  );
}