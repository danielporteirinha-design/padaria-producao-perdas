/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * A aba REPOSIÇÃO da filial (reescrita em ago/2026, com suporte a suprimentos;
 * set/2026, Suprimentos deixou de ser uma aba própria e passou a morar aqui).
 *
 * REPOSIÇÃO E SUPRIMENTOS NUMA TELA SÓ (set/2026, pedido do dono do
 * negócio: "simplificar o fluxo... em uma única aba").
 *
 * A Reposição já roda no balcão e os suprimentos são o segundo pedido do
 * mesmo momento do dia — duas abas para uma única tarefa ("pedir o que
 * falta") era troca de tela para fazer a mesma coisa duas vezes. Agora
 * busca, microfone e "pedido em montagem" tratam produto de padaria e
 * suprimento como a MESMA lista: um catálogo combinado na busca e no
 * microfone, um cartão de montagem com os dois tipos de item, um único
 * botão Enviar que manda os dois pedidos (cada um para o lugar certo no
 * banco — são documentos diferentes por baixo, mas isso não é problema
 * de quem está pedindo).
 */

import { useEffect, useMemo, useState } from "react";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { idDaReposicao } from "../types/pedido";
import {
  idDoPedidoSuprimentos,
  idDoSuprimento,
  segmentosExibidos,
  type ItemPedidoSuprimento,
  type PedidoSuprimentos,
  type Suprimento,
} from "../types/suprimento";
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
import { adivinharSegmentoSuprimento } from "../lib/adivinharSuprimento";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
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

/**
 * O CATÁLOGO DE VOZ É UM SÓ, PRODUTOS E SUPRIMENTOS JUNTOS (set/2026).
 *
 * O AssistenteDeVoz fala a língua de `Produto` — código de PDV, nome. Um
 * suprimento não tem código de PDV; ganha um emprestado, alto o bastante
 * para nunca colidir com um código real (o PDV usa números bem menores),
 * e a tradução de volta (`ehCodigoDeSuprimento`/`indiceDoSuprimento`)
 * mora só aqui, junto de quem inventou o número.
 */
const OFFSET_SUPRIMENTO = 1_000_000_000;
function ehCodigoDeSuprimento(codigoPdv: number): boolean {
  return codigoPdv >= OFFSET_SUPRIMENTO;
}
function indiceDoSuprimento(codigoPdv: number): number {
  return codigoPdv - OFFSET_SUPRIMENTO;
}

/** "polpa de frutas" -> "Polpa De Frutas" — só para sugerir um nome
 * legível a partir do que o microfone ouviu. */
function capitalizarNome(bruto: string): string {
  return bruto
    .trim()
    .split(/\s+/)
    .map((parte) => (parte.length > 0 ? parte[0].toUpperCase() + parte.slice(1).toLowerCase() : parte))
    .join(" ");
}

/**
 * SÓ O QUE MEDE, PARA SUGERIR O NOME (herdado de Suprimentos, set/2026,
 * para quando a voz não achou o item). Tira número e palavra de
 * quantidade do que o microfone ouviu, mas MANTÉM "de/da/do": o texto
 * vira o nome do item que vai para o catálogo, e sem a preposição "saco
 * de papel" viraria o errado "saco papel".
 */
const PALAVRAS_DE_QUANTIDADE = [
  "UNIDADES", "UNIDADE", "UN",
  "PECAS", "PECA", "ITENS", "ITEM",
  "DUZIA", "DUZIAS",
];
function nomeSugeridoDaSobra(trecho: string): string {
  const palavras = trecho
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PALAVRAS_DE_QUANTIDADE.includes(p.toUpperCase()));
  return capitalizarNome(palavras.join(" "));
}

/** A quantidade já foi dita — não pedir de novo (mesma regra de Suprimentos). */
function quantidadeSugeridaDaSobra(trecho: string): number | null {
  const encontrado = trecho.match(/\d+(?:[.,]\d+)?/);
  if (!encontrado || !ehNumeroValidoPositivo(encontrado[0])) return null;
  return paraNumero(encontrado[0]);
}

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
   * Cadastro relâmpago de um produto que não existe no catálogo ainda —
   * mesmo mecanismo que a matriz já tem em PainelFornoDeHoje.tsx, agora
   * espelhado aqui para a filial não depender da matriz para incluir um
   * item novo na Reposição.
   */
  onCadastrarProduto: (input: NovoProdutoInput) => Promise<Produto | undefined>;
  /** Cadastro relâmpago de um suprimento novo — mesmo mecanismo que
   * existia em TelaSuprimentos.tsx, agora incorporado aqui (set/2026). */
  onCadastrarSuprimento: (suprimento: Suprimento) => Promise<void>;
  /** Envia (soma ao que a loja já mandou hoje) a lista de suprimentos. */
  onEnviarLista: (pedido: PedidoSuprimentos) => Promise<void>;
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
  onCadastrarProduto,
  onCadastrarSuprimento,
  onEnviarLista,
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [busca, setBusca] = useState("");
  /** O microfone está aberto? Enquanto estiver, a busca some da tela. */
  const [ouvindoVoz, setOuvindoVoz] = useState(false);
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aberta, setAberta] = useState<Record<string, boolean>>({});

  // --- SUPRIMENTOS, na mesma tela (set/2026) -----------------------------
  /** Qual suprimento está com o editor de quantidade aberto — mesmo
   * papel de `codigoPedindo`, mas para o outro catálogo (nunca os dois
   * abertos ao mesmo tempo: abrir um fecha o outro). */
  const [itemSuprimentoAtivo, setItemSuprimentoAtivo] = useState<string | null>(null);
  const [itensSuprimentos, setItensSuprimentos] = useState<ItemPedidoSuprimento[]>([]);
  /** Segmento em que o cadastro relâmpago está salvando (chip tocado). */
  const [salvandoSuprimentoNovo, setSalvandoSuprimentoNovo] = useState("");
  /**
   * QUANDO A PESSOA DISCORDA DO PALPITE (set/2026): o app tenta adivinhar
   * se o que não foi achado é produto de padaria ou suprimento (ver
   * `adivinharSegmentoSuprimento`), mas o palpite pode errar — "leite
   * condensado" não é embalagem nem limpeza, por exemplo, e é claramente
   * um produto. Um link troca o tipo sugerido sem reiniciar a busca.
   * `null` = confia no palpite; guarda o texto para não vazar de uma
   * busca para a próxima.
   */
  const [tipoForcadoPara, setTipoForcadoPara] = useState<{
    texto: string;
    tipo: "produto" | "suprimento";
  } | null>(null);

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


  const nomePorSuprimentoId = useMemo(
    () => new Map(catalogoSuprimentos.map((s) => [s.id, s.nome])),
    [catalogoSuprimentos]
  );
  const suprimentosAtivos = useMemo(
    () => catalogoSuprimentos.filter((s) => s.ativo),
    [catalogoSuprimentos]
  );
  const segmentosCadastro = useMemo(
    () => segmentosExibidos(catalogoSuprimentos),
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
        pedidosSuprimentos,
      }),
    [fornadas, pedidos, hoje, loja.id, encerrados, dispensadas, itens, pedidosSuprimentos]
  );
  const semResposta = useMemo(() => linhas.filter(estaPendente), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !estaPendente(l)), [linhas]);

  /** A lista de suprimentos já enviada hoje — a base sobre a qual o
   * próximo envio SOMA (ver `enviarTudo`, mais abaixo). */
  const pedidoSuprimentosDeHoje = useMemo(
    () => pedidosSuprimentos.find((p) => p.data === hoje && p.lojaId === loja.id),
    [pedidosSuprimentos, hoje, loja.id]
  );

  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && !encerrados.has(p.codigoPdv) && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca, encerrados]);

  const resultadosSuprimentos = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return suprimentosAtivos
      .filter((s) => contemBusca(s.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [suprimentosAtivos, busca]);

  /**
   * Cadastro relâmpago de PRODUTO (set/2026, pedido do dono do negócio: a
   * inserção de produto novo "pode ser feita pela matriz ou filiais"). A
   * matriz já tinha isso em PainelFornoDeHoje — aqui é o mesmo botão,
   * para o mesmo caso: a busca não achou nada no catálogo. Depois de
   * salvar, abre direto o editor de quantidade do item recém-criado (ou
   * já entra na lista, se a quantidade veio da fala) — o próximo passo
   * natural é pedir a quantidade, não parar no meio.
   */
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
      setBusca("");
      setTipoForcadoPara(null);
      if (quantidadeInicial && quantidadeInicial > 0) {
        acrescentar([{ codigoPdv: novo.codigoPdv, quantidadeUnidades: quantidadeInicial }]);
      } else {
        setCodigoPedindo(novo.codigoPdv);
        setQuantidade("");
      }
    } catch {
      // Mensagem já vem do aviso global (ver App.tsx).
    } finally {
      setSalvandoNovo(false);
    }
  }

  /** Cadastro relâmpago de SUPRIMENTO — mesma operação que existia em
   * TelaSuprimentos.tsx, agora aqui (set/2026). */
  async function cadastrarSuprimentoNovo(
    nome: string,
    segmento: string,
    quantidadeInicial?: number | null
  ) {
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
      if (quantidadeInicial && quantidadeInicial > 0) {
        acrescentarSuprimentos([{ suprimentoId: novo.id, quantidade: quantidadeInicial }]);
      } else {
        setItemSuprimentoAtivo(novo.id);
        setQuantidade("");
      }
    } catch {
      /* o aviso global cuida da mensagem */
    } finally {
      setSalvandoSuprimentoNovo("");
    }
  }

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

  /** Mesma lógica de `acrescentar`, para o carrinho de suprimentos. */
  function acrescentarSuprimentos(novos: { suprimentoId: string; quantidade: number }[]) {
    if (novos.length === 0) return;
    setItensSuprimentos((atual) => {
      const lista = [...atual];
      for (const novo of novos) {
        if (novo.quantidade <= 0) continue;
        const onde = lista.findIndex((i) => i.suprimentoId === novo.suprimentoId);
        if (onde >= 0) {
          lista[onde] = { ...lista[onde], quantidade: lista[onde].quantidade + novo.quantidade };
        } else {
          lista.push({ suprimentoId: novo.suprimentoId, quantidade: novo.quantidade });
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

  function mudarQuantidadeSuprimento(suprimentoId: string, bruto: string) {
    const limpo = sanitizarEntradaNumerica(bruto);
    setItensSuprimentos((atual) =>
      atual.map((i) =>
        i.suprimentoId === suprimentoId
          ? { ...i, quantidade: ehNumeroValidoPositivo(limpo) ? paraNumero(limpo) : 0 }
          : i
      )
    );
  }

  /**
   * INCLUIR/CANCELAR NUM LUGAR SÓ, PERTO DO POLEGAR (set/2026, pedido do
   * dono do negócio: "esses botões devem ficar na mesma localização
   * próxima ao polegar"). Antes, cada editor de quantidade (fornada da
   * matriz, resultado de busca de produto, resultado de busca de
   * suprimento) tinha o seu próprio par de botões Incluir/cancelar,
   * espalhados pela tela conforme o que estava sendo editado. Os TRÊS
   * editores continuam existindo — cada um mostra o campo de quantidade
   * no lugar certo, junto do item — mas o toque final é um par de botões
   * só, sempre na mesma barra fixa embaixo da tela: `codigoPedindo` e
   * `itemSuprimentoAtivo` nunca ficam abertos ao mesmo tempo, então esta
   * função sempre sabe para qual carrinho mandar.
   */
  function confirmarInclusaoFixa() {
    if (!ehNumeroValidoPositivo(quantidade)) return;
    const valor = paraNumero(quantidade);
    if (codigoPedindo !== null) {
      acrescentar([{ codigoPdv: codigoPedindo, quantidadeUnidades: valor }]);
    } else if (itemSuprimentoAtivo !== null) {
      acrescentarSuprimentos([{ suprimentoId: itemSuprimentoAtivo, quantidade: valor }]);
    }
    setCodigoPedindo(null);
    setItemSuprimentoAtivo(null);
    setQuantidade("");
    setBusca("");
  }

  function cancelarEdicaoFixa() {
    setCodigoPedindo(null);
    setItemSuprimentoAtivo(null);
    setQuantidade("");
  }

  /**
   * SOMA AO QUE A LOJA JÁ MANDOU HOJE, NÃO SUBSTITUI (herdado de
   * TelaSuprimentos.tsx, set/2026): gravar suprimentos é substituição
   * inteira do documento do dia, não mescla — então cada envio precisa
   * somar ao que já estava lá, ou o segundo pedido do dia apagaria o
   * primeiro sem ninguém perceber.
   */
  function itensSuprimentosMesclados(): ItemPedidoSuprimento[] {
    const mapa = new Map(pedidoSuprimentosDeHoje?.itens.map((i) => [i.suprimentoId, i.quantidade]) ?? []);
    for (const item of itensSuprimentos) {
      if (item.quantidade <= 0) continue;
      mapa.set(item.suprimentoId, (mapa.get(item.suprimentoId) ?? 0) + item.quantidade);
    }
    return [...mapa].map(([suprimentoId, quantidade]) => ({ suprimentoId, quantidade }));
  }

  /**
   * UM TOQUE, OS DOIS PEDIDOS (set/2026, pedido do dono do negócio: "um
   * carrinho único, um só Enviar"). Produto e suprimento continuam sendo
   * dois documentos diferentes no Firestore — urgências e telas de quem
   * decide são diferentes —, mas quem está pedindo não precisa saber
   * disso nem tocar em dois botões para mandar as duas listas.
   */
  async function enviarTudo() {
    const validosProdutos = itens.filter((i) => i.quantidadeUnidades > 0);
    const temSuprimentosNovos = itensSuprimentos.some((i) => i.quantidade > 0);
    if ((validosProdutos.length === 0 && !temSuprimentosNovos) || enviando) return;
    setEnviando(true);
    const agora = new Date().toISOString();
    try {
      if (validosProdutos.length > 0) {
        await onSalvarPedido({
          id: idDaReposicao(hoje, loja.id, agora),
          lojaId: loja.id,
          data: hoje,
          itens: validosProdutos,
          status: "enviado",
          tipo: "reposicao",
          criadoPor: operador,
          criadoEm: agora,
          enviadoEm: agora,
        });
      }
      if (temSuprimentosNovos) {
        await onEnviarLista({
          id: idDoPedidoSuprimentos(hoje, loja.id),
          lojaId: loja.id,
          data: hoje,
          itens: itensSuprimentosMesclados(),
          status: "enviado",
          // `atendimento` fica de fora de propósito — ver o comentário
          // equivalente que existia em TelaSuprimentos.tsx: a lista
          // cresceu, e uma decisão antiga da matriz valia para a lista
          // de antes.
          criadoPor: pedidoSuprimentosDeHoje?.criadoPor ?? operador,
          criadoEm: pedidoSuprimentosDeHoje?.criadoEm ?? agora,
          enviadoEm: agora,
        });
      }
      setItens([]);
      setItensSuprimentos([]);
      setBusca("");
      setCodigoPedindo(null);
      setItemSuprimentoAtivo(null);
      setAberta({ semResposta: true });
    } finally {
      setEnviando(false);
    }
  }

  const totalUnidades = itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0);
  const faltaQuantidade =
    itens.some((i) => i.quantidadeUnidades <= 0) || itensSuprimentos.some((i) => i.quantidade <= 0);
  const totalDeItens = itens.length + itensSuprimentos.length;

  /**
   * O CATÁLOGO DE VOZ, PRODUTOS E SUPRIMENTOS JUNTOS (set/2026, pedido do
   * dono do negócio: "um microfone, os dois catálogos"). O suprimento
   * empresta a forma de `Produto` só para o AssistenteDeVoz conseguir
   * comparar a fala com o nome — a tradução de volta usa o índice
   * guardado no código de PDV emprestado (ver `OFFSET_SUPRIMENTO`).
   */
  const catalogoDeVoz = useMemo<Produto[]>(() => {
    const emprestados = suprimentosAtivos.map(
      (s, indice) =>
        ({
          codigoPdv: OFFSET_SUPRIMENTO + indice,
          nome: s.nome,
          ativoNaProducao: true,
        }) as unknown as Produto
    );
    return [...produtos, ...emprestados];
  }, [produtos, suprimentosAtivos]);

  /**
   * OS BOTÕES DE "ONDE ESTE ITEM MORA" (set/2026, herdado de
   * TelaSuprimentos.tsx e agora estendido para decidir também PRODUTO vs
   * SUPRIMENTO).
   *
   * `adivinharSegmentoSuprimento` chuta pela palavra ("saco", "detergente"
   * ...) se o nome parece suprimento; sem palpite, o chute é produto de
   * padaria, que é o uso principal desta tela. O palpite pode estar
   * errado — por isso o link "na verdade é..." troca de lado num toque,
   * em vez de a pessoa ter que digitar tudo de novo.
   *
   * CANCELAR É UM BOTÃO SÓ, SEMPRE NO MESMO LUGAR (set/2026, pedido do
   * dono do negócio: "fique mais fácil e intuitivo cancelar"). Antes,
   * desistir de cadastrar um produto era só fechar a busca; aqui vira um
   * botão explícito — e, vindo do microfone (`remover` presente), ele
   * também tira o trecho da lista "não entrou", em vez de deixá-lo preso
   * ali até a pessoa falar nome por nome de novo.
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
                    onClick={() =>
                      void cadastrarSuprimentoNovo(nome, valorGravado, quantidadeInicialSugerida)
                    }
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

  /**
   * A LISTA DE SUPRIMENTOS DENTRO DA SANFONA (set/2026, pedido do dono
   * do negócio).
   *
   * Mesma forma das outras linhas — etiqueta, nome, hora e situação —,
   * porque é a mesma pergunta: a matriz respondeu ou não? O que muda é
   * que aqui o "produto" é uma lista, e por isso os itens aparecem
   * escritos embaixo: sem eles a linha diria "Suprimentos" e obrigaria a
   * pessoa a trocar de aba para lembrar o que foi que ela pediu.
   */
  function linhaDeSuprimentos(linha: LinhaDoDia) {
    const pedidos = (linha.suprimentos?.itens ?? []).filter((i) => i.quantidade > 0);
    const quantos = linha.variedades ?? pedidos.length;
    return (
      <div key={linha.chave} className="linha-reposicao">
        <span className="nome-reposicao">
          <span className="topo-reposicao">
            <em className="etiqueta-origem suprimentos">Suprimentos</em>
            <strong>Embalagens e limpeza</strong>
            <em className="hora-reposicao">{horaDoInstante(linha.quando)}</em>
          </span>

          {pedidos.length > 0 && (
            <span className="itens-da-lista">
              {pedidos
                .map(
                  (i) =>
                    `${nomePorSuprimentoId.get(i.suprimentoId) ?? i.suprimentoId} (${i.quantidade})`
                )
                .join(", ")}
            </span>
          )}

          {linha.situacao === "pendente" && (
            <span className="reposicao-aguardando">Aguardando a matriz responder</span>
          )}
          {linha.situacao === "confirmado" && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} /> Separado — vem na próxima entrega.
            </span>
          )}
          {linha.situacao === "cancelado" && (
            <span className="reposicao-negada">Não vem: {linha.motivo}</span>
          )}
        </span>

        <span className="qtd-reposicao">
          {quantos} {quantos === 1 ? "item" : "itens"}
        </span>
      </div>
    );
  }

  function linhaDoDia(linha: LinhaDoDia) {
    if (linha.origem === "suprimentos") return linhaDeSuprimentos(linha);
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
                  setItemSuprimentoAtivo(null);
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
            </span>
          )}
        </span>

        {linha.unidades !== undefined && <span className="qtd-reposicao">{linha.unidades} un</span>}
      </div>
    );
  }

  /** A linha de um suprimento encontrado na busca — mesma forma da linha
   * de produto (`linha-fornada`), com uma etiqueta indicando o tipo, já
   * que agora os dois catálogos aparecem juntos. */
  function linhaSuprimentoDaBusca(suprimento: Suprimento) {
    const ativo = itemSuprimentoAtivo === suprimento.id;
    return (
      <div key={suprimento.id} className="linha-fornada">
        <div className="info-fornada">
          <strong>{suprimento.nome}</strong>
          <em className="etiqueta-tipo-discreta">Suprimento</em>
        </div>
        {ativo ? (
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
          </div>
        ) : (
          <div className="acoes-fornada">
            <button
              type="button"
              className="botao-fornada pedir"
              onClick={() => {
                setItemSuprimentoAtivo(suprimento.id);
                setCodigoPedindo(null);
                setQuantidade("");
              }}
            >
              Incluir
            </button>
          </div>
        )}
      </div>
    );
  }

  const nadaEncontrado =
    busca.trim().length > 0 && resultados.length === 0 && resultadosSuprimentos.length === 0;

  return (
    <div
      className={`painel-fornadas ${
        codigoPedindo !== null || itemSuprimentoAtivo !== null || totalDeItens > 0
          ? "com-acao-fixa"
          : ""
      }`}
    >
      <div className="corpo-fornadas">
        {/* O CARTÃO SOLTO DE SUPRIMENTOS SAIU DAQUI (set/2026, pedido do
            dono do negócio: a lista de suprimentos "deve também ser
            sinalizada nas sanfonas de pedidos não respondidos").

            Ele ficava acima de tudo, fora das duas listas, e por isso
            não era cobrado por ninguém: a pessoa lia "Pedidos sem
            resposta", via a sanfona vazia e concluía que o dia estava
            resolvido — com a lista de embalagens parada esperando a
            matriz logo acima, sem sino e sem contagem. Agora a lista é
            uma linha das sanfonas, como qualquer outra coisa que espera
            resposta. */}
        <AssistenteDeVoz
          produtos={catalogoDeVoz}
          modo="pedir"
          acao="adicionar"
          onOuvindoMudou={setOuvindoVoz}
          onConfirmar={async (ditados) => {
            const deProdutos: { codigoPdv: number; quantidadeUnidades: number }[] = [];
            const deSuprimentos: { suprimentoId: string; quantidade: number }[] = [];
            for (const ditado of ditados) {
              if (!ditado.quantidade || ditado.quantidade <= 0) continue;
              if (ehCodigoDeSuprimento(ditado.produto.codigoPdv)) {
                const suprimento = suprimentosAtivos[indiceDoSuprimento(ditado.produto.codigoPdv)];
                if (suprimento) {
                  deSuprimentos.push({ suprimentoId: suprimento.id, quantidade: ditado.quantidade });
                }
              } else {
                deProdutos.push({
                  codigoPdv: ditado.produto.codigoPdv,
                  quantidadeUnidades: ditado.quantidade,
                });
              }
            }
            acrescentar(deProdutos);
            acrescentarSuprimentos(deSuprimentos);
          }}
          renderSobra={opcoesParaSobra}
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
              setItemSuprimentoAtivo(null);
              setTipoForcadoPara(null);
            }}
            placeholder="Buscar produto ou suprimento para pedir..."
            rotulo="Buscar produto ou suprimento pelo nome"
          />
        )}

        {busca.trim().length > 0 &&
          (nadaEncontrado ? (
            cadastroRelampago(busca.trim())
          ) : (
            <>
              {resultados.map((produto) => (
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
                    </div>
                  ) : (
                    <div className="acoes-fornada">
                      <button
                        type="button"
                        className="botao-fornada pedir"
                        onClick={() => {
                          setCodigoPedindo(produto.codigoPdv);
                          setItemSuprimentoAtivo(null);
                          setQuantidade("");
                        }}
                      >
                        Incluir
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {resultadosSuprimentos.map((suprimento) => linhaSuprimentoDaBusca(suprimento))}
            </>
          ))}

        {totalDeItens > 0 && (
          <div className="pedido-em-montagem">
            <strong className="titulo-montagem">Pedido em montagem</strong>

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

            {itensSuprimentos.map((item) => (
              <div key={item.suprimentoId} className="linha-montagem">
                <span className="nome-montagem com-etiqueta-tipo">
                  <span>{nomePorSuprimentoId.get(item.suprimentoId) ?? item.suprimentoId}</span>
                  <em className="etiqueta-tipo-discreta">Suprimento</em>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="qtd-conferencia"
                  aria-label={`Quantidade de ${nomePorSuprimentoId.get(item.suprimentoId) ?? item.suprimentoId}`}
                  placeholder="qtd"
                  value={item.quantidade > 0 ? String(item.quantidade) : ""}
                  onChange={(e) => mudarQuantidadeSuprimento(item.suprimentoId, e.target.value)}
                />
                <button
                  type="button"
                  className="tirar-da-lista"
                  aria-label={`Tirar ${nomePorSuprimentoId.get(item.suprimentoId) ?? item.suprimentoId} da lista`}
                  onClick={() =>
                    setItensSuprimentos((atual) =>
                      atual.filter((i) => i.suprimentoId !== item.suprimentoId)
                    )
                  }
                >
                  <IconeLixeira tamanho={16} />
                </button>
              </div>
            ))}

            <p className="nota-rodape">
              {totalDeItens} {totalDeItens === 1 ? "item" : "itens"}
              {itens.length > 0 ? ` · ${totalUnidades} unidades de produto` : ""}
            </p>
            {faltaQuantidade && (
              <p className="nota-rodape">Informe a quantidade dos itens em branco.</p>
            )}
          </div>
        )}

        {sanfona("semResposta", "Pedidos sem resposta", semResposta, { cobraResposta: true })}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

      </div>

      {/* BARRA FIXA PERTO DO POLEGAR (set/2026, pedido do dono do
          negócio: "enviar / adicionar... devem ficar na mesma
          localização próxima ao polegar"). Um lugar só, sempre no mesmo
          canto da tela, para o toque final: confirmar a quantidade de um
          item (produto ou suprimento, os três editores acima só mostram
          o campo — quem confirma é este par de botões) ou, sem editor
          aberto, mandar a lista embora. Fica empilhada ACIMA do botão do
          microfone (não dentro dele) para não arriscar o comportamento
          das outras 4 telas que reaproveitam o AssistenteDeVoz. */}
      {(codigoPedindo !== null || itemSuprimentoAtivo !== null) ? (
        <div className="acao-fixa-secundaria">
          <button type="button" className="link" onClick={cancelarEdicaoFixa}>
            cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!ehNumeroValidoPositivo(quantidade)}
            onClick={confirmarInclusaoFixa}
          >
            Incluir
          </button>
        </div>
      ) : (
        totalDeItens > 0 && (
          <div className="acao-fixa-secundaria">
            <button
              type="button"
              className="primario"
              disabled={enviando || faltaQuantidade}
              onClick={() => void enviarTudo()}
            >
              {enviando ? "Enviando..." : `Enviar (${totalDeItens})`}
            </button>
          </div>
        )
      )}
    </div>
  );
}
