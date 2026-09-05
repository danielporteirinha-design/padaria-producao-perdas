/**
 * src/components/TelaCronograma.tsx
 * ---------------------------------------------------------------
 * A TELA É UMA PILHA DE CARDS, UM ASSUNTO CADA (ago/2026)
 * --------------------------------------------------------
 *   1. Programação geral — só leitura: todos os itens de todas as lojas
 *      reunidos, com a quantidade TOTAL de cada um. É a conta que o
 *      padeiro executa.
 *   2. Confirmar o que foi produzido — a outra metade do ciclo: o que
 *      realmente saiu do forno HOJE.
 *   3. Matriz — onde a matriz LANÇA o cronograma dela (a sanfona das 5
 *      categorias). Cada loja lança no card dela: a filial enviando a
 *      lista do próprio aparelho, a matriz aqui.
 *   4-5. Uma filial por card — o que sai da matriz para aquele destino.
 *
 * Antes a matriz lançava dentro da "Programação geral", o que misturava
 * duas perguntas diferentes: o que UMA loja quer e o que a padaria
 * inteira vai produzir.
 *
 * Fluxo do lançamento (card 3): as 5 categorias fixas exibidas recolhidas
 * (acordeão) -> tocar num produto abre uma textbox de quantidade (sempre
 * em UNIDADES, protegida contra erro de digitação) -> Confirmar adiciona
 * à lista -> Resumo (conferência final) -> Confirmar produção salva o
 * plano -> Exportar/Imprimir (uma única fita com todas as sessões,
 * separadas por linha de corte, pronta para WhatsApp/impressora térmica).
 *
 * Sempre monta a produção do DIA SEGUINTE (decisão operacional: o
 * cronograma é fechado no fim do expediente do dia anterior).
 *
 * Cada categoria fixa tem um botão "Sugerir com IA" (Gemini, via
 * src/lib/sugestaoProducao.ts) que pré-preenche quantidades vazias com
 * base no histórico de produção/perda — sempre assistido, nunca
 * automático: o operador revisa e ajusta antes de confirmar.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { ItemPlanoProducao, PlanoDeProducaoDiario, SessaoProducao } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { proximaDataAlvo } from "../lib/dataAlvoDoDia";
import { proximoDiaUtilMatriz } from "../lib/feriados";
import {
  apagarRascunho,
  gravarRascunho,
  lerRascunho,
  limparRascunhosAntigos,
  mapaDoPlano,
  mapasIguais,
} from "../lib/rascunhoCronograma";
import { gerarId } from "../lib/id";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { buscarSugestaoProducao, montarHistoricoPorCategoria, ErroSugestaoProducao } from "../lib/sugestaoProducao";
import { ExportarFita } from "./ExportarFita";
import {
  ajustarPedidoPelaMatriz,
  diferencasDoAjuste,
  ehPedidoDiario,
  itensIguais,
  type PedidoFilial,
} from "../types/pedido";
import {
  apagarAjuste,
  gravarAjuste,
  lerAjuste,
  limparAjustesAntigos,
} from "../lib/rascunhoPedido";
import { FILIAIS, LOJA_MATRIZ, nomeDaLoja } from "../lib/lojas";
import {
  consolidarProducao,
  itensParaLoja,
  type ItemConsolidado,
} from "../lib/consolidacao";
import { agruparPorCategoria } from "../lib/blocosDeImpressao";
import { contemBusca } from "../lib/texto";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { CampoDeBusca } from "./CampoDeBusca";
import { IconeCalendario, IconeImpressora, IconeLixeira, IconeSeta } from "./Icones";

interface TelaCronogramaProps {
  produtos: Produto[];
  /** Pedidos das filiais — entram no total a produzir (ver consolidacao.ts). */
  pedidos: PedidoFilial[];
  /** Envia as imagens para a impressora térmica do caixa (ver types/impressao.ts). */
  onImprimirNoCaixa: (canvases: HTMLCanvasElement[], documento: string, nomeBase: string) => Promise<void>;
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  /** Data de hoje, viva — ver src/lib/useDiaCorrente.ts. */
  hoje: string;
  onSalvarPlano: (plano: PlanoDeProducaoDiario) => Promise<void>;
  /**
   * A matriz confirma a lista de uma filial, possivelmente com outras
   * quantidades. Grava o pedido ajustado e avisa a loja — ver
   * ajustarPedidoPelaMatriz em src/types/pedido.ts.
   */
  onAjustarPedido: (pedido: PedidoFilial) => Promise<void>;
  /**
   * Cadastro relâmpago de um produto que ainda não está no catálogo
   * (set/2026, pedido do dono do negócio: cadastro "pela matriz ou
   * filiais", direto de onde falta o produto). A categoria já vem
   * decidida pela sessão em que o botão aparece — só falta o nome.
   */
  onCadastrarProduto: (input: NovoProdutoInput) => Promise<Produto | undefined>;
}

/**
 * "resumo" saiu (ago/2026): a conferência final tinha tela própria porque
 * a montagem vivia dentro de um card que não mostrava a lista pronta.
 * Agora cada card de loja JÁ é a revisão — abrir o card e ler é a mesma
 * coisa que a tela de resumo fazia, sem tirar ninguém de onde está.
 */
type Fase = "montar" | "exportar";
type StatusSugestao = "" | "carregando" | "erro";

/**
 * A montagem do cronograma cobre SÓ as 5 categorias fixas de produção.
 * A sessão livre "Encomendas e Especiais" foi retirada daqui (decisão do
 * dono do negócio, ago/2026): encomenda não entra na programação diária.
 * CHAVE_ESPECIAL continua existindo em src/lib/categorias.ts só para que
 * rotuloDaCategoria() saiba traduzir a chave caso algum plano antigo a
 * tenha gravado — nunca é oferecida como sessão nova.
 */
const GRUPOS = CATEGORIAS_PRODUCAO.map((c) => c.chave);

/** Teto de resultados na busca — mesmo número usado na Lista de Produção
 * da filial e em Reposição. */
const MAXIMO_RESULTADOS = 12;

export function TelaCronograma({
  produtos,
  pedidos,
  onImprimirNoCaixa,
  planos,
  perdas,
  operador,
  hoje,
  onSalvarPlano,
  onAjustarPedido,
  onCadastrarProduto,
}: TelaCronogramaProps) {
  const [dataAlvo, setDataAlvo] = useState(proximoDiaUtilMatriz(dataDeAmanhaIso()));
  /**
   * CINCO CARDS IGUAIS, TODOS NASCENDO FECHADOS (ago/2026)
   * ------------------------------------------------------
   * A tela virou uma pilha de cards do mesmo tamanho: programação geral,
   * confirmação do que saiu hoje e uma loja por card. Um único mapa de
   * abertura serve aos cinco — estados separados (um booleano para o
   * planejamento, um mapa para as lojas) deixavam a regra "só o que você
   * abriu fica aberto" espalhada em dois lugares.
   *
   * Fechados por padrão porque a maior parte das aberturas da aba é
   * CONSULTA: o cabeçalho de cada card já responde "quantos itens" e "em
   * que pé está". Quem vai agir toca uma vez e entra.
   */
  const [cardsAbertos, setCardsAbertos] = useState<Record<string, boolean>>({});
  /**
   * UM CARD ABERTO POR VEZ — matriz ou qualquer filial (set/2026, pedido
   * do dono do negócio). Mesmo padrão já usado em PainelFornadasFilial:
   * abrir substitui em vez de somar, porque duas listas abertas juntas
   * empurram uma para fora da tela do celular, e quem toca esperando
   * ver a loja que abriu acaba lendo a lista errada por engano.
   */
  const alternarCard = (chave: string) =>
    setCardsAbertos((atual) => (atual[chave] ? {} : { [chave]: true }));

  const planoExistente = useMemo(() => planos.find((p) => p.data === dataAlvo), [planos, dataAlvo]);

  /**
   * A montagem começa pelo RASCUNHO do aparelho, quando existe, e só cai
   * no plano gravado quando não existe.
   *
   * Antes vivia só na memória do componente: trocar de aba desmontava a
   * tela, e ao voltar tudo que tinha sido digitado desde a última
   * confirmação sumia — em silêncio, com números plausíveis no lugar. Ver
   * src/lib/rascunhoCronograma.ts.
   */
  const [itensPorGrupo, setItensPorGrupo] = useState<Record<string, ItemPlanoProducao[]>>(
    () => lerRascunho(dataAlvo) ?? mapaDoPlano(planoExistente)
  );
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [cadastrandoEm, setCadastrandoEm] = useState<string | null>(null);
  const [nomeNovoProduto, setNomeNovoProduto] = useState("");
  const [salvandoNovoProduto, setSalvandoNovoProduto] = useState(false);
  const [fase, setFase] = useState<Fase>("montar");
  const [salvando, setSalvando] = useState(false);
  /** Confirmação da produção da matriz, pendente do segundo toque. */
  const [matrizAConfirmar, setMatrizAConfirmar] = useState(false);
  // Qual sessão está com a limpeza pendente de confirmação (só uma por vez).
  // Limpar é destrutivo e não tem desfazer, então exige dois toques.
  const [sessaoAConfirmarLimpeza, setSessaoAConfirmarLimpeza] = useState<string | null>(null);
  const [documentoAtivo, setDocumentoAtivo] = useState<string>("producao");
  const [statusSugestao, setStatusSugestao] = useState<Record<string, StatusSugestao>>({});
  const [mensagemSugestao, setMensagemSugestao] = useState<Record<string, string>>({});
  /** A busca estilo Google do lançamento da matriz — ver o comentário
   * equivalente em TelaPedidoFilial.tsx. */
  const [buscaMatriz, setBuscaMatriz] = useState("");

  /**
   * REVISÃO DA LISTA DE CADA FILIAL (ago/2026, pedido do dono do negócio:
   * "dentro do card de cada loja, eu consigo revisar, editar, confirmar e
   * imprimir a lista de cada uma das lojas, de forma independente").
   *
   * `ajustePorLoja` é a cópia de trabalho: o que está na tela enquanto a
   * matriz mexe, antes de confirmar. Guardada no aparelho para sobreviver
   * a trocar de aba — ver src/lib/rascunhoPedido.ts.
   */
  const [ajustePorLoja, setAjustePorLoja] = useState<Record<string, ItemPlanoProducao[]>>({});
  /** `${lojaId}:${codigoPdv}` do item cuja quantidade está aberta. */
  const [itemDaLojaAtivo, setItemDaLojaAtivo] = useState<string | null>(null);
  const [valorDaLoja, setValorDaLoja] = useState("");
  /** Loja com a confirmação pendente do segundo toque. */
  const [lojaAConfirmar, setLojaAConfirmar] = useState<string | null>(null);
  const [confirmandoLoja, setConfirmandoLoja] = useState<string | null>(null);
  /** Documento pedido pelo botão de imprimir de um card de loja. */
  const [impressaoDeLoja, setImpressaoDeLoja] = useState<string | null>(null);

  /**
   * Grava o rascunho a cada mudança. Barato: é uma linha de texto no
   * aparelho, não uma ida à nuvem — e é o que faz o trabalho sobreviver a
   * trocar de aba, fechar o app e recarregar a página.
   */
  useEffect(() => {
    gravarRascunho(dataAlvo, itensPorGrupo);
  }, [dataAlvo, itensPorGrupo]);

  /** Rascunho de dia que já passou não serve para nada — sai do aparelho. */
  useEffect(() => {
    limparRascunhosAntigos(hoje);
    limparAjustesAntigos(hoje);
  }, [hoje]);

  /**
   * Carrega as revisões guardadas no aparelho para a data em foco. Roda
   * na montagem e a cada troca de data — é o que faz a revisão sobreviver
   * a sair da aba e voltar.
   */
  useEffect(() => {
    const guardadas: Record<string, ItemPlanoProducao[]> = {};
    for (const filial of FILIAIS) {
      const itens = lerAjuste(filial.id, dataAlvo);
      if (itens) guardadas[filial.id] = itens;
    }
    setAjustePorLoja(guardadas);
  }, [dataAlvo]);

  /** Grava a revisão em andamento de cada filial, a cada mudança. */
  useEffect(() => {
    for (const [lojaId, itens] of Object.entries(ajustePorLoja)) {
      gravarAjuste(lojaId, dataAlvo, itens);
    }
  }, [ajustePorLoja, dataAlvo]);

  const diaDaSemana = diaDaSemanaDeData(dataAlvo);
  const dataFormatada = `${rotuloDoDia(diaDaSemana)}, ${formatarDataBr(dataAlvo)}`;

  const pedidosDoDia = useMemo(() => pedidos.filter((p) => p.data === dataAlvo), [pedidos, dataAlvo]);

  /**
   * `ehPedidoDiario` é obrigatório aqui: uma REPOSIÇÃO da loja tem a
   * mesma data e status "enviado", e sem o filtro ela faria a filial
   * parecer que já mandou o pedido do dia. A matriz confirmaria a
   * produção achando que estava completa.
   */
  const filiaisQueEnviaram = useMemo(
    () =>
      FILIAIS.filter((f) =>
        pedidosDoDia.some((p) => p.lojaId === f.id && p.status === "enviado" && ehPedidoDiario(p))
      ),
    [pedidosDoDia]
  );

  /**
   * Documentos disponíveis. Com MAIS DE UMA filial, entra a opção de sair
   * tudo numa bobina só (ago/2026): quem despacha não quer gerar,
   * compartilhar e imprimir duas vezes. A separação entre as lojas é
   * marcada por uma faixa preta com o nome da loja — ver
   * desenharMarcadorDeDestino em gerarImagemLista.ts.
   */
  /**
   * ATENÇÃO — HOOKS FICAM TODOS AQUI EM CIMA.
   *
   * Estes três useMemo já moraram depois dos `if (fase === ...) return`
   * e derrubaram o app: ao entrar no Resumo o componente retornava antes
   * de executá-los, o React contava menos hooks que na renderização
   * anterior e a tela ficava BRANCA, sem mensagem nenhuma — só reabrindo
   * o app (ago/2026).
   *
   * Regra do React: a mesma quantidade de hooks, na mesma ordem, em toda
   * renderização. Qualquer hook novo entra ANTES do primeiro return.
   */
  /**
   * O que vai ser produzido, aberto por destino.
   *
   * Junta o que a MATRIZ esta montando agora (rascunho na tela) com os
   * pedidos que as filiais ja enviaram para a mesma data. E a conta que o
   * padeiro executa e que a separacao da manha confere - ate hoje ela so
   * existia depois de "Ir para o Resumo", e conferir exigia sair do meio
   * da montagem.
   */
  /**
   * Os pedidos como estão NA TELA — com a revisão da matriz aplicada,
   * mesmo antes de confirmada.
   *
   * É o que mantém a tela coerente consigo mesma: se o card da filial
   * mostra 100 e a lista da produção soma 150, uma das duas está mentindo,
   * e quem descobre é o padeiro. O que se vê é o que se imprime.
   */
  const pedidosNaTela = useMemo(
    () =>
      pedidosDoDia.map((pedido) => {
        const revisao = ajustePorLoja[pedido.lojaId];
        return revisao && pedido.status === "enviado" && ehPedidoDiario(pedido)
          ? { ...pedido, itens: revisao }
          : pedido;
      }),
    [pedidosDoDia, ajustePorLoja]
  );

  const consolidadoDaData = useMemo(
    () =>
      consolidarProducao(
        GRUPOS.flatMap((chave) => itensPorGrupo[chave] ?? []),
        pedidosNaTela,
        LOJA_MATRIZ.id
      ),
    [itensPorGrupo, pedidosNaTela]
  );

  /**
   * TODOS OS ITENS DE TODAS AS LOJAS, REUNIDOS (ago/2026, pedido do dono
   * do negócio).
   *
   * É o que a "Programação geral" passou a ser: a lista do dia inteira,
   * cada item com a quantidade TOTAL — o que a matriz lançou mais o que
   * as filiais pediram. É a conta que o padeiro executa, e agora ela se
   * lê sem abrir três cards e somar de cabeça.
   *
   * A divisão por destino não sumiu: continua logo abaixo, um card por
   * loja, que é a forma de quem separa de manhã.
   */
  const sessoesGerais = useMemo(
    () =>
      agruparEmSessoes(
        consolidadoDaData.map((item) => ({
          codigoPdv: item.codigoPdv,
          quantidadeUnidades: item.totalUnidades,
        })),
        produtos
      ),
    [consolidadoDaData, produtos]
  );

  const variedadesGerais = consolidadoDaData.length;
  const totalUnidadesGerais = consolidadoDaData.reduce((soma, i) => soma + i.totalUnidades, 0);

  /**
   * O que a tela de impressão da PRODUÇÃO oferece. A lista de cada loja
   * saiu daqui (ago/2026): ela agora se imprime do card da própria loja,
   * que é onde ela é revisada. Ficou o par que só faz sentido junto —
   * os totais da cozinha e, quando as duas filiais mandaram, a bobina
   * única de despacho.
   */
  const documentos = useMemo(() => {
    const lista = [{ id: "producao", rotulo: "Produção" }];
    if (filiaisQueEnviaram.length > 1) lista.push({ id: "todas-filiais", rotulo: "Filiais (todas)" });
    return lista;
  }, [filiaisQueEnviaram]);

  function blocosDeTodasAsFiliais(consolidado: ItemConsolidado[]) {
    return filiaisQueEnviaram.flatMap((filial) =>
      blocosDeSeparacao(consolidado, filial.id).map((bloco, indice) => ({
        ...bloco,
        // Só o PRIMEIRO bloco de cada loja carrega o marcador — os
        // seguintes são categorias da mesma loja, separadas pela faixa
        // de corte comum.
        // COM a palavra "Filial" (ago/2026, pedido do dono do negócio).
        // Numa bobina que traz as duas lojas, o nome completo é o que
        // separa sem margem de dúvida na hora de despachar.
        inicioDeDestino: indice === 0 ? filial.nome : undefined,
      }))
    );
  }

  function blocosDeSeparacao(consolidado: ItemConsolidado[], lojaId: string) {
    // Agrupado por categoria também no romaneio: quem separa anda pela
    // padaria por setor, não por ordem alfabética de produto. A regra
    // mora em src/lib/blocosDeImpressao.ts — o pedido que a filial manda
    // direto para a impressora usa exatamente a mesma, e dois papéis do
    // mesmo dia com os setores em ordens diferentes seriam impossíveis de
    // conferir um contra o outro.
    return agruparPorCategoria(itensParaLoja(consolidado, lojaId), produtos);
  }

  function trocarData(novaData: string) {
    setDataAlvo(novaData);
    setSessaoAConfirmarLimpeza(null);
    const plano = planos.find((p) => p.data === novaData);
    // O rascunho daquele dia vem primeiro, como na montagem inicial.
    setItensPorGrupo(lerRascunho(novaData) ?? mapaDoPlano(plano));
    setFase("montar");
    setProdutoAtivo(null);
  }

  const totalItens = Object.values(itensPorGrupo).reduce((soma, itens) => soma + itens.length, 0);

  const resultadosBuscaMatriz = useMemo(() => {
    const termo = buscaMatriz.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, buscaMatriz]);

  /** Todos os itens lançados pela matriz, de todas as categorias juntas —
   * a mesma lista que as sanfonas mostram separada, só que numa peça só,
   * para o cartão "o que já está lançado" (ver comentário mais abaixo). */
  const todosOsItensDaMatriz = useMemo(
    () => GRUPOS.flatMap((chave) => itensPorGrupo[chave] ?? []),
    [itensPorGrupo]
  );

  /**
   * Vira a data-alvo quando o dia vira com o app aberto — mas só quando
   * não há trabalho na tela para perder. A regra inteira, com o porquê de
   * cada guarda, está em src/lib/dataAlvoDoDia.ts.
   */
  useEffect(() => {
    const proxima = proximaDataAlvo(dataAlvo, hoje, proximoDiaUtilMatriz(dataDeAmanhaIso()), totalItens > 0);
    if (proxima) trocarData(proxima);
    // `trocarData` e `totalItens` são recalculados a cada render; o que
    // dispara isto é a virada do dia, e é só ela que precisa estar aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoje]);

  function produtosDaCategoria(chave: string): Produto[] {
    return produtos
      .filter((p) => p.categoria === chave && p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function abrirEdicao(codigoPdv: number, chaveGrupo: string) {
    if (produtoAtivo === codigoPdv) {
      setProdutoAtivo(null);
      setValorEditando("");
      return;
    }
    setProdutoAtivo(codigoPdv);
    const existente = itensPorGrupo[chaveGrupo]?.find((i) => i.codigoPdv === codigoPdv);
    setValorEditando(existente ? String(existente.quantidadeUnidades) : "");
  }

  function confirmarQuantidade(chaveGrupo: string, codigoPdv: number) {
    if (!ehNumeroValidoPositivo(valorEditando)) return;
    const quantidadeUnidades = paraNumero(valorEditando);
    setItensPorGrupo((atual) => {
      const itensAtuais = atual[chaveGrupo] ?? [];
      const existe = itensAtuais.some((i) => i.codigoPdv === codigoPdv);
      const novosItens = existe
        ? itensAtuais.map((i) => (i.codigoPdv === codigoPdv ? { ...i, quantidadeUnidades } : i))
        : [...itensAtuais, { codigoPdv, quantidadeUnidades }];
      return { ...atual, [chaveGrupo]: novosItens };
    });
    setProdutoAtivo(null);
    setValorEditando("");
  }

  /**
   * Cadastro relâmpago dentro da própria sessão da categoria (set/2026,
   * pedido do dono do negócio: "a inserção de novos produtos poderia ser
   * feita quando o produto não for encontrado... o usuário informará o
   * nome do produto e a categoria"). Aqui a categoria já está decidida —
   * é a sessão aberta — então só falta o nome. Depois de salvar, abre
   * direto o editor de quantidade do item novo, mesmo fluxo de tocar
   * num produto já existente.
   */
  async function cadastrarProduto(chaveGrupo: string) {
    const nome = nomeNovoProduto.trim();
    if (!nome || salvandoNovoProduto) return;
    setSalvandoNovoProduto(true);
    try {
      const novo = await onCadastrarProduto({
        nome,
        categoria: chaveGrupo,
        unidadeProducao: "un",
        ativoNaProducao: true,
        prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[chaveGrupo] ?? null,
      });
      if (!novo) return;
      setCadastrandoEm(null);
      setNomeNovoProduto("");
      abrirEdicao(novo.codigoPdv, chaveGrupo);
    } catch {
      // Mensagem já vem do aviso global (ver App.tsx).
    } finally {
      setSalvandoNovoProduto(false);
    }
  }

  /**
   * A LISTA INTEIRA DITADA DE UMA VEZ, para o lançamento da matriz
   * (set/2026, pedido do dono do negócio: "tanto a matriz quanto as
   * filiais podem montar sua lista de produção utilizando o comando de
   * voz" — a filial já tinha isso, ver `adicionarPorVoz` em
   * TelaPedidoFilial.tsx; esta é a mesma ideia, só que agrupando por
   * categoria em vez de por loja).
   *
   * Cai na MESMA lista que o toque monta — não é um lançamento
   * paralelo. Produto já lançado tem a quantidade SUBSTITUÍDA, não
   * somada: quem repete um item falando está corrigindo o número, não
   * pedindo mais. Confirmar produção continua sendo o passo explícito
   * de sempre.
   */
  function adicionarPorVoz(ditados: { produto: Produto; quantidade: number | null }[]) {
    setItensPorGrupo((atual) => {
      const novo = { ...atual };
      for (const { produto, quantidade } of ditados) {
        if (!quantidade || quantidade <= 0) continue;
        const grupo = produto.categoria;
        const itensDoGrupo = [...(novo[grupo] ?? [])];
        const onde = itensDoGrupo.findIndex((i) => i.codigoPdv === produto.codigoPdv);
        if (onde >= 0) itensDoGrupo[onde] = { ...itensDoGrupo[onde], quantidadeUnidades: quantidade };
        else itensDoGrupo.push({ codigoPdv: produto.codigoPdv, quantidadeUnidades: quantidade });
        novo[grupo] = itensDoGrupo;
        // Abre a categoria do item ditado: sem isso ele entra na lista e
        // fica invisível atrás de uma sanfona fechada.
        setExpandido((a) => ({ ...a, [grupo]: true }));
      }
      return novo;
    });
  }

  function removerItem(chaveGrupo: string, codigoPdv: number) {
    setItensPorGrupo((atual) => ({
      ...atual,
      [chaveGrupo]: (atual[chaveGrupo] ?? []).filter((i) => i.codigoPdv !== codigoPdv),
    }));
  }

  /**
   * Limpa os itens de UMA sessão. Deliberadamente não existe um "limpar
   * tudo" que zere as 5 sessões de uma vez (decisão do dono do negócio,
   * ago/2026): um toque errado num botão global apagaria o cronograma
   * inteiro montado no fim do expediente, sem desfazer.
   */
  function limparSessao(chaveGrupo: string) {
    setItensPorGrupo((atual) => ({ ...atual, [chaveGrupo]: [] }));
    setSessaoAConfirmarLimpeza(null);
    setProdutoAtivo(null);
    // Recolhe o acordeão depois de limpar: a sessão ficou vazia, e deixá-la
    // aberta com a lista inteira de produtos disponíveis empurra as outras
    // sessões para fora da tela justamente quando o operador vai remontar.
    setExpandido((atual) => ({ ...atual, [chaveGrupo]: false }));
  }

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
  }

  /** Edita a quantidade de um item já lançado, a partir do cartão "o que
   * já está lançado" — que mostra os itens achatados, sem a categoria à
   * vista. Descobre a categoria pelo catálogo para saber em qual grupo
   * de `itensPorGrupo` mexer (mesma ideia de `mudarQuantidadeItem` em
   * TelaPedidoFilial.tsx). */
  function mudarQuantidadeItemMatriz(codigoPdv: number, bruto: string) {
    const produto = produtos.find((p) => p.codigoPdv === codigoPdv);
    if (!produto) return;
    const limpo = sanitizarEntradaNumerica(bruto);
    setItensPorGrupo((atual) => {
      const grupo = produto.categoria;
      const itensAtuais = atual[grupo] ?? [];
      return {
        ...atual,
        [grupo]: itensAtuais.map((i) =>
          i.codigoPdv === codigoPdv
            ? { ...i, quantidadeUnidades: ehNumeroValidoPositivo(limpo) ? paraNumero(limpo) : 0 }
            : i
        ),
      };
    });
  }

  /** Remove um item já lançado a partir do cartão achatado — mesma ideia
   * acima, para o botão de lixeira. */
  function removerItemMatriz(codigoPdv: number) {
    const produto = produtos.find((p) => p.codigoPdv === codigoPdv);
    if (!produto) return;
    removerItem(produto.categoria, codigoPdv);
  }

  /**
   * A lista de uma filial COMO ESTÁ NA TELA: a revisão em andamento, se
   * houver, senão o que a loja mandou.
   */
  function listaDaFilial(lojaId: string): ItemPlanoProducao[] {
    const emRevisao = ajustePorLoja[lojaId];
    if (emRevisao) return emRevisao;
    return pedidoDaFilial(lojaId)?.itens ?? [];
  }

  function pedidoDaFilial(lojaId: string): PedidoFilial | undefined {
    return pedidosDoDia.find(
      (p) => p.lojaId === lojaId && p.status === "enviado" && ehPedidoDiario(p)
    );
  }

  /** A tela está diferente do pedido gravado daquela loja? */
  function lojaTemAlteracaoPendente(lojaId: string): boolean {
    const emRevisao = ajustePorLoja[lojaId];
    if (!emRevisao) return false;
    return !itensIguais(emRevisao, pedidoDaFilial(lojaId)?.itens ?? []);
  }

  function abrirItemDaLoja(lojaId: string, codigoPdv: number) {
    const chave = `${lojaId}:${codigoPdv}`;
    if (itemDaLojaAtivo === chave) {
      setItemDaLojaAtivo(null);
      setValorDaLoja("");
      return;
    }
    setItemDaLojaAtivo(chave);
    const item = listaDaFilial(lojaId).find((i) => i.codigoPdv === codigoPdv);
    setValorDaLoja(item ? String(item.quantidadeUnidades) : "");
  }

  function confirmarItemDaLoja(lojaId: string, codigoPdv: number) {
    if (!ehNumeroValidoPositivo(valorDaLoja)) return;
    const quantidadeUnidades = paraNumero(valorDaLoja);
    const atual = listaDaFilial(lojaId);
    setAjustePorLoja((mapa) => ({
      ...mapa,
      [lojaId]: atual.map((i) => (i.codigoPdv === codigoPdv ? { ...i, quantidadeUnidades } : i)),
    }));
    setItemDaLojaAtivo(null);
    setValorDaLoja("");
  }

  /**
   * Tirar um item da lista de uma loja é dizer "isto não vai" — e não
   * apagar o pedido dela. O produto continua guardado em `itensOriginais`
   * quando a matriz confirmar, e a filial vê "não vem" no lugar da
   * quantidade. Ver ajustarPedidoPelaMatriz em src/types/pedido.ts.
   */
  function tirarItemDaLoja(lojaId: string, codigoPdv: number) {
    const atual = listaDaFilial(lojaId);
    setAjustePorLoja((mapa) => ({
      ...mapa,
      [lojaId]: atual.filter((i) => i.codigoPdv !== codigoPdv),
    }));
    setItemDaLojaAtivo(null);
  }

  /** Desfaz a revisão em andamento e volta ao que está gravado. */
  function descartarRevisao(lojaId: string) {
    apagarAjuste(lojaId, dataAlvo);
    setAjustePorLoja((mapa) => {
      const { [lojaId]: _fora, ...resto } = mapa;
      return resto;
    });
    setItemDaLojaAtivo(null);
    setLojaAConfirmar(null);
  }

  async function confirmarListaDaLoja(lojaId: string) {
    const pedido = pedidoDaFilial(lojaId);
    if (!pedido) return;
    setConfirmandoLoja(lojaId);
    try {
      await onAjustarPedido(
        ajustarPedidoPelaMatriz(pedido, listaDaFilial(lojaId), operador, new Date().toISOString())
      );
      // Confirmado, o rascunho cumpriu a função: o pedido gravado passa a
      // ser a verdade, e manter a cópia local faria a tela seguir avisando
      // de uma alteração que já foi.
      descartarRevisao(lojaId);
    } catch {
      // A mensagem vem do aviso global (ver App.tsx). O rascunho FICA: o
      // que a matriz digitou não pode sumir junto com a falha de rede.
    } finally {
      setConfirmandoLoja(null);
      setLojaAConfirmar(null);
    }
  }

  async function gerarSugestaoIA(chave: string) {
    setStatusSugestao((atual) => ({ ...atual, [chave]: "carregando" }));
    setMensagemSugestao((atual) => ({ ...atual, [chave]: "" }));
    try {
      const historico = montarHistoricoPorCategoria(chave, produtos, planos, perdas);
      const sugestoes = await buscarSugestaoProducao(diaDaSemana, chave, historico);

      setItensPorGrupo((atual) => {
        const itensAtuais = atual[chave] ?? [];
        const codigosExistentes = new Set(itensAtuais.map((i) => i.codigoPdv));
        const novosItens = sugestoes
          .filter((s) => !codigosExistentes.has(s.codigoPdv) && s.quantidadeSugerida > 0)
          .map((s) => ({ codigoPdv: s.codigoPdv, quantidadeUnidades: arred(s.quantidadeSugerida) }));
        return { ...atual, [chave]: [...itensAtuais, ...novosItens] };
      });
      setExpandido((atual) => ({ ...atual, [chave]: true }));
      setStatusSugestao((atual) => ({ ...atual, [chave]: "" }));
      setMensagemSugestao((atual) => ({
        ...atual,
        [chave]:
          sugestoes.length > 0
            ? `${sugestoes.length} sugestão(ões) da IA adicionada(s) — revise as quantidades antes de confirmar.`
            : "A IA não encontrou histórico suficiente para sugerir quantidades nesta categoria ainda.",
      }));
    } catch (erro) {
      setStatusSugestao((atual) => ({ ...atual, [chave]: "erro" }));
      setMensagemSugestao((atual) => ({
        ...atual,
        [chave]: erro instanceof ErroSugestaoProducao ? erro.message : "Não foi possível gerar a sugestão agora.",
      }));
    }
  }

  async function confirmarESalvar() {
    setSalvando(true);
    const sessoes: SessaoProducao[] = GRUPOS.filter((chave) => (itensPorGrupo[chave]?.length ?? 0) > 0).map(
      (chave) => ({
        id: planoExistente?.sessoes.find((s) => s.categoria === chave)?.id ?? gerarId(),
        categoria: chave,
        itens: itensPorGrupo[chave] ?? [],
      })
    );
    const plano: PlanoDeProducaoDiario = {
      id: planoExistente?.id ?? gerarId(),
      data: dataAlvo,
      diaDaSemana,
      sessoes,
      status: "confirmado",
      criadoPor: planoExistente?.criadoPor ?? operador,
      criadoEm: planoExistente?.criadoEm ?? new Date().toISOString(),
      confirmadoEm: new Date().toISOString(),
    };
    try {
      await onSalvarPlano(plano);
      // Confirmado, o rascunho cumpriu a função: o plano gravado passa a
      // ser a verdade. Mantê-lo faria a tela voltar a mostrar "alterações
      // não confirmadas" sobre algo que acabou de ser confirmado.
      apagarRascunho(dataAlvo);
      // NÃO pula para a tela de impressão (ago/2026): confirmar e imprimir
      // viraram duas ações independentes, cada uma com botão próprio. Ser
      // jogado para outra tela depois de confirmar tirava a matriz de onde
      // ela estava trabalhando, e obrigava a voltar para revisar a loja
      // seguinte.
      setMatrizAConfirmar(false);
    } catch {
      // Fica na tela de resumo com os itens intactos — a mensagem de
      // falha vem do aviso global (ver App.tsx). Avançar para a tela de
      // impressão sem ter salvo seria pior: o operador imprimiria uma
      // lista que o banco não tem.
    } finally {
      setSalvando(false);
    }
  }

  // ------------------------------------------------------------------
  // Fase: Exportar / Imprimir
  // ------------------------------------------------------------------
  /**
   * DOIS PAPÉIS DIFERENTES, E ELES SAEM DE PORTAS DIFERENTES (ago/2026,
   * pedido do dono do negócio):
   *
   * - O botão do topo imprime a LISTA DA PRODUÇÃO: os totais somados das
   *   três lojas, separados por segmento, para ficar fixada na cozinha da
   *   matriz. Formato cortável — cada segmento vira um pedaço de papel no
   *   quadro do seu setor.
   * - O botão dentro do card de cada loja imprime a lista DAQUELA loja,
   *   sozinha. Formato contínuo: um cabeçalho, um rodapé, segmentos como
   *   subtítulos — porque esse papel vai inteiro para uma pessoa só, e
   *   não é picotado. Ver src/lib/gerarImagemLista.ts.
   */
  if (fase === "exportar") {
    const voltar = () => {
      setFase("montar");
      setImpressaoDeLoja(null);
    };

    if (impressaoDeLoja) {
      const destino = [LOJA_MATRIZ, ...FILIAIS].find((l) => l.id === impressaoDeLoja);
      const itens =
        impressaoDeLoja === LOJA_MATRIZ.id
          ? GRUPOS.flatMap((chave) => itensPorGrupo[chave] ?? [])
          : listaDaFilial(impressaoDeLoja);

      return (
        <div className="tela">
          <h2>Lista de {destino?.nomeCurto ?? nomeDaLoja(impressaoDeLoja)}</h2>
          <ExportarFita
            blocos={agruparEmSessoes(itens, produtos).map((sessao) => ({
              rotuloSessao: sessao.rotulo,
              itens: sessao.itens,
            }))}
            /* Nome completo, "Filial Arthur Bernardes" (ago/2026, pedido
               do dono do negócio): é o mesmo cabeçalho da bobina que traz
               as duas lojas juntas, e dois papéis do mesmo dia com nomes
               escritos de jeitos diferentes se conferem pior. */
            titulo={destino?.nome ?? nomeDaLoja(impressaoDeLoja)}
            instrucao="O que sai da matriz para esta loja. Um papel só, do começo ao fim — use na separação da manhã, conferindo item por item antes de despachar."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={operador}
            formato="continuo"
            nomeArquivoBase={`lista-${impressaoDeLoja.toLowerCase()}-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `lista-${impressaoDeLoja.toLowerCase()}-${dataAlvo}`)
            }
          />
          <div className="acoes">
            <button type="button" className="secundario" onClick={voltar}>
              Voltar ao Cronograma
            </button>
          </div>
        </div>
      );
    }

    const documentoSelecionado = documentos.find((d) => d.id === documentoAtivo) ?? documentos[0];

    return (
      <div className="tela">
        <h2>Lista da produção</h2>
        <p className="subtitulo destaque-data">{dataFormatada}</p>

        {documentos.length > 1 && (
          <div className="seletor-documento">
            {documentos.map((d) => (
              <button
                key={d.id}
                type="button"
                className={documentoAtivo === d.id ? "ativa" : ""}
                onClick={() => setDocumentoAtivo(d.id)}
              >
                {d.rotulo}
              </button>
            ))}
          </div>
        )}

        {documentoSelecionado.id === "todas-filiais" ? (
          <ExportarFita
            blocos={blocosDeTodasAsFiliais(consolidadoDaData)}
            /* O título genérico saiu (ago/2026, pedido do dono do
               negócio: "gera ruído"). Cada loja já abre a própria tira
               com o nome dela em destaque — uma linha dizendo
               "Separação por loja" logo acima só repetia, em texto
               menor, o que a tira inteira já mostra. */
            titulo=""
            instrucao="As duas filiais numa bobina só. Cada loja sai numa tira inteira, com os setores em blocos — a única tesoura fica entre uma loja e a outra."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={operador}
            formato="continuo"
            nomeArquivoBase={`separacao-filiais-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `separacao-filiais-${dataAlvo}`)
            }
          />
        ) : (
          <ExportarFita
            blocos={sessoesGerais.map((sessao) => ({
              rotuloSessao: sessao.rotulo,
              itens: sessao.itens,
            }))}
            titulo="Lista de Produção"
            instrucao="Quantidades TOTAIS — matriz mais as filiais que enviaram. Imprima em uma tira só, corte em cada tesourinha e fixe cada pedaço no quadro do respectivo setor."
            dataFormatada={dataFormatada}
            produtos={produtos}
            montadoPor={operador}
            nomeArquivoBase={`producao-${dataAlvo}`}
            onImprimirNoCaixa={(canvases, titulo) =>
              onImprimirNoCaixa(canvases, titulo, `producao-${dataAlvo}`)
            }
          />
        )}

        <div className="acoes">
          <button type="button" className="secundario" onClick={voltar}>
            Voltar ao Cronograma
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fase: Montar (padrão)
  // ------------------------------------------------------------------

  const contagemDeItens = (quantos: number) => `${quantos} ${quantos === 1 ? "item" : "itens"}`;

  /**
   * A tela está diferente do que está gravado?
   *
   * Só faz sentido quando existe plano confirmado: antes disso, "montando"
   * já diz tudo, e chamar de "não confirmado" o que nunca foi confirmado
   * seria alarme falso — e alarme que aparece sempre é alarme que se
   * aprende a ignorar.
   */
  const temAlteracoesNaoConfirmadas =
    planoExistente?.status === "confirmado" &&
    !mapasIguais(itensPorGrupo, mapaDoPlano(planoExistente));

  /**
   * O estado do cronograma da data, escrito uma vez só.
   *
   * A Programação geral e o card da matriz falam do MESMO plano — um pelo
   * total, outro pela montagem. Duas cópias desta escada de condições
   * acabariam divergindo na primeira correção, e os dois cards mostrariam
   * estados diferentes do mesmo dia.
   *
   * `quantos` é o que aquele card tem para mostrar: a geral conta as
   * variedades somadas (a filial pode ter enviado lista antes de a matriz
   * lançar qualquer coisa), a matriz conta o que ela montou.
   */
  function situacaoDoCronograma(quantos: number): SituacaoDoCard {
    if (temAlteracoesNaoConfirmadas) return { texto: "alterações não confirmadas", tom: "pendente" };
    if (planoExistente?.status === "confirmado") return { texto: "cronograma confirmado", tom: "ok" };
    return quantos > 0
      ? { texto: "montando", tom: "pendente" }
      : { texto: "sem itens ainda", tom: "pendente" };
  }

  return (
    <div className="tela">
      {/*
        A DATA É O TÍTULO DA PÁGINA, E O TÍTULO É O BOTÃO
        ---------------------------------------------------------------
        Os cinco cards abaixo falam todos do mesmo dia — repetir a data
        dentro de cada um seria ruído. Ela fica aqui em cima, uma vez, e
        é por ela que se troca o dia programado.
      */}
      {/* A DATA DEIXOU DE SER EDITÁVEL (set/2026, pedido do dono do
          negócio): o "próximo dia" já pula sozinho o 1º de janeiro (ver
          src/lib/feriados.ts) — único dia em que a matriz não abre — e
          não fazia sentido oferecer um calendário para escolher outro
          dia numa lista que é, por definição, a produção da PRÓXIMA
          abertura. O calendário e o toque para abrir saíram junto;
          sobrou só a informação, sem convite a mexer nela. */}
      <div className="destaque-data titulo-do-dia">
        <div className="linha-titulo-do-dia">
          <span className="marca-titulo-do-dia">
            <IconeCalendario tamanho={20} />
            <span className="titulo-planejamento">Produção de {dataFormatada}</span>
          </span>
        </div>
      </div>

      {/*
        CARDS DAS FILIAIS — PRIMEIRO NA PÁGINA (ago/2026, pedido do dono
        do negócio)
        ---------------------------------------------------------------
        Elas vêm antes porque é o trabalho que CHEGA de fora e espera
        resposta: a matriz abre a aba para ver o que as lojas pediram e
        decidir o que dá para produzir. O que ela mesma monta pode
        esperar — está na mão dela o tempo todo.

        Cada card é autônomo: revisa, edita, confirma e imprime a lista
        daquela loja sem passar por nenhuma tela intermediária.
      */}
      {FILIAIS.map((filial) => {
        const pedido = pedidoDaFilial(filial.id);
        const itens = listaDaFilial(filial.id);
        const sessoes = agruparEmSessoes(itens, produtos);
        const variedades = itens.length;
        const total = itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0);
        const pendente = lojaTemAlteracaoPendente(filial.id);
        const diferencas = pedido ? diferencasDoAjuste(pedido) : [];

        // Quatro estados, e cada um pede uma coisa diferente de quem lê:
        // a lista não chegou, chegou e está intacta, foi ajustada e
        // gravada, ou tem edição na tela esperando confirmação.
        const situacao: SituacaoDoCard = !pedido
          ? { texto: "lista pendente", tom: "pendente" }
          : pendente
            ? { texto: "alterações não confirmadas", tom: "pendente" }
            : diferencas.length > 0
              ? { texto: "ajustada pela matriz", tom: "ok" }
              : { texto: "lista enviada", tom: "ok" };

        return (
          <CardCronograma
            key={filial.id}
            nome={filial.nomeCurto}
            situacao={situacao}
            contagem={variedades > 0 ? contagemDeItens(variedades) : "—"}
            aberto={!!cardsAbertos[filial.id]}
            onAlternar={() => alternarCard(filial.id)}
          >
            {!pedido ? (
              <p className="nota-rodape">Esta filial ainda não enviou o pedido do dia.</p>
            ) : (
              <>
                {sessoes.length === 0 && <p className="nota-rodape">Nada vai para esta loja.</p>}

                {sessoes.map((sessao) => (
                  <div key={sessao.chave} className="sessao-do-card">
                    <h4>{sessao.rotulo}</h4>
                    {sessao.itens.map((item) => {
                      const editando = itemDaLojaAtivo === `${filial.id}:${item.codigoPdv}`;
                      return (
                        <div key={item.codigoPdv} className="linha-item-editavel">
                          {/* A LINHA INTEIRA É O ALVO. Um lápis de 20px ao
                              lado do número seria um alvo pequeno para um
                              dedo com farinha, e esconderia que dá para
                              editar até alguém reparar no ícone. */}
                          <button
                            type="button"
                            className="item-da-loja editavel"
                            aria-expanded={editando}
                            onClick={() => abrirItemDaLoja(filial.id, item.codigoPdv)}
                          >
                            <span className="nome-item-loja">{nomeDoProduto(item.codigoPdv)}</span>
                            <span className="qtd-item-loja">{arred(item.quantidadeUnidades)} un</span>
                          </button>

                          {editando && (
                            <div className="editor-quantidade">
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9]*[.,]?[0-9]*"
                                autoFocus
                                aria-label={`Quantidade de ${nomeDoProduto(item.codigoPdv)}`}
                                value={valorDaLoja}
                                onChange={(e) => setValorDaLoja(sanitizarEntradaNumerica(e.target.value))}
                              />
                              <span className="unidade-fixa">un</span>
                              <button
                                type="button"
                                className="primario"
                                disabled={!ehNumeroValidoPositivo(valorDaLoja)}
                                onClick={() => confirmarItemDaLoja(filial.id, item.codigoPdv)}
                              >
                                Confirmar
                              </button>
                              {/* "não vem" e não "remover": o item não é
                                  apagado do pedido da loja, ele é
                                  respondido. A filial vê "não vem" no
                                  lugar da quantidade que pediu. */}
                              <button
                                type="button"
                                className="link"
                                onClick={() => tirarItemDaLoja(filial.id, item.codigoPdv)}
                              >
                                não vem
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <p className="nota-rodape">
                  {contagemDeItens(variedades)} · {arred(total).toLocaleString("pt-BR")} unidades
                </p>

                {diferencas.length > 0 && !pendente && (
                  <p className="callout-inline">
                    {diferencas.length === 1
                      ? "1 item saiu diferente do que a loja pediu."
                      : `${diferencas.length} itens saíram diferentes do que a loja pediu.`}{" "}
                    Ela já está vendo a diferença na tela dela.
                  </p>
                )}

                <div className="acoes acoes-do-card">
                  {pendente && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => descartarRevisao(filial.id)}
                    >
                      desfazer
                    </button>
                  )}
                  <button
                    type="button"
                    className="secundario"
                    onClick={() => {
                      setImpressaoDeLoja(filial.id);
                      setFase("exportar");
                    }}
                  >
                    <IconeImpressora tamanho={17} /> Imprimir
                  </button>
                  {lojaAConfirmar === filial.id ? (
                    <span className="confirmar-limpeza">
                      <button
                        type="button"
                        className="primario"
                        disabled={confirmandoLoja === filial.id}
                        onClick={() => void confirmarListaDaLoja(filial.id)}
                      >
                        {confirmandoLoja === filial.id ? "Enviando..." : "Confirmar?"}
                      </button>
                      <button type="button" className="link" onClick={() => setLojaAConfirmar(null)}>
                        não
                      </button>
                    </span>
                  ) : (
                    /* Só acende quando há o que confirmar: um botão sempre
                       disponível para uma ação sem efeito ensina a tocar
                       nele sem ler. */
                    <button
                      type="button"
                      className="primario"
                      disabled={!pendente}
                      onClick={() => setLojaAConfirmar(filial.id)}
                    >
                      Confirmar
                    </button>
                  )}
                </div>
              </>
            )}
          </CardCronograma>
        );
      })}

      {/*
        CARD DA MATRIZ — onde ela LANÇA o próprio cronograma. Vem depois
        das filiais (ago/2026): o que chega de fora e espera resposta tem
        precedência sobre o que está na mão dela o tempo todo.
      */}
      <CardCronograma
        nome={LOJA_MATRIZ.nomeCurto}
        situacao={situacaoDoCronograma(totalItens)}
        contagem={totalItens > 0 ? contagemDeItens(totalItens) : "—"}
        aberto={!!cardsAbertos[LOJA_MATRIZ.id]}
        onAlternar={() => alternarCard(LOJA_MATRIZ.id)}
      >
        {/* BUSCAR OU FALAR, NA MESMA BARRA (set/2026, pedido do dono do
            negócio: "o mesmo esquema utilizado pelo Google em sua barra
            de buscas" — mesma barra da Lista de Produção da filial, ver
            TelaPedidoFilial.tsx). Mesmo lugar da sanfona onde a matriz
            lança o cronograma dela; as sanfonas continuam abaixo para
            ajustar item a item. */}
        <CampoDeBusca
          className="busca-lista-producao"
          valor={buscaMatriz}
          onMudar={(v) => {
            setBuscaMatriz(v);
            setProdutoAtivo(null);
          }}
          placeholder="Buscar produto ou categoria..."
          rotulo="Buscar produto para lançar na produção"
        >
          <AssistenteDeVoz
            compacto
            produtos={produtos}
            modo="pedir"
            acao="adicionar"
            rotuloFalar="Monte a lista falando"
            autoIncluirQuandoCompleto
            onConfirmar={async (ditados) => adicionarPorVoz(ditados)}
          />
        </CampoDeBusca>

        {buscaMatriz.trim().length > 0 &&
          (resultadosBuscaMatriz.length === 0 ? (
            <p className="nota-rodape">Nenhum produto encontrado para "{buscaMatriz.trim()}".</p>
          ) : (
            resultadosBuscaMatriz.map((produto) => {
              const itemSalvo = (itensPorGrupo[produto.categoria] ?? []).find(
                (i) => i.codigoPdv === produto.codigoPdv
              );
              const editando = produtoAtivo === produto.codigoPdv;
              return (
                <div key={produto.codigoPdv} className="linha-fornada">
                  <div className="info-fornada">
                    <strong>{produto.nome}</strong>
                    {itemSalvo && (
                      <span className="valor-confirmado">{itemSalvo.quantidadeUnidades} un ✓</span>
                    )}
                  </div>
                  {editando ? (
                    <div className="editor-quantidade">
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        autoFocus
                        placeholder="Quantidade em unidades"
                        value={valorEditando}
                        onChange={(e) => setValorEditando(sanitizarEntradaNumerica(e.target.value))}
                      />
                      <span className="unidade-fixa">un</span>
                      <button
                        type="button"
                        className="primario"
                        disabled={!ehNumeroValidoPositivo(valorEditando)}
                        onClick={() => confirmarQuantidade(produto.categoria, produto.codigoPdv)}
                      >
                        Confirmar
                      </button>
                    </div>
                  ) : (
                    <div className="acoes-fornada">
                      <button
                        type="button"
                        className="botao-fornada pedir"
                        onClick={() => abrirEdicao(produto.codigoPdv, produto.categoria)}
                      >
                        {itemSalvo ? "Editar" : "Incluir"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ))}

        {/* O CARTÃO DO QUE JÁ FOI LANÇADO, SEMPRE VISÍVEL E EDITÁVEL
            (set/2026, pedido do dono do negócio: "um card deve mostrar
            os itens que já foram acrescentados... bem como a
            possibilidade de editar as quantidades" — mesmo cartão de
            TelaPedidoFilial.tsx, aqui achatando as 5 categorias numa
            lista só, já que a pergunta é a mesma: "o que já está
            lançado para amanhã?"). */}
        {todosOsItensDaMatriz.length > 0 && (
          <div className="pedido-em-montagem">
            <strong className="titulo-montagem">Já lançado</strong>
            {todosOsItensDaMatriz.map((item) => (
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
                  onChange={(e) => mudarQuantidadeItemMatriz(item.codigoPdv, e.target.value)}
                />
                <button
                  type="button"
                  className="tirar-da-lista"
                  aria-label={`Tirar ${nomeDoProduto(item.codigoPdv)} da lista`}
                  onClick={() => removerItemMatriz(item.codigoPdv)}
                >
                  <IconeLixeira tamanho={16} />
                </button>
              </div>
            ))}
            <p className="total-linha">
              <strong>{totalItens}</strong> {totalItens === 1 ? "item" : "itens"}
            </p>
          </div>
        )}

        {GRUPOS.map((chave) => {
          const rotulo = rotuloDaCategoria(chave);
          const itensDoGrupo = itensPorGrupo[chave] ?? [];
          const aberto = !!expandido[chave];
          const listaProdutos = produtosDaCategoria(chave);
          const statusIA = statusSugestao[chave] ?? "";
          const mensagemIA = mensagemSugestao[chave] ?? "";

          return (
            <div key={chave} className={`acordeao-sessao ${aberto ? "aberta" : ""}`}>
              {/* O cabeçalho deixou de ser um botão único (ago/2026) para
                  caber "limpar" ao lado da contagem, longe do "remover"
                  de cada produto — os dois botões vizinhos estavam sendo
                  confundidos. Botão não pode aninhar botão, daí a div. */}
              <div className="cabecalho-sessao">
                <button
                  type="button"
                  className="abrir-sessao"
                  aria-expanded={aberto}
                  onClick={() => setExpandido((atual) => ({ ...atual, [chave]: !atual[chave] }))}
                >
                  <span className="nome-sessao">{rotulo}</span>
                  <span className="contagem-itens">
                    {itensDoGrupo.length > 0 ? contagemDeItens(itensDoGrupo.length) : ""}
                  </span>
                  <IconeSeta className="seta-sessao" />
                </button>

                {itensDoGrupo.length > 0 &&
                  (sessaoAConfirmarLimpeza === chave ? (
                    <span className="confirmar-limpeza">
                      <button type="button" className="perigo" onClick={() => limparSessao(chave)}>
                        Apagar {itensDoGrupo.length}?
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => setSessaoAConfirmarLimpeza(null)}
                      >
                        não
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="botao-limpar-sessao"
                      title={`Limpar ${rotulo}`}
                      aria-label={`Limpar os itens de ${rotulo}`}
                      onClick={() => setSessaoAConfirmarLimpeza(chave)}
                    >
                      <IconeLixeira tamanho={17} />
                    </button>
                  ))}
              </div>

              {aberto && (
                <div className="corpo-sessao">
                  <div className="linha-sugestao-ia">
                    <button
                      type="button"
                      className="secundario"
                      disabled={statusIA === "carregando"}
                      onClick={() => gerarSugestaoIA(chave)}
                    >
                      {statusIA === "carregando" ? "Gerando sugestão..." : "✨ Sugerir quantidades com IA"}
                    </button>
                  </div>
                  {mensagemIA && (
                    <p className={statusIA === "erro" ? "erro-conversao" : "nota-rodape"}>{mensagemIA}</p>
                  )}

                  {listaProdutos.length === 0 && (
                    <p className="nota-rodape">Nenhum produto ativo nesta categoria ainda.</p>
                  )}

                  {listaProdutos.map((produto) => {
                    const itemSalvo = itensDoGrupo.find((i) => i.codigoPdv === produto.codigoPdv);
                    const editando = produtoAtivo === produto.codigoPdv;
                    return (
                      <div key={produto.codigoPdv} className="linha-produto-cronograma">
                        <button
                          type="button"
                          className={`item-produto ${itemSalvo ? "confirmado" : ""}`}
                          onClick={() => abrirEdicao(produto.codigoPdv, chave)}
                        >
                          <span>{produto.nome}</span>
                          {itemSalvo && <span className="valor-confirmado">{itemSalvo.quantidadeUnidades} un ✓</span>}
                        </button>

                        {editando && (
                          <div className="editor-quantidade">
                            <input
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9]*[.,]?[0-9]*"
                              autoFocus
                              placeholder="Quantidade em unidades"
                              value={valorEditando}
                              onChange={(e) => setValorEditando(sanitizarEntradaNumerica(e.target.value))}
                            />
                            <span className="unidade-fixa">un</span>
                            <button
                              type="button"
                              className="primario"
                              disabled={!ehNumeroValidoPositivo(valorEditando)}
                              onClick={() => confirmarQuantidade(chave, produto.codigoPdv)}
                            >
                              Confirmar
                            </button>
                          </div>
                        )}

                        {itemSalvo && !editando && (
                          <button
                            type="button"
                            className="link"
                            onClick={() => removerItem(chave, produto.codigoPdv)}
                          >
                            remover
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {cadastrandoEm === chave ? (
                    <div className="cadastro-relampago">
                      <label>
                        Nome do produto novo em {rotulo}
                        <input
                          type="text"
                          autoFocus
                          value={nomeNovoProduto}
                          onChange={(e) => setNomeNovoProduto(e.target.value)}
                          placeholder="Nome do produto"
                        />
                      </label>
                      <div className="acoes">
                        <button
                          type="button"
                          className="link"
                          onClick={() => {
                            setCadastrandoEm(null);
                            setNomeNovoProduto("");
                          }}
                        >
                          cancelar
                        </button>
                        <button
                          type="button"
                          className="primario"
                          disabled={!nomeNovoProduto.trim() || salvandoNovoProduto}
                          onClick={() => void cadastrarProduto(chave)}
                        >
                          {salvandoNovoProduto ? "Salvando..." : "Cadastrar produto"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setCadastrandoEm(chave);
                        setNomeNovoProduto("");
                      }}
                    >
                      + cadastrar produto novo em {rotulo}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="acoes acoes-do-card">
          <button
            type="button"
            className="secundario"
            disabled={totalItens === 0}
            onClick={() => {
              setImpressaoDeLoja(LOJA_MATRIZ.id);
              setFase("exportar");
            }}
          >
            <IconeImpressora tamanho={17} /> Imprimir
          </button>
        </div>
      </CardCronograma>

      {/* CONFIRMAR PRODUÇÃO PERTO DO POLEGAR (set/2026, pedido do dono do
          negócio: "o próximo botão disponível para clicar será o ENVIAR
          PEDIDO... quero que o botão fique fácil" — aqui o equivalente é
          Confirmar produção). Ele morava lá embaixo, depois das 5
          sessões de categoria — com a lista crescendo sozinha por voz
          (auto-incluir, acima), rolar até o fim para confirmar era o
          único toque manual que sobrava. Só aparece com o card da matriz
          aberto E com algo lançado: fora disso ficaria flutuando sobre o
          card errado (o de uma filial) sem servir para nada ali. */}
      {!!cardsAbertos[LOJA_MATRIZ.id] && totalItens > 0 && (
        <div className="acao-fixa-secundaria">
          {matrizAConfirmar ? (
            <>
              <button type="button" className="link" onClick={() => setMatrizAConfirmar(false)}>
                não
              </button>
              <button
                type="button"
                className="primario"
                disabled={salvando}
                onClick={confirmarESalvar}
              >
                {salvando ? "Salvando..." : `Confirmar ${contagemDeItens(totalItens)}?`}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primario"
              onClick={() => setMatrizAConfirmar(true)}
            >
              Confirmar produção
            </button>
          )}
        </div>
      )}

      {/*
        O BOTÃO DA LISTA DA COZINHA — NO FIM DA PÁGINA (ago/2026, pedido
        do dono do negócio)
        ---------------------------------------------------------------
        Ele nasceu no topo, no lugar do antigo card "Programação geral", e
        desceu para cá: imprimir é a ÚLTIMA coisa que se faz. Primeiro se
        revisa cada loja, depois se confirma o que saiu hoje, e só então o
        papel vai para a cozinha. Um botão de imprimir no alto convida a
        gerar papel antes de conferir o que ele traz.

        O card mostrava, na tela, a soma das três lojas por segmento. Só
        que ninguém decide nada olhando esse número na tela: ele existe
        para virar PAPEL e ficar pregado na cozinha da matriz, ao lado do
        forno, onde o celular não vai.

        Um card que só se lê para depois imprimir é um card que podia ser
        o botão de imprimir. O que sobrou na tela são os cards das lojas,
        que é onde se revisa e se decide.
      */}
      <button
        type="button"
        className="primario largura-cheia botao-lista-producao"
        disabled={variedadesGerais === 0}
        onClick={() => {
          setImpressaoDeLoja(null);
          setDocumentoAtivo("producao");
          setFase("exportar");
        }}
      >
        <IconeImpressora tamanho={19} />
        <span className="texto-botao-producao">
          Imprimir lista da produção
          <span className="detalhe-botao">
            {variedadesGerais > 0
              ? `${contagemDeItens(variedadesGerais)} · ${arred(totalUnidadesGerais).toLocaleString("pt-BR")} un · separados por segmento`
              : "nada lançado para esta data ainda"}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * Agrupa itens nas 5 sessões fixas de produção, na ordem em que a padaria
 * produz.
 *
 * A SOBRA NO FIM É DE PROPÓSITO. A filial pode pedir um produto cuja
 * categoria não é uma das cinco — cadastro antigo, item recém-criado, a
 * antiga sessão de encomendas. Filtrar por categoria e pronto faria esses
 * itens simplesmente NÃO APARECEREM no card, sem nenhum sinal, e a loja
 * receberia menos do que pediu sem ninguém entender por quê. Aqui eles
 * caem em "Outros" e ficam visíveis.
 */
function agruparEmSessoes<T extends { codigoPdv: number }>(itens: T[], produtos: Produto[]) {
  const categoriaDe = new Map(produtos.map((p) => [p.codigoPdv, p.categoria]));
  const sessoes = GRUPOS.map((chave) => ({
    chave,
    rotulo: rotuloDaCategoria(chave),
    itens: itens.filter((i) => categoriaDe.get(i.codigoPdv) === chave),
  })).filter((sessao) => sessao.itens.length > 0);

  const agrupados = new Set(sessoes.flatMap((sessao) => sessao.itens.map((i) => i.codigoPdv)));
  const sobra = itens.filter((i) => !agrupados.has(i.codigoPdv));
  if (sobra.length > 0) sessoes.push({ chave: "outros", rotulo: "Outros", itens: sobra });

  return sessoes;
}

/** Estado curto que cada card mostra no próprio cabeçalho. */
interface SituacaoDoCard {
  texto: string;
  tom: "ok" | "pendente";
}

interface CardCronogramaProps {
  nome: string;
  /** `null` quando não há nada a dizer além do nome e da contagem. */
  situacao: SituacaoDoCard | null;
  /** Tamanho da lista, em VARIEDADES: "12 itens". */
  contagem: string;
  aberto: boolean;
  onAlternar: () => void;
  children: ReactNode;
}

/**
 * A casca dos cinco cards do Cronograma (ago/2026).
 *
 * Um componente só, e não cinco blocos parecidos, para que "mesmo
 * tamanho, mesmo visual" seja uma consequência do código e não uma
 * disciplina de quem edita: qualquer ajuste no cabeçalho vale para os
 * cinco de uma vez.
 *
 * O corpo é ESCONDIDO, não desmontado: a confirmação do dia guarda as
 * caixas que o operador desmarcou, e recolher o card por engano não pode
 * jogar essa conferência fora.
 */
function CardCronograma({ nome, situacao, contagem, aberto, onAlternar, children }: CardCronogramaProps) {
  return (
    <div className={`card-cronograma ${aberto ? "aberto" : ""}`}>
      <button type="button" className="cabecalho-card" aria-expanded={aberto} onClick={onAlternar}>
        <span className="texto-card">
          <span className="nome-card">{nome}</span>
          {situacao && <span className={`situacao-card ${situacao.tom}`}>{situacao.texto}</span>}
        </span>
        <span className="contagem-card">{contagem}</span>
        <IconeSeta className="seta-sessao" />
      </button>
      <div className="corpo-card" hidden={!aberto}>
        {children}
      </div>
    </div>
  );
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
