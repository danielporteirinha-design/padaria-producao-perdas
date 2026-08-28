/**
 * src/components/PainelFornoDeHoje.tsx
 * ---------------------------------------------------------------
 * Marcação de fornada pronta, ao longo do expediente (ago/2026).
 *
 * POR QUE É UM PAINEL PRÓPRIO, E NÃO UM BOTÃO NA LISTA DO CRONOGRAMA
 * ------------------------------------------------------------------
 * A tela de Cronograma abre no dia SEGUINTE — ela existe para planejar.
 * Marcar fornada é sobre HOJE. Na primeira versão o botão ficava em cada
 * item da lista de planejamento, e o padeiro teria que trocar a data para
 * hoje toda vez que uma fornada saísse: seis vezes por dia, só de pão
 * francês. Ninguém faria, e o recurso morreria sem nunca ser usado
 * (defeito encontrado em teste antes da entrega).
 *
 * Aqui é o contrário: o painel fica no topo, sempre mostrando a produção
 * de HOJE, independente da data que o operador esteja planejando embaixo.
 * Abriu o app, marcou, fechou.
 *
 * UM TOQUE, SEM QUANTIDADE. Um item que sai seis vezes por dia viraria
 * seis digitações. O que a filial precisa saber é que saiu e a que horas;
 * quanto ela quer, ela informa no pedido de reposição.
 */

import { useMemo, useState } from "react";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import type { LinhaDaMatriz } from "../lib/reposicaoDoDia";
import { anuncioPendente, montarLinhasDaMatriz } from "../lib/reposicaoDoDia";
import { horaDoInstante } from "../lib/data";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { contemBusca } from "../lib/texto";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { IconeConfere, IconeLixeira, IconeSeta } from "./Icones";

/**
 * Quantos resultados a busca mostra. O catálogo tem centenas de itens; a
 * lista inteira rolando embaixo do campo não ajuda ninguém a achar
 * nada — quem não achou em 12 linhas digita mais uma letra.
 */
const MAXIMO_RESULTADOS = 12;

interface PainelFornoDeHojeProps {
  produtos: Produto[];
  fornadas: FornadaPronta[];
  /**
   * Pedidos do dia — é por eles que a matriz sabe se um anúncio foi
   * respondido por alguma loja.
   */
  pedidos: PedidoFilial[];
  dataHoje: string;
  /**
   * Produtos que a matriz tirou da vitrine de hoje. Vem de fora porque
   * mora na NUVEM: quem decide o que está disponível é a matriz, e a
   * decisão precisa chegar às filiais — ver src/types/anuncio.ts. Antes
   * isto era uma lista local do aparelho, e por isso a filial continuava
   * oferecendo o que a matriz já tinha tirado.
   */
  encerrados: Set<number>;
  onEncerrarAnuncio: (codigoPdv: number) => Promise<void>;
  /** Devolve TODOS à vitrine de uma vez — o "mostrar de novo". */
  onReabrirTudo: () => Promise<void>;
  onMarcarFornada: (
    codigoPdv: number,
    nomeConhecido?: string,
    quantidade?: number
  ) => Promise<void>;
  /**
   * Cadastro relâmpago do produto que não está no catálogo. Devolve o
   * produto criado — o código novo é o que permite anunciar a fornada na
   * mesma ação. `undefined` quando a gravação não confirmou (sem rede).
   */
  onCadastrarProduto: (input: NovoProdutoInput) => Promise<Produto | undefined>;
}

export function PainelFornoDeHoje({
  produtos,
  fornadas,
  pedidos,
  dataHoje,
  encerrados,
  onEncerrarAnuncio,
  onReabrirTudo,
  onMarcarFornada,
  onCadastrarProduto,
}: PainelFornoDeHojeProps) {
  const [marcando, setMarcando] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  /**
   * Cadastro relâmpago: fechado até a matriz pedir. Guarda só a categoria
   * — o nome vem do que ela já digitou na busca, e repetir a digitação
   * seria o oposto de um atalho.
   */
  const [cadastrando, setCadastrando] = useState(false);
  const [categoriaNova, setCategoriaNova] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [aberta, setAberta] = useState<Record<string, boolean>>({ semResposta: true });

  const nomeDoProduto = (codigo: number) =>
    produtos.find((p) => p.codigoPdv === codigo)?.nome ?? `#${codigo}`;

  /**
   * Resultado da busca no catálogo INTEIRO — não só na lista do dia.
   *
   * É a razão de a busca existir (pedido do dono do negócio, ago/2026): a
   * matriz assa coisa que não estava programada, e sem um caminho para
   * anunciar esse item as filiais só descobrem no dia seguinte, quando
   * não adianta mais. Aqui ela digita o nome, toca, e as três lojas
   * ficam sabendo na hora.
   *
   * Só produtos ATIVOS na produção: anunciar item pausado no cadastro
   * abriria pedido de reposição de coisa que a padaria decidiu não fazer.
   */
  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca]);

  const buscando = busca.trim().length > 0;

  /**
   * O DIA DA MATRIZ EM DUAS SANFONAS (ago/2026, decisão do dono do
   * negócio: esta aba "é para ficar no mesmo estilo da aba das filiais").
   *
   * O que saiu daqui: a LISTA PRONTA vinda do cronograma e a PASTILHA de
   * "mostrar escondidos". A lista pronta oferecia dezenas de produtos que
   * ainda não tinham ido ao forno, e anunciar é sobre o que ACABOU de
   * sair — o item certo ficava perdido no meio do que não estava em jogo.
   * A pastilha guardava o que já tinha sido tirado atrás de um ícone de
   * lixeira, que ninguém lê como "ver de novo".
   *
   * No lugar: fala ou busca para anunciar, e o histórico do dia separado
   * por quem ainda deve resposta.
   */
  const linhas = useMemo(
    () => montarLinhasDaMatriz({ fornadas, pedidos, hoje: dataHoje, encerrados }),
    [fornadas, pedidos, dataHoje, encerrados]
  );
  const semResposta = useMemo(() => linhas.filter(anuncioPendente), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !anuncioPendente(l)), [linhas]);

  /**
   * Cadastra e anuncia numa ação só.
   *
   * É o fluxo real: a matriz não veio ao catálogo administrar produto —
   * ela assou uma coisa nova e quer avisar as filiais. Mandá-la para a
   * aba Produtos, cadastrar, voltar, buscar de novo e só então anunciar
   * são cinco passos para uma intenção só, com o pão esfriando.
   *
   * O nome vem da busca e a categoria é escolhida aqui. Só isso: unidade
   * é sempre "un" e a validade sai da categoria, exatamente como no
   * cadastro completo (ver TelaCadastroProdutos.tsx). Categoria não tem
   * padrão de propósito — arquivar na primeira da lista contamina o
   * cronograma e toda análise por categoria, em silêncio.
   */
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
      // Sem produto de volta, a gravação ficou enfileirada: o aviso global
      // já explicou. Anunciar um código que ainda não existe na nuvem
      // mandaria as filiais um item que elas não conseguem abrir.
      if (!novo) return;
      // O nome vai junto: o produto acabou de nascer e a lista de
      // `produtos` do App ainda não o tem — ver handleMarcarFornada.
      await onMarcarFornada(novo.codigoPdv, novo.nome);
      // A busca CONTINUA no campo de propósito: com o produto criado, ele
      // passa a aparecer nos resultados logo abaixo, com a hora da
      // fornada. É a confirmação de que deu certo, na própria tela.
      setCadastrando(false);
      setCategoriaNova("");
    } catch {
      /* o aviso global cuida da mensagem */
    } finally {
      setSalvandoNovo(false);
    }
  }

  /** A linha é a mesma na busca e na lista do dia — um jeito só de marcar. */
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
              // Anunciar devolve o produto à vitrine — quem reabre é o
              // App, junto da gravação na nuvem, para a filial voltar a
              // ver no mesmo instante.
              await onMarcarFornada(codigoPdv);
            } catch {
              /* o aviso global cuida da mensagem */
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

  /** Uma sanfona, igual às duas da tela da filial. */
  function sanfona(chave: string, titulo: string, lista: LinhaDaMatriz[]) {
    const abertaAgora = !!aberta[chave];
    return (
      <div className={`acordeao-sessao ${abertaAgora ? "aberta" : ""}`}>
        <div className="cabecalho-sessao">
          <button
            type="button"
            className="abrir-sessao"
            aria-expanded={abertaAgora}
            onClick={() => setAberta((a) => ({ ...a, [chave]: !a[chave] }))}
          >
            <span className="nome-sessao">{titulo}</span>
            <span className="contagem-itens">
              {lista.length > 0 ? `${lista.length} ${lista.length === 1 ? "item" : "itens"}` : ""}
            </span>
            <IconeSeta className="seta-sessao" />
          </button>
        </div>
        {abertaAgora && (
          <div className="corpo-sessao">
            {lista.length === 0 ? (
              <p className="nota-rodape">Nada aqui hoje.</p>
            ) : (
              lista.map((linha) => linhaAnunciada(linha))
            )}
          </div>
        )}
      </div>
    );
  }

  /** Uma linha do histórico do dia da matriz. */
  function linhaAnunciada(linha: LinhaDaMatriz) {
    return (
      <div key={linha.chave} className="linha-reposicao">
        <span className="nome-reposicao">
          <span className="topo-reposicao">
            <em className="etiqueta-origem matriz">Anunciei</em>
            <strong>{nomeDoProduto(linha.codigoPdv)}</strong>
            {/* A hora de cada ocorrência — sem ela, duas fornadas do
                mesmo produto no mesmo dia são indistinguíveis. */}
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
            <span className="reposicao-negada">Tirado da vitrine — as filiais não veem mais.</span>
          )}

          <span className="acoes-fornada">
            {linha.situacao === "encerrado" ? (
              <button
                type="button"
                className="botao-fornada pedir"
                onClick={() => void onReabrirTudo()}
              >
                Devolver à vitrine
              </button>
            ) : (
              <button
                type="button"
                className="botao-fornada excluir"
                title="Tirar da vitrine — as filiais param de ver hoje"
                aria-label={`Tirar ${nomeDoProduto(linha.codigoPdv)} da vitrine`}
                onClick={() => void onEncerrarAnuncio(linha.codigoPdv)}
              >
                <IconeLixeira tamanho={15} />
              </button>
            )}
          </span>
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
        {/* A contagem "X de Y itens já saíram hoje" saiu daqui (ago/2026):
            esta aba não é sobre progresso da lista — é sobre anunciar o
            que acabou de sair. O progresso do dia se lê no card de
            confirmação, no Cronograma, que é onde ele decide alguma
            coisa. */}
        {/* O DIÁLOGO DE MÃOS LIVRES VEM ANTES DA BUSCA (ago/2026, pedido
            do dono do negócio). Anunciar é o que traz alguém a esta aba, e
            é feito com as mãos ocupadas — o caminho que não exige tocar na
            tela é o caminho principal. A busca continua logo abaixo para
            quem prefere digitar, ou para o dia em que a padaria estiver
            barulhenta demais. */}
        <AssistenteDeVoz
          produtos={produtos}
          modo="anunciar"
          onConfirmar={async (itens) => {
            // Um por vez, em fila: cada anúncio é uma gravação e um push
            // próprios, e disparar tudo junto tiraria da matriz a chance
            // de ver qual falhou.
            for (const item of itens) {
              await onMarcarFornada(
                item.produto.codigoPdv,
                item.produto.nome,
                item.quantidade ?? undefined
              );
            }
          }}
        />

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

        {buscando ? (
          <>
            {resultados.length === 0 ? (
              /* NÃO ACHOU = OFERECE CADASTRAR (ago/2026, pedido do dono do
                 negócio: "se esse produto não estiver cadastrado no
                 sistema, o app deve fornecer-lhe essa opção de cadastro
                 como um atalho simples e rápido").

                 Antes, a busca sem resultado era um beco: uma frase
                 dizendo que não achou, e a saída era decorar o nome, ir
                 até a aba Produtos e voltar. O caminho para frente estava
                 faltando justamente onde a pessoa parou. */
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

        {sanfona("semResposta", "Anúncios sem resposta", semResposta)}
        {sanfona("concluidos", "Anúncios concluídos", concluidos)}

        {/* Diagnóstico, não operação: fica no rodapé, discreto, e só
            aparece o resultado quando alguém pergunta. */}
        <TesteDeAvisos destino="filiais" />
      </div>
    </div>
  );
}
