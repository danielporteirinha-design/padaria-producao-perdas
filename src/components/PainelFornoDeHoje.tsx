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
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import { ordenarPorAnuncioRecente } from "../lib/ordemDaReposicao";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { contemBusca } from "../lib/texto";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { IconeLixeira } from "./Icones";

/**
 * Quantos resultados a busca mostra. O catálogo tem centenas de itens; a
 * lista inteira rolando embaixo do campo não ajuda ninguém a achar
 * nada — quem não achou em 12 linhas digita mais uma letra.
 */
const MAXIMO_RESULTADOS = 12;

interface PainelFornoDeHojeProps {
  /**
   * Plano confirmado de HOJE, quando existe. Opcional desde ago/2026: a
   * busca anuncia qualquer produto do catálogo, e um dia sem cronograma
   * montado (feriado, movimento imprevisto) não pode impedir a matriz de
   * avisar as filiais do que acabou de sair.
   */
  plano?: PlanoDeProducaoDiario;
  produtos: Produto[];
  fornadas: FornadaPronta[];
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
  plano,
  produtos,
  fornadas,
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
   * A lista do dia achatada, do anúncio mais recente para o mais antigo.
   *
   * Sem repetir o produto que aparece em duas sessões e sem os que foram
   * tirados da lista. A ordem do cronograma (a ordem em que a padaria
   * produz) sobrevive só entre os itens que ainda não saíram, no fim da
   * lista — o porquê está em src/lib/ordemDaReposicao.ts.
   */
  const itensDoDia = useMemo(() => {
    if (!plano) return [];
    const vistos = new Set<number>();
    const lista: number[] = [];
    for (const sessao of plano.sessoes) {
      for (const item of sessao.itens) {
        if (vistos.has(item.codigoPdv) || encerrados.has(item.codigoPdv)) continue;
        vistos.add(item.codigoPdv);
        lista.push(item.codigoPdv);
      }
    }
    return ordenarPorAnuncioRecente(lista, fornadas, dataHoje);
  }, [plano, encerrados, fornadas, dataHoje]);

  /** Nomes que a IA pode escolher ao interpretar o que foi ditado. */
  const nomesAtivos = useMemo(
    () => produtos.filter((p) => p.ativoNaProducao).map((p) => p.nome),
    [produtos]
  );

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
  function linhaDoProduto(codigoPdv: number, podeTirarDaLista = false) {
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

        {/* Tirar da VITRINE, não do histórico (ago/2026). As fornadas já
            marcadas continuam gravadas e continuam alimentando o
            relatório do forno em Análises; o que muda é que as FILIAIS
            param de ver o produto como disponível hoje.

            Antes isto era só uma lista local deste aparelho, e o efeito
            ficava pela metade: a matriz parava de ver, a filial continuava
            pedindo mercadoria que tinha acabado. */}
        {podeTirarDaLista && (
          <button
            type="button"
            className="tirar-da-lista"
            aria-label={`Tirar ${nomeDoProduto(codigoPdv)} da lista de hoje e das filiais`}
            title="Tirar da lista — as filiais param de ver hoje"
            onClick={() => void onEncerrarAnuncio(codigoPdv)}
          >
            <IconeLixeira tamanho={16} />
          </button>
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
          nomesParaVoz={nomesAtivos}
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
        ) : (
          <>
            {/* Lista CORRIDA, sem separar por sessão (ago/2026, decisão do
                dono do negócio). Aqui não se planeja nada: só se anuncia o
                que acabou de sair, e o cabeçalho de categoria só empurrava
                a lista para baixo sem ajudar a achar. A ordem é a do
                cronograma, que é a ordem em que a padaria produz. */}
            {!plano ? (
              <p className="nota-rodape">Sem cronograma hoje. Use a busca acima.</p>
            ) : itensDoDia.length === 0 ? (
              <p className="nota-rodape">Lista vazia.</p>
            ) : (
              <div className="grupo-forno">
                {itensDoDia.map((codigoPdv) => linhaDoProduto(codigoPdv, true))}
              </div>
            )}

            {/* O caminho de volta. Fica fora da lista de propósito: quando
                alguém tira o último item, é justamente aqui que ele
                precisa estar. */}
            {/* Uma linha só, como na tela da filial (ago/2026, decisão do
                dono do negócio). A lista nomeada, com um "devolver" por
                item, ocupava a tela com o que NÃO está em jogo — e a
                pessoa que abre esta aba veio anunciar, não administrar o
                que já tirou. Devolver tudo de uma vez é o caso comum:
                acabou o dia, começa outro. */}
            {/* Uma PASTILHA, não um parágrafo (ago/2026, pedido do dono do
                negócio: a frase longa virava ruído justamente depois de
                uma ação de limpeza). A lixeira riscada e o número dizem o
                estado sem exigir leitura; o toque desfaz. O que a frase
                explicava — que as filiais deixam de ver — já é o efeito
                que a pessoa acabou de provocar de propósito. */}
            {encerrados.size > 0 && (
              <button
                type="button"
                className="pastilha-escondidos"
                aria-label={`Mostrar de novo ${encerrados.size} item(ns) escondido(s)`}
                onClick={() => void onReabrirTudo()}
              >
                <IconeLixeira tamanho={15} />
                {encerrados.size}
                <span className="acao-pastilha">mostrar</span>
              </button>
            )}
          </>
        )}

        {/* Diagnóstico, não operação: fica no rodapé, discreto, e só
            aparece o resultado quando alguém pergunta. */}
        <TesteDeAvisos destino="filiais" />
      </div>
    </div>
  );
}
