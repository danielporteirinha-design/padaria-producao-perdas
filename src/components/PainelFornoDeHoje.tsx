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
import { desfechoDoItem } from "../types/pedido";
import type { PedidoSuprimentos, Suprimento } from "../types/suprimento";
import { idDoSuprimento, segmentosExibidos } from "../types/suprimento";
import { adivinharSegmentoSuprimento } from "../lib/adivinharSuprimento";
import { nomeSugeridoDaSobra, quantidadeSugeridaDaSobra } from "../lib/sobraDeVoz";
import type { LinhaDaMatriz } from "../lib/reposicaoDoDia";
import type { BlocoSessaoImpressao } from "../lib/gerarImagemLista";
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
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { IconeConfere, IconeImpressora, IconeLixeira, IconeSeta, IconeSino } from "./Icones";

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
  /** Cadastro relâmpago de suprimento a partir da busca/voz na Reposição
   * da matriz (set/2026) — mesma operação de PainelFornadasFilial.tsx. */
  onCadastrarSuprimento: (suprimento: Suprimento) => Promise<void>;
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
  /**
   * Imprimir ou compartilhar o pedido de uma filial (set/2026, pedido do
   * dono do negócio: a opção "voltou ao app" depois de sair junto com o
   * card antigo de "Pedidos das filiais hoje").
   *
   * Abre a MESMA tela de cupom que a filial já usa para a própria lista
   * — com "Imprimir no caixa" e "Compartilhar" —, e não uma tela nova:
   * quem vai buscar a mercadoria precisa do mesmo papel, venha o pedido
   * de onde vier.
   */
  onImprimirReposicao?: (pedido: PedidoFilial) => void;
  /**
   * "Imprimir todos" da sanfona Pedidos sem resposta (set/2026, pedido
   * do dono do negócio): aceita e imprime, uma filial de cada vez, todos
   * os pedidos de reposição ainda pendentes — sem reabrir a tela a cada
   * filial. Ver `avancarFilaDeImpressao` em App.tsx.
   */
  onImprimirTodasReposicoes?: (pedidos: PedidoFilial[]) => void;
  /** Imprimir ou compartilhar a lista de suprimentos de uma filial. */
  onImprimirSuprimentos?: (pedido: PedidoSuprimentos) => void;
  /**
   * "Imprimir selecionados" da sanfona Pedidos concluídos (set/2026,
   * pedido do dono do negócio): o operador marca itens de reposição e/ou
   * listas de suprimentos já CONFIRMADOS, de qualquer filial, e recebe
   * um comprovante único — uma seção por filial, na mesma impressão.
   *
   * Devolve as sessões já montadas (ver `montarSessoesSelecionadas`)
   * porque quem sabe desenhar o comprovante é a mesma tela que já
   * desenha o de Reposição e o de Suprimentos.
   */
  onImprimirSelecionados?: (sessoes: BlocoSessaoImpressao[]) => void;
  /** Quem está operando o aparelho — carimbado em suprimentos cadastrados
   * por aqui (mesmo uso de PainelFornadasFilial.tsx). */
  operador: string;
}

export function PainelFornoDeHoje({
  produtos,
  fornadas,
  pedidos,
  pedidosSuprimentos = [],
  catalogoSuprimentos = [],
  dataHoje,
  encerrados,
  operador,
  onEncerrarAnuncio,
  onMarcarFornada,
  onCadastrarProduto,
  onCadastrarSuprimento,
  onDecidirReposicao,
  onDecidirSuprimentos,
  onImprimirReposicao,
  onImprimirTodasReposicoes,
  onImprimirSuprimentos,
  onImprimirSelecionados,
}: PainelFornoDeHojeProps) {
  const [marcando, setMarcando] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  /** Para onde a busca por texto e a conferência de voz são entregues,
   * com a barra de busca+microfone fixa no rodapé (set/2026, pedido do
   * dono do negócio) — mesma ideia de TelaPedidoFilial.tsx. */
  const [painelExtraNode, setPainelExtraNode] = useState<HTMLDivElement | null>(null);
  /** O microfone está aberto? Enquanto estiver, a busca some da tela. */
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [salvandoSuprimentoNovo, setSalvandoSuprimentoNovo] = useState("");
  /**
   * QUANDO A PESSOA DISCORDA DO PALPITE (set/2026, mesma ideia de
   * PainelFornadasFilial.tsx): o app tenta adivinhar se o que não foi
   * achado é produto de padaria ou suprimento; um link troca o tipo
   * sugerido sem reiniciar a busca. `null` = confia no palpite.
   */
  const [tipoForcadoPara, setTipoForcadoPara] = useState<{
    texto: string;
    tipo: "produto" | "suprimento";
  } | null>(null);
  const segmentosCadastro = useMemo(
    () => segmentosExibidos(catalogoSuprimentos),
    [catalogoSuprimentos]
  );

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
  /**
   * A PERGUNTA "IMPRIMIR O COMPROVANTE?" depois de aceitar o ÚLTIMO item
   * pendente de um pedido (set/2026, pedido do dono do negócio) — ver o
   * disparo em `responder()`.
   */
  const [perguntaImprimir, setPerguntaImprimir] = useState<PedidoFilial | null>(null);
  /**
   * Chaves de linha marcadas em Pedidos concluídos para a lista
   * personalizada (set/2026) — ver `montarSessoesSelecionadas`.
   */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  function alternarSelecao(chave: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

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
        /**
         * PERGUNTA DE IMPRESSÃO SÓ NO ÚLTIMO ITEM PENDENTE (set/2026,
         * pedido do dono do negócio: "após aceitar o pedido da filial,
         * receberá uma mensagem perguntando se deseja imprimir").
         *
         * Recusar não pergunta nada — só se imprime pedido aceito. E
         * enquanto sobrar item pendente no MESMO pedido, a pergunta
         * espera: senão o operador veria uma pergunta a cada produto,
         * numa filial que pediu vários.
         *
         * `linha.pedido` aqui é o retrato de ANTES desta decisão — serve
         * porque só olhamos os OUTROS itens, que esta chamada não muda.
         */
        if (desfecho === "confirmado" && onImprimirReposicao) {
          const pedidoAntes = linha.pedido;
          const restaPendente = pedidoAntes.itens.some(
            (i) => i.codigoPdv !== linha.codigoPdv && desfechoDoItem(pedidoAntes, i.codigoPdv) === "pendente"
          );
          if (!restaPendente) setPerguntaImprimir(pedidoAntes);
        }
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
   * Pedidos ÚNICOS de reposição ainda pendentes, para o botão "Imprimir
   * todos" (set/2026) — a linha é uma por ITEM, mas o botão imprime um
   * comprovante por FILIAL, então dois itens do mesmo pedido não podem
   * virar dois cliques.
   */
  const pedidosPendentesDeReposicao = useMemo(() => {
    const vistos = new Set<string>();
    const unicos: PedidoFilial[] = [];
    for (const linha of semResposta) {
      if (linha.tipo !== "pedido" || !linha.pedido) continue;
      if (vistos.has(linha.pedido.id)) continue;
      vistos.add(linha.pedido.id);
      unicos.push(linha.pedido);
    }
    return unicos;
  }, [semResposta]);
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

  /**
   * Monta o comprovante da LISTA PERSONALIZADA a partir do que está
   * marcado em `selecionados` (set/2026, pedido do dono do negócio):
   * reposição e suprimentos misturados, agrupados por filial — uma
   * seção "Reposição" e uma seção "Suprimentos" por loja que tiver item
   * marcado, com `inicioDeDestino` só na PRIMEIRA seção de cada loja
   * (é o que desenha o nome da filial e separa uma da outra no papel).
   *
   * Só chega aqui item com `situacao === "pedido"` (confirmado) — o
   * checkbox nem aparece nos recusados (ver `historicoPorLoja`).
   */
  function montarSessoesSelecionadas(): BlocoSessaoImpressao[] {
    const porLoja = new Map<string, LinhaDaMatriz[]>();
    for (const linha of concluidos) {
      if (!selecionados.has(linha.chave)) continue;
      const loja = linha.lojaId ?? "";
      porLoja.set(loja, [...(porLoja.get(loja) ?? []), linha]);
    }

    const sessoes: BlocoSessaoImpressao[] = [];
    for (const [lojaId, doGrupo] of porLoja) {
      let ehAPrimeiraDaLoja = true;
      const itensReposicao = doGrupo.filter((l) => l.tipo === "pedido");
      if (itensReposicao.length > 0) {
        sessoes.push({
          rotuloSessao: "Reposição",
          itens: itensReposicao.map((l) => ({
            codigoPdv: l.codigoPdv,
            quantidadeUnidades: l.pedidoUnidades ?? 0,
          })),
          inicioDeDestino: nomeDaLoja(lojaId),
        });
        ehAPrimeiraDaLoja = false;
      }
      for (const linha of doGrupo.filter((l) => l.tipo === "suprimentos")) {
        sessoes.push({
          rotuloSessao: "Suprimentos",
          itens: [],
          linhasProntas: (linha.suprimentos?.itens ?? [])
            .filter((i) => i.quantidade > 0)
            .map((i) => ({
              nome: nomePorSuprimentoId.get(i.suprimentoId) ?? i.suprimentoId,
              unidades: i.quantidade,
            })),
          inicioDeDestino: ehAPrimeiraDaLoja ? nomeDaLoja(lojaId) : undefined,
        });
        ehAPrimeiraDaLoja = false;
      }
    }
    return sessoes;
  }

  async function cadastrarProdutoNovo(
    nome: string,
    categoria: string,
    quantidadeInicial?: number | null
  ) {
    const limpo = nome.trim();
    if (!limpo || salvandoNovo) return;
    setSalvandoNovo(true);
    try {
      const novo = await onCadastrarProduto({
        nome: limpo,
        categoria,
        unidadeProducao: "un",
        ativoNaProducao: true,
        prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[categoria] ?? null,
      });
      if (!novo) return;
      await onMarcarFornada(novo.codigoPdv, novo.nome, quantidadeInicial ?? undefined);
      setBusca("");
      setTipoForcadoPara(null);
    } catch {
      // Mensagem já vem do aviso global (ver App.tsx).
    } finally {
      setSalvandoNovo(false);
    }
  }

  /** Cadastro relâmpago de SUPRIMENTO na Reposição da matriz (set/2026)
   * — mesma operação de PainelFornadasFilial.tsx. Sem "anunciar" e sem
   * lista de pedido: a matriz só está incluindo o item no catálogo. */
  async function cadastrarSuprimentoNovo(nome: string, segmento: string) {
    const limpo = nome.trim();
    if (!limpo || salvandoSuprimentoNovo) return;
    setSalvandoSuprimentoNovo(segmento);
    try {
      const novo: Suprimento = {
        id: idDoSuprimento(limpo),
        nome: limpo,
        segmento,
        ativo: true,
        criadoPor: operador,
        criadoEm: new Date().toISOString(),
      };
      await onCadastrarSuprimento(novo);
      setBusca("");
      setTipoForcadoPara(null);
    } catch {
      // Mensagem já vem do aviso global (ver App.tsx).
    } finally {
      setSalvandoSuprimentoNovo("");
    }
  }

  /**
   * O CARTÃO EM SI — produto ou suprimento, um toque cadastra (set/2026).
   * `adivinharSegmentoSuprimento` chuta pelo nome; um link deixa trocar o
   * palpite sem reiniciar a busca. Aparece tanto na busca digitada
   * quanto na sobra de voz — por isso recebe `remover`.
   */
  function cadastroRelampago(
    nomeBruto: string,
    quantidadeInicialSugerida?: number | null,
    remover?: () => void
  ) {
    const nome = nomeBruto.trim();
    if (!nome) return null;

    const sugestao = adivinharSegmentoSuprimento(nome);
    const substituindo = tipoForcadoPara?.texto === nome ? tipoForcadoPara.tipo : null;
    const tipo = substituindo ?? (sugestao ? "suprimento" : "produto");

    function cancelar() {
      if (remover) remover();
      else setBusca("");
      setTipoForcadoPara(null);
    }

    return (
      <div className="cadastro-relampago">
        <p className="nota-rodape">
          {quantidadeInicialSugerida ? `${quantidadeInicialSugerida} ` : ""}
          <strong>{nome}</strong> não está no catálogo.
        </p>

        {tipo === "produto" ? (
          <>
            <p className="nota-rodape">Em qual categoria (produto de padaria)?</p>
            <div className="setores-do-novo">
              {CATEGORIAS_PRODUCAO.map((categoria) => (
                <button
                  key={categoria.chave}
                  type="button"
                  className="chip-setor"
                  disabled={salvandoNovo}
                  onClick={() =>
                    void cadastrarProdutoNovo(nome, categoria.chave, quantidadeInicialSugerida)
                  }
                >
                  {categoria.rotulo}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="nota-rodape">
              {sugestao ? "Parece suprimento — incluir em:" : "Suprimento — incluir em:"}
            </p>
            <div className="setores-do-novo">
              {segmentosCadastro.map((segmento) => {
                const valorGravado = segmento.personalizado ? segmento.rotulo : segmento.chave;
                return (
                  <button
                    key={segmento.chave}
                    type="button"
                    className={`chip-setor ${sugestao === segmento.chave ? "sugerido" : ""}`}
                    disabled={salvandoSuprimentoNovo !== ""}
                    onClick={() => void cadastrarSuprimentoNovo(nome, valorGravado)}
                  >
                    {salvandoSuprimentoNovo === valorGravado ? "Salvando..." : segmento.rotulo}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="acoes">
          <button type="button" className="link" onClick={cancelar}>
            {remover ? "descartar" : "cancelar"}
          </button>
          <button
            type="button"
            className="link"
            onClick={() =>
              setTipoForcadoPara({ texto: nome, tipo: tipo === "produto" ? "suprimento" : "produto" })
            }
          >
            {tipo === "produto" ? "na verdade é suprimento" : "na verdade é produto de padaria"}
          </button>
        </div>
      </div>
    );
  }

  /** O que oferecer para um trecho que o microfone não reconheceu. */
  function opcoesParaSobra(trecho: string, remover: () => void) {
    const nome = nomeSugeridoDaSobra(trecho) || trecho.trim();
    if (!nome) return null;
    return cadastroRelampago(nome, quantidadeSugeridaDaSobra(trecho), remover);
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
            {chave === "semResposta" &&
              onImprimirTodasReposicoes &&
              pedidosPendentesDeReposicao.length > 0 && (
                <button
                  type="button"
                  className="botao-fornada largura-cheia"
                  onClick={() => onImprimirTodasReposicoes(pedidosPendentesDeReposicao)}
                >
                  <IconeImpressora tamanho={15} /> Imprimir todos (
                  {pedidosPendentesDeReposicao.length}{" "}
                  {pedidosPendentesDeReposicao.length === 1 ? "pedido" : "pedidos"})
                </button>
              )}
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

          {/* IMPRIMIR OU COMPARTILHAR VOLTOU AO APP (set/2026, pedido do
              dono do negócio) — tinha saído junto com o card antigo de
              "Pedidos das filiais hoje". Abre a MESMA tela de cupom que a
              filial já usa ("Imprimir no caixa" + "Compartilhar"): quem
              vai separar a mercadoria precisa do papel na mão para
              decidir, não só depois de confirmar.

              REPOSIÇÃO TEM UMA LINHA POR ITEM, mas o pedido é um só
              documento com todos os itens da filial — por isso o botão
              aparece uma vez só, na linha do PRIMEIRO item do pedido, e
              imprime a lista inteira. Suprimentos já é uma linha por
              lista, então aparece sempre. */}
          {((ehSuprimentos && onImprimirSuprimentos && linha.suprimentos) ||
            (!ehSuprimentos &&
              onImprimirReposicao &&
              linha.pedido &&
              linha.pedido.itens[0]?.codigoPdv === linha.codigoPdv)) && (
            <button
              type="button"
              className="botao-fornada"
              onClick={() =>
                ehSuprimentos
                  ? onImprimirSuprimentos!(linha.suprimentos!)
                  : onImprimirReposicao!(linha.pedido!)
              }
            >
              <IconeImpressora tamanho={15} /> Imprimir
            </button>
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
        {doGrupo.map((linha) => {
          /**
           * SÓ CONFIRMADO ENTRA NA LISTA PERSONALIZADA (set/2026, pedido
           * do dono do negócio) — recusado não vai para separação nem
           * entrega, então nem ganha checkbox.
           */
          const podeSelecionar = !!onImprimirSelecionados && linha.situacao === "pedido";
          return (
            <div
              key={linha.chave}
              className={`linha-historico ${podeSelecionar ? "selecionavel" : ""}`}
            >
              {podeSelecionar && (
                <input
                  type="checkbox"
                  className="selecionar-historico"
                  checked={selecionados.has(linha.chave)}
                  onChange={() => alternarSelecao(linha.chave)}
                  aria-label={`Selecionar ${
                    linha.tipo === "suprimentos" ? "suprimentos" : nomeDoProduto(linha.codigoPdv)
                  } para a lista personalizada`}
                />
              )}
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
          );
        })}
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
    <div className={`painel-forno ${selecionados.size > 0 ? "com-acao-fixa" : ""}`}>
      <div className="corpo-forno">
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

        {/* O PAINEL FLUTUANTE ACIMA DA BARRA FIXA (set/2026, pedido do
            dono do negócio: "o novo botão de busca deve substituir todos
            os botões de voz do app... na parte inferior da tela, ao
            alcance do polegar, em todas as abas"). Recebe os resultados
            da busca (aqui) e a conferência de voz (entregue por portal
            pelo AssistenteDeVoz.tsx). A barra em si — busca + microfone
            compacto — é fixa, logo abaixo. */}
        <div
          ref={setPainelExtraNode}
          className={`painel-extra-fixo ${selecionados.size > 0 ? "acima-da-acao-fixa" : ""}`}
        >
          {buscando ? (
            <>
              {resultados.length === 0 ? (
                cadastroRelampago(busca.trim())
              ) : (
                <div className="grupo-forno">{resultados.map((p) => linhaDoProduto(p.codigoPdv))}</div>
              )}
            </>
          ) : null}
        </div>

        <div className="barra-busca-fixa">
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
            <AssistenteDeVoz
              compacto
              portalConteudoExtra={painelExtraNode}
              produtos={produtos}
              modo="anunciar"
              renderSobra={opcoesParaSobra}
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
          </CampoDeBusca>
        </div>

        {perguntaImprimir && onImprimirReposicao && (
          <div className="pergunta-imprimir" role="status">
            <span>
              Pedido de <strong>{nomeDaLoja(perguntaImprimir.lojaId)}</strong> aceito. Imprimir o
              comprovante de pedido de Reposição?
            </span>
            <span className="acoes">
              <button
                type="button"
                className="primario"
                onClick={() => {
                  onImprimirReposicao(perguntaImprimir);
                  setPerguntaImprimir(null);
                }}
              >
                Sim, imprimir
              </button>
              <button type="button" className="link" onClick={() => setPerguntaImprimir(null)}>
                Não
              </button>
            </span>
          </div>
        )}

        {sanfona("semResposta", "Pedidos sem resposta", semResposta, { cobraResposta: true })}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

        {/* BOTAO FIXO, PERTO DO POLEGAR (set/2026, pedido do dono do
            negocio: "o botao de imprimir deve aparecer... na parte
            inferior da tela, na altura do polegar, e no mesmo estilo de
            cor destacado do botao do microfone"). Mesmo padrao de
            `.acao-fixa-secundaria` + `.primario` ja usado em Enviar
            pedido, Confirmar producao e Incluir/cancelar — a mesma cor
            de acento do microfone compacto. Independente da sanfona
            estar aberta ou fechada: quem marcou itens e fechou a
            sanfona por engano nao perde a selecao nem o botao. */}
        {onImprimirSelecionados && selecionados.size > 0 && (
          <div className="acao-fixa-secundaria">
            <button
              type="button"
              className="primario"
              onClick={() => {
                onImprimirSelecionados(montarSessoesSelecionadas());
                setSelecionados(new Set());
              }}
            >
              <IconeImpressora tamanho={15} /> Imprimir selecionados ({selecionados.size})
            </button>
          </div>
        )}

      </div>
    </div>
  );
}