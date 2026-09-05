/**
 * src/components/TelaPedidoFilial.tsx
 * ---------------------------------------------------------------
 * Tela principal da filial (Parte B, ago/2026): informar quanto de cada
 * item ela vai precisar no dia seguinte.
 *
 * A filial NÃO produz — ela pede. Por isso esta tela não fala em
 * "produção" em lugar nenhum, e não tem confirmação de fornada, sessão
 * de corte nem impressão: quem imprime é a matriz, que produz o total e
 * separa por loja de manhã.
 *
 * O acordeão por categoria é o mesmo padrão do cronograma da matriz de
 * propósito — quem já viu uma tela entende a outra, e a categoria é como
 * o operador procura produto (ninguém procura pão na lista de bolos).
 *
 * ENVIAR É UM PASSO EXPLÍCITO. Enquanto está em rascunho, a matriz vê
 * "aguardando" e a quantidade NÃO entra na produção — a filial ainda
 * está mexendo. Produzir com base num número que ninguém confirmou seria
 * pior que produzir sem ele.
 */

import { useEffect, useMemo, useState } from "react";
import type { NovoProdutoInput, Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { PedidoFilial } from "../types/pedido";
import type { RegistroPerda } from "../types/perda";
import { ehPedidoDiario, idDoPedido } from "../types/pedido";
import { AtivarAvisos } from "./AtivarAvisos";
import type { Loja } from "../lib/lojas";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { proximaDataAlvo } from "../lib/dataAlvoDoDia";
import { diferencasDoAjuste, itensIguais } from "../types/pedido";
import {
  apagarRascunhoPedido,
  gravarRascunhoPedido,
  lerRascunhoPedido,
  limparRascunhosDePedidoAntigos,
} from "../lib/rascunhoPedido";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import {
  buscarSugestaoProducao,
  ErroSugestaoProducao,
  montarHistoricoDaFilial,
} from "../lib/sugestaoProducao";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import { IconeCalendario, IconeConfere, IconeLixeira, IconeSeta } from "./Icones";

interface TelaPedidoFilialProps {
  loja: Loja;
  produtos: Produto[];
  pedidos: PedidoFilial[];
  /**
   * Perdas — o outro lado da conta na sugestão por IA. Pedir mais do que
   * se vende vira perda no dia seguinte, e é justamente esse par
   * (pedido × perda) que a IA lê para sugerir.
   */
  perdas: RegistroPerda[];
  operador: string;
  /** Data de hoje, viva — ver src/lib/useDiaCorrente.ts. */
  hoje: string;
  /** Fornadas prontas hoje na matriz — base do pedido de reposição. */
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
  /**
   * Cadastro relâmpago de um produto que ainda não está no catálogo
   * (set/2026, pedido do dono do negócio: cadastro "pela matriz ou
   * filiais", direto de onde falta o produto). A categoria já vem
   * decidida pela sessão em que o botão aparece — só falta o nome.
   */
  onCadastrarProduto: (input: NovoProdutoInput) => Promise<Produto | undefined>;
}

export function TelaPedidoFilial({
  loja,
  produtos,
  pedidos,
  perdas,
  operador,
  hoje,
  onSalvarPedido,
  onCadastrarProduto,
}: TelaPedidoFilialProps) {
  const [dataAlvo, setDataAlvo] = useState(dataDeAmanhaIso());
  const [mostrarSeletorData, setMostrarSeletorData] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [cadastrandoEm, setCadastrandoEm] = useState<string | null>(null);
  const [nomeNovoProduto, setNomeNovoProduto] = useState("");
  const [salvandoNovoProduto, setSalvandoNovoProduto] = useState(false);
  const [sessaoAConfirmarLimpeza, setSessaoAConfirmarLimpeza] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [statusSugestao, setStatusSugestao] = useState<Record<string, "" | "carregando" | "erro">>({});
  const [mensagemSugestao, setMensagemSugestao] = useState<Record<string, string>>({});

  const pedidoExistente = useMemo(
    // Só o pedido DIÁRIO: a reposição é outra lista, com outra urgência,
    // e não pode ser confundida com o planejamento de amanhã.
    () => pedidos.find((p) => p.data === dataAlvo && p.lojaId === loja.id && ehPedidoDiario(p)),
    [pedidos, dataAlvo, loja.id]
  );

  /**
   * A montagem começa pelo RASCUNHO do aparelho, quando existe, e só cai
   * no pedido gravado quando não existe.
   *
   * Antes vivia só na memória: trocar de aba desmontava a tela e o item
   * removido voltava à lista — defeito relatado em produção. Ver
   * src/lib/rascunhoPedido.ts.
   */
  const [itens, setItens] = useState<ItemPlanoProducao[]>(
    () => lerRascunhoPedido(loja.id, dataAlvo) ?? pedidoExistente?.itens ?? []
  );
  const [dataCarregada, setDataCarregada] = useState(dataAlvo);

  // Ao trocar de data, recarrega o rascunho daquele dia — ou, na falta
  // dele, o pedido gravado.
  if (dataCarregada !== dataAlvo) {
    setDataCarregada(dataAlvo);
    setItens(lerRascunhoPedido(loja.id, dataAlvo) ?? pedidoExistente?.itens ?? []);
    setProdutoAtivo(null);
    setSessaoAConfirmarLimpeza(null);
  }

  /**
   * Grava o rascunho a cada mudança. Barato: é uma linha de texto no
   * aparelho, não uma ida à nuvem — e é o que faz o trabalho sobreviver a
   * trocar de aba, fechar o app e recarregar a página.
   */
  useEffect(() => {
    /**
     * RASCUNHO IGUAL AO PEDIDO GRAVADO NÃO É RASCUNHO — é uma cópia velha
     * esperando para atrapalhar (ago/2026).
     *
     * Sem esta guarda, enviar a lista deixava no aparelho um rascunho
     * idêntico ao que foi enviado. Quando a MATRIZ ajustasse as
     * quantidades, a tela da filial carregaria o rascunho — os números
     * antigos — e o ajuste ficaria invisível justamente para quem
     * precisava vê-lo. O rascunho existe para o que ainda não foi
     * enviado; passou a valer, quem manda é o documento.
     */
    if (pedidoExistente && itensIguais(itens, pedidoExistente.itens)) {
      apagarRascunhoPedido(loja.id, dataAlvo);
      return;
    }
    gravarRascunhoPedido(loja.id, dataAlvo, itens);
  }, [loja.id, dataAlvo, itens, pedidoExistente]);

  /** Rascunho de dia que já passou não serve para nada — sai do aparelho. */
  useEffect(() => {
    limparRascunhosDePedidoAntigos(hoje);
  }, [hoje]);

  /**
   * O que a matriz mudou na lista desta loja (ago/2026).
   *
   * A filial precisa descobrir o corte na VÉSPERA, não na manhã seguinte
   * quando a mercadoria chegar a menos. Por isso a diferença aparece na
   * própria linha do produto, ao lado da quantidade — e não num aviso
   * separado que se lê uma vez e some.
   */
  const ajustes = useMemo(() => {
    if (!pedidoExistente) return new Map<number, number>();
    return new Map(diferencasDoAjuste(pedidoExistente).map((d) => [d.codigoPdv, d.pedido]));
  }, [pedidoExistente]);

  /**
   * O que a matriz cortou por completo. Estes produtos saíram de `itens`,
   * então não apareceriam em lugar nenhum da tela — e sumir em silêncio é
   * exatamente o que não pode acontecer com um item que a loja pediu.
   */
  const cortados = useMemo(
    () =>
      pedidoExistente
        ? diferencasDoAjuste(pedidoExistente).filter((d) => d.confirmado === 0)
        : [],
    [pedidoExistente]
  );

  const diaDaSemana = diaDaSemanaDeData(dataAlvo);
  const totalUnidades = itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0);
  const jaEnviado = pedidoExistente?.status === "enviado";

  /**
   * Vira para o próximo dia útil quando o dia vira com o app aberto. A
   * filial deixa o app aberto no balcão; sem isto, na quinta de manhã a
   * tela ainda oferecia "Pedido para quinta" — a lista que já tinha sido
   * mandada na véspera — e a de sexta ficava sem ser feita.
   *
   * "Trabalho na tela" aqui é rascunho: itens digitados que ainda não
   * foram enviados. Pedido já enviado pode virar de data à vontade, o
   * documento está gravado. A regra inteira em src/lib/dataAlvoDoDia.ts.
   */
  useEffect(() => {
    const temRascunho = itens.length > 0 && !jaEnviado;
    const proxima = proximaDataAlvo(dataAlvo, hoje, temRascunho);
    if (proxima) setDataAlvo(proxima);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoje]);

  function produtosDaCategoria(chave: string): Produto[] {
    return produtos
      .filter((p) => p.categoria === chave && p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function abrirEdicao(codigoPdv: number) {
    if (produtoAtivo === codigoPdv) {
      setProdutoAtivo(null);
      setValorEditando("");
      return;
    }
    setProdutoAtivo(codigoPdv);
    const existente = itens.find((i) => i.codigoPdv === codigoPdv);
    setValorEditando(existente ? String(existente.quantidadeUnidades) : "");
  }

  function confirmarQuantidade(codigoPdv: number) {
    if (!ehNumeroValidoPositivo(valorEditando)) return;
    const quantidadeUnidades = paraNumero(valorEditando);
    setItens((atual) => {
      const existe = atual.some((i) => i.codigoPdv === codigoPdv);
      return existe
        ? atual.map((i) => (i.codigoPdv === codigoPdv ? { ...i, quantidadeUnidades } : i))
        : [...atual, { codigoPdv, quantidadeUnidades }];
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
      abrirEdicao(novo.codigoPdv);
    } catch {
      // Mensagem já vem do aviso global (ver App.tsx).
    } finally {
      setSalvandoNovoProduto(false);
    }
  }

  /**
   * A LISTA INTEIRA DITADA DE UMA VEZ (ago/2026, pedido do dono do
   * negócio: a filial monta o pedido "usando somente o comando de voz").
   *
   * Cai na MESMA lista que o toque monta — não é um pedido paralelo. A
   * pessoa fala "20 pão francês, 10 broa e 5 sonho", confere as três
   * linhas e elas entram na montagem; enviar continua sendo o passo
   * explícito lá embaixo, como sempre foi. Ditar não pode mandar sozinho
   * um pedido que ainda vai ser revisado.
   *
   * Produto já na lista tem a quantidade SUBSTITUÍDA, não somada: quem
   * repete um item falando está corrigindo o número, não pedindo mais.
   */
  function adicionarPorVoz(ditados: { produto: Produto; quantidade: number | null }[]) {
    setItens((atual) => {
      const novo = [...atual];
      for (const { produto, quantidade } of ditados) {
        if (!quantidade || quantidade <= 0) continue;
        const onde = novo.findIndex((i) => i.codigoPdv === produto.codigoPdv);
        if (onde >= 0) novo[onde] = { ...novo[onde], quantidadeUnidades: quantidade };
        else novo.push({ codigoPdv: produto.codigoPdv, quantidadeUnidades: quantidade });
        // Abre a categoria do item ditado: sem isso ele entra na lista e
        // fica invisível atrás de uma sanfona fechada, e a pessoa fica
        // sem saber se o app entendeu.
        setExpandido((a) => ({ ...a, [produto.categoria]: true }));
      }
      return novo;
    });
  }

  function removerItem(codigoPdv: number) {
    setItens((atual) => atual.filter((i) => i.codigoPdv !== codigoPdv));
  }

  function limparCategoria(chave: string) {
    const codigos = new Set(produtosDaCategoria(chave).map((p) => p.codigoPdv));
    setItens((atual) => atual.filter((i) => !codigos.has(i.codigoPdv)));
    setSessaoAConfirmarLimpeza(null);
    setExpandido((a) => ({ ...a, [chave]: false }));
  }

  /**
   * Sugestão de quantidades pela IA, para a filial (ago/2026).
   *
   * Lê o histórico DESTA loja — o que ela pediu e o que ela perdeu —, e
   * não a produção da matriz: a produção total inclui o que foi para as
   * outras lojas, e a sugestão sairia várias vezes maior que este balcão
   * vende. Ver montarHistoricoDaFilial em src/lib/sugestaoProducao.ts.
   *
   * Só preenche o que está VAZIO. Número que a pessoa já digitou é
   * decisão tomada, e sobrescrever seria a IA discordando de quem está no
   * balcão sem nem avisar.
   */
  async function gerarSugestaoIA(chave: string) {
    setStatusSugestao((a) => ({ ...a, [chave]: "carregando" }));
    setMensagemSugestao((a) => ({ ...a, [chave]: "" }));
    try {
      const historico = montarHistoricoDaFilial(chave, loja.id, produtos, pedidos, perdas);
      const sugestoes = await buscarSugestaoProducao(diaDaSemana, chave, historico);

      setItens((atual) => {
        const jaTem = new Set(atual.map((i) => i.codigoPdv));
        const novos = sugestoes
          .filter((s) => !jaTem.has(s.codigoPdv) && s.quantidadeSugerida > 0)
          .map((s) => ({
            codigoPdv: s.codigoPdv,
            quantidadeUnidades: Math.round(s.quantidadeSugerida * 100) / 100,
          }));
        return [...atual, ...novos];
      });
      setExpandido((a) => ({ ...a, [chave]: true }));
      setStatusSugestao((a) => ({ ...a, [chave]: "" }));
      setMensagemSugestao((a) => ({
        ...a,
        [chave]:
          sugestoes.length > 0
            ? `${sugestoes.length} sugestão(ões) da IA adicionada(s) — revise antes de enviar.`
            : "Ainda não há histórico de pedidos suficiente nesta categoria para sugerir.",
      }));
    } catch (erro) {
      setStatusSugestao((a) => ({ ...a, [chave]: "erro" }));
      setMensagemSugestao((a) => ({
        ...a,
        [chave]:
          erro instanceof ErroSugestaoProducao
            ? erro.message
            : "Não foi possível gerar a sugestão agora.",
      }));
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      const agora = new Date().toISOString();
      await onSalvarPedido({
        id: idDoPedido(dataAlvo, loja.id),
        lojaId: loja.id,
        data: dataAlvo,
        itens,
        status: "enviado",
        criadoPor: pedidoExistente?.criadoPor ?? operador,
        criadoEm: pedidoExistente?.criadoEm ?? agora,
        enviadoEm: agora,
      });
      // Enviado, o rascunho cumpriu a função: o pedido gravado passa a ser
      // a verdade. Mantê-lo faria a tela continuar exibindo uma cópia
      // local de algo que já saiu daqui.
      apagarRascunhoPedido(loja.id, dataAlvo);
    } catch {
      // Mensagem vem do aviso global (ver App.tsx).
    } finally {
      setEnviando(false);
    }
  }

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
  }

  return (
    <div className={`tela ${itens.length > 0 ? "com-acao-fixa" : ""}`}>
      <AtivarAvisos loja={loja} operador={operador} />

      {/*
        O estado do pedido mora DENTRO do bloco do título, e não num cartão
        próprio embaixo (ago/2026). Solto, ele virava um segundo balão
        competindo com a data por atenção e empurrando a lista para baixo;
        colado ao título, "Pedido para quinta, 27/08" e "enviado" se leem
        como uma frase só — que é como a informação existe na cabeça de
        quem opera.
      */}
      {/* O ALVO É A PRÓPRIA DATA, como no Cronograma da matriz (ago/2026,
          pedido do dono do negócio: "o usuário clica no título 'pedido
          para dia tal' para mudar a data").

          Havia um link solto embaixo do bloco, "pedir para outra data",
          que precisava ser lido e ainda ficava longe da informação que ele
          muda. As duas telas agora se operam do mesmo jeito: toca-se no
          dia para trocar o dia. Mesmas classes de propósito — ver
          .linha-titulo-do-dia em src/index.css. */}
      <div
        className={`destaque-data titulo-do-dia bloco-pedido ${jaEnviado ? "enviado" : ""}`}
      >
        <button
          type="button"
          className={`linha-titulo-do-dia ${mostrarSeletorData ? "aberta" : ""}`}
          aria-expanded={mostrarSeletorData}
          title="Tocar na data para pedir para outro dia"
          onClick={() => setMostrarSeletorData((v) => !v)}
        >
          <span className="marca-titulo-do-dia">
            <IconeCalendario tamanho={20} />
            <span className="texto-bloco-pedido">
              <span className="titulo-planejamento">
                Pedido para {rotuloDoDia(diaDaSemana)}, {formatarDataBr(dataAlvo)}
              </span>
              <span className="estado-pedido">
                {jaEnviado ? (
                  <>
                    <IconeConfere tamanho={14} /> enviado ·{" "}
                    {pedidoExistente?.itens.length ?? 0} produtos
                  </>
                ) : (
                  "não enviado — a quantidade ainda não entra na produção"
                )}
              </span>
            </span>
          </span>
          <IconeSeta className="seta-sessao" />
        </button>

        {mostrarSeletorData && (
          <div className="escolha-de-data">
            <input
              type="date"
              aria-label="Data do pedido"
              value={dataAlvo}
              onChange={(e) => setDataAlvo(e.target.value)}
            />
            {/* O caminho de volta ao dia normal de trabalho. Sem ele,
                voltar de uma data distante exigiria lembrar qual é a data
                de amanhã e digitá-la. */}
            {dataAlvo !== dataDeAmanhaIso() && (
              <button
                type="button"
                className="link"
                onClick={() => setDataAlvo(dataDeAmanhaIso())}
              >
                voltar para amanhã
              </button>
            )}
          </div>
        )}
      </div>

      {/* MONTAR FALANDO (ago/2026, pedido do dono do negócio). Vem antes
          das sanfonas porque é o caminho mais curto para montar a lista
          inteira: uma frase com todos os itens e quantidades. As
          sanfonas continuam abaixo para ajustar item a item. */}
      <AssistenteDeVoz
        produtos={produtos}
        modo="pedir"
        acao="adicionar"
        rotuloFalar="Monte a lista falando"
        autoIncluirQuandoCompleto
        onConfirmar={async (ditados) => adicionarPorVoz(ditados)}
      />

      {/* O QUE NÃO VEM (ago/2026). Item cortado pela matriz sai de
          `itens` e, sem este bloco, sumiria da tela sem deixar rastro —
          a loja não teria como saber que aquilo que ela pediu não virá.
          Fica no topo, antes das sessões, porque é a informação que muda
          a decisão de hoje: dá tempo de procurar alternativa. */}
      {cortados.length > 0 && (
        <div className="aviso-corte">
          <strong>Não vem amanhã:</strong>
          {cortados.map((corte) => (
            <span key={corte.codigoPdv} className="item-cortado">
              {nomeDoProduto(corte.codigoPdv)} <em>(você pediu {corte.pedido} un)</em>
            </span>
          ))}
        </div>
      )}

      {CATEGORIAS_PRODUCAO.map((categoria) => {
        const lista = produtosDaCategoria(categoria.chave);
        const codigos = new Set(lista.map((p) => p.codigoPdv));
        const itensDaCategoria = itens.filter((i) => codigos.has(i.codigoPdv));
        const aberto = !!expandido[categoria.chave];

        return (
          <div key={categoria.chave} className={`acordeao-sessao ${aberto ? "aberta" : ""}`}>
            <div className="cabecalho-sessao">
              <button
                type="button"
                className="abrir-sessao"
                aria-expanded={aberto}
                onClick={() => setExpandido((a) => ({ ...a, [categoria.chave]: !a[categoria.chave] }))}
              >
                <span className="nome-sessao">{rotuloDaCategoria(categoria.chave)}</span>
                <span className="contagem-itens">
                  {itensDaCategoria.length > 0
                    ? `${itensDaCategoria.length} ${itensDaCategoria.length === 1 ? "item" : "itens"}`
                    : ""}
                </span>
                <IconeSeta className="seta-sessao" />
              </button>

              {itensDaCategoria.length > 0 &&
                (sessaoAConfirmarLimpeza === categoria.chave ? (
                  <span className="confirmar-limpeza">
                    <button type="button" className="perigo" onClick={() => limparCategoria(categoria.chave)}>
                      Apagar {itensDaCategoria.length}?
                    </button>
                    <button type="button" className="link" onClick={() => setSessaoAConfirmarLimpeza(null)}>
                      não
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="botao-limpar-sessao"
                    title={`Limpar ${categoria.rotulo}`}
                    aria-label={`Limpar os itens de ${categoria.rotulo}`}
                    onClick={() => setSessaoAConfirmarLimpeza(categoria.chave)}
                  >
                    <IconeLixeira tamanho={17} />
                  </button>
                ))}
            </div>

            {aberto && (
              <div className="corpo-sessao">
                {/* A mesma ferramenta que a matriz tem no Cronograma, com o
                    histórico DESTA loja por trás. */}
                <div className="linha-sugestao-ia">
                  <button
                    type="button"
                    className="secundario"
                    disabled={statusSugestao[categoria.chave] === "carregando"}
                    onClick={() => gerarSugestaoIA(categoria.chave)}
                  >
                    {statusSugestao[categoria.chave] === "carregando"
                      ? "Gerando sugestão..."
                      : "✨ Sugerir quantidades com IA"}
                  </button>
                </div>
                {mensagemSugestao[categoria.chave] && (
                  <p
                    className={
                      statusSugestao[categoria.chave] === "erro" ? "erro-conversao" : "nota-rodape"
                    }
                  >
                    {mensagemSugestao[categoria.chave]}
                  </p>
                )}

                {lista.length === 0 && (
                  <p className="nota-rodape">Nenhum produto ativo nesta categoria ainda.</p>
                )}
                {lista.map((produto) => {
                  const itemSalvo = itens.find((i) => i.codigoPdv === produto.codigoPdv);
                  const editando = produtoAtivo === produto.codigoPdv;
                  return (
                    <div key={produto.codigoPdv} className="linha-produto-cronograma">
                      <button
                        type="button"
                        className={`item-produto ${itemSalvo ? "confirmado" : ""}`}
                        onClick={() => abrirEdicao(produto.codigoPdv)}
                      >
                        <span>{produto.nome}</span>
                        {itemSalvo && (
                          <span className="valor-confirmado">{itemSalvo.quantidadeUnidades} un ✓</span>
                        )}
                      </button>

                      {ajustes.has(produto.codigoPdv) && (
                        <span className="marca-ajuste">
                          ajustado pela matriz · você pediu {ajustes.get(produto.codigoPdv)} un
                        </span>
                      )}

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
                            onClick={() => confirmarQuantidade(produto.codigoPdv)}
                          >
                            Confirmar
                          </button>
                        </div>
                      )}

                      {itemSalvo && !editando && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => removerItem(produto.codigoPdv)}
                        >
                          remover
                        </button>
                      )}
                    </div>
                  );
                })}

                {cadastrandoEm === categoria.chave ? (
                  <div className="cadastro-relampago">
                    <label>
                      Nome do produto novo em {rotuloDaCategoria(categoria.chave)}
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
                        onClick={() => void cadastrarProduto(categoria.chave)}
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
                      setCadastrandoEm(categoria.chave);
                      setNomeNovoProduto("");
                    }}
                  >
                    + cadastrar produto novo em {rotuloDaCategoria(categoria.chave)}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {itens.length > 0 && (
        <div className="resumo-pedido">
          <h3>Resumo do pedido</h3>
          <div className="tabela-scroll">
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.codigoPdv}>
                    <td>{nomeDoProduto(i.codigoPdv)}</td>
                    <td>{i.quantidadeUnidades} un</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="total-linha">
            <strong>{itens.length}</strong> itens · <strong>{totalUnidades}</strong> unidades
          </p>
        </div>
      )}

      {/* A frase sobre a impressora saiu (ago/2026): a lista não vai mais
          sozinha para o caixa da matriz — quem imprime é a matriz, depois
          de confirmar o cronograma. Prometer um papel que não sai é pior
          que não prometer nada. */}
      <p className="nota-rodape">
        Enviando como {operador}, pela {loja.nome}.
      </p>

      {/* ENVIAR PERTO DO POLEGAR (set/2026, pedido do dono do negócio: "a
          página deve ser rolada até o final para que o usuário possa
          clicar e enviar a lista" — com a lista ditada por voz crescendo
          por conta própria (auto-incluir, acima), rolar até o fim para
          mandar era o passo que sobrava manual numa tela pensada para
          não precisar de toque nenhum). Some da tela quando não há nada
          para enviar, para não ocupar a zona do polegar à toa. */}
      {itens.length > 0 && (
        <div className="acao-fixa-secundaria">
          <button
            type="button"
            className="primario"
            disabled={enviando}
            onClick={enviar}
          >
            {/* "Atualizar", e não "Enviar pedido atualizado" (ago/2026): a
                frase longa fazia o botão quebrar em duas linhas no celular
                e ainda repetia "pedido", que é o assunto da tela inteira.
                Uma palavra diz o que o toque faz. */}
            {enviando ? "Enviando..." : jaEnviado ? "Atualizar" : "Enviar pedido"}
          </button>
        </div>
      )}
    </div>
  );
}
