/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * O que já saiu do forno na matriz HOJE, visto da filial, com pedido de
 * reposição embutido (ago/2026).
 *
 * É o objetivo que o dono do negócio descreveu: a filial fica sabendo que
 * o produto ficou pronto AGORA e, se está sem ele no balcão, pede
 * enquanto ainda dá tempo de entregar hoje. A conferência do fim do
 * expediente chega tarde demais para isso.
 *
 * A reposição é separada do pedido diário de propósito — misturar as duas
 * esconderia a urgência. A matriz precisa ver que uma loja está pedindo
 * AGORA, não descobrir junto com o planejamento do dia seguinte.
 *
 * Lista ordenada pela fornada mais RECENTE primeiro: o que acabou de sair
 * é o que ainda está quente e o que a filial tem chance de receber hoje.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { FornadaPronta } from "../types/fornada";
import { fornadasDoProduto, horaDaUltimaFornada } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { desfechoDaReposicao, ehReposicao, idDaReposicao } from "../types/pedido";
import type { Loja } from "../lib/lojas";
import { dataDeHojeIso } from "../lib/data";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { contemBusca } from "../lib/texto";
import { IconeChama, IconeConfere, IconeLixeira } from "./Icones";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import {
  dispensarFornada,
  fornadasDispensadas,
  restaurarFornadas,
} from "../lib/fornadasDispensadas";

/** Quantos resultados a busca mostra — ver PainelFornoDeHoje.tsx. */
const MAXIMO_RESULTADOS = 12;

interface PainelFornadasFilialProps {
  loja: Loja;
  produtos: Produto[];
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  operador: string;
  /**
   * Produtos que a MATRIZ tirou da vitrine de hoje (ago/2026).
   *
   * Diferente do "excluir aviso" logo abaixo, que é arrumação da própria
   * tela: isto é DISPONIBILIDADE, decidida por quem produz e gravada na
   * nuvem. Acabou o produto, ou o anúncio foi sem querer — a loja precisa
   * parar de oferecer no mesmo instante, e não continuar pedindo
   * mercadoria que não existe mais.
   */
  encerrados: Set<number>;
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
}

export function PainelFornadasFilial({
  loja,
  produtos,
  fornadas,
  pedidos,
  operador,
  encerrados,
  onSalvarPedido,
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");
  /**
   * Avisos que esta loja já resolveu e tirou da lista. Some da tela, não
   * do banco — ver src/lib/fornadasDispensadas.ts.
   */
  const [dispensadas, setDispensadas] = useState(() => fornadasDispensadas(loja.id, hoje));

  /** Produtos com fornada hoje, o mais recente primeiro, sem os dispensados. */
  const prontosHoje = useMemo(() => {
    const codigos = [
      ...new Set(
        fornadas
          .filter(
            (f) =>
              f.data === hoje &&
              // Encerrado pela matriz: sumiu da vitrine para todo mundo.
              !encerrados.has(f.codigoPdv) &&
              // Dispensado por esta loja: sumiu só desta tela.
              !dispensadas.has(f.codigoPdv)
          )
          .map((f) => f.codigoPdv)
      ),
    ];
    return codigos
      .map((codigo) => ({
        produto: produtos.find((p) => p.codigoPdv === codigo),
        doDia: fornadasDoProduto(fornadas, hoje, codigo),
      }))
      .filter((item): item is { produto: Produto; doDia: FornadaPronta[] } => Boolean(item.produto))
      .sort((a, b) => b.doDia[0].marcadaEm.localeCompare(a.doDia[0].marcadaEm));
  }, [fornadas, produtos, hoje, dispensadas, encerrados]);

  /**
   * O que esta loja já pediu hoje E o que a matriz respondeu.
   *
   * A resposta fica na mesma linha do produto de propósito: quem está sem
   * o item no balcão precisa saber, olhando uma vez só, se adianta
   * esperar. Uma reposição cancelada num canto separado da tela seria
   * descoberta tarde demais para a loja fazer outra coisa.
   *
   * Cancelamento manda no resumo: se a filial pediu duas vezes e a
   * segunda foi recusada, é a recusa que muda o que ela faz agora.
   */
  const jaPedidoHoje = useMemo(() => {
    const mapa = new Map<
      number,
      { unidades: number; cancelado?: string; confirmado: boolean }
    >();
    for (const pedido of pedidos) {
      if (pedido.data !== hoje || pedido.lojaId !== loja.id || !ehReposicao(pedido)) continue;
      const desfecho = desfechoDaReposicao(pedido);
      for (const item of pedido.itens) {
        const atual = mapa.get(item.codigoPdv) ?? { unidades: 0, confirmado: false };
        mapa.set(item.codigoPdv, {
          unidades: atual.unidades + item.quantidadeUnidades,
          cancelado: desfecho === "cancelado" ? pedido.atendimento?.motivo || "sem motivo informado" : atual.cancelado,
          confirmado: atual.confirmado || desfecho === "confirmado",
        });
      }
    }
    return mapa;
  }, [pedidos, hoje, loja.id]);

  /**
   * Busca no catálogo INTEIRO (ago/2026, pedido do dono do negócio).
   *
   * A lista de cima só mostra o que já saiu do forno hoje. Mas a loja
   * fica sem coisa que ainda não foi assada — e, até agora, para isso ela
   * só tinha o pedido de amanhã, que chega tarde demais quando o produto
   * está faltando no balcão AGORA. Aqui ela digita o nome, informa a
   * quantidade e manda: a matriz decide se dá tempo de produzir e
   * responde, com motivo quando não dá.
   *
   * Só produtos ATIVOS na produção: pedir item pausado no cadastro seria
   * pedir coisa que a padaria decidiu não fazer, e a resposta seria
   * sempre a mesma recusa.
   */
  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca]);

  async function enviarReposicao(codigoPdv: number) {
    if (!ehNumeroValidoPositivo(quantidade)) return;
    setEnviando(true);
    const agora = new Date().toISOString();
    try {
      await onSalvarPedido({
        id: idDaReposicao(hoje, loja.id, agora),
        lojaId: loja.id,
        data: hoje,
        itens: [{ codigoPdv, quantidadeUnidades: paraNumero(quantidade) }],
        status: "enviado",
        tipo: "reposicao",
        criadoPor: operador,
        criadoEm: agora,
        enviadoEm: agora,
      });
      setCodigoPedindo(null);
      setQuantidade("");
      // A busca também sai: pedido mandado, o termo digitado não serve
      // mais para nada e a lista do forno volta a ser o que a filial vê.
      setBusca("");
    } catch {
      // Mensagem vem do aviso global (ver App.tsx).
    } finally {
      setEnviando(false);
    }
  }

  /**
   * A linha de um produto, igual na lista do forno e na busca.
   *
   * Um jeito só de pedir: a filial que aprendeu a pedir o que saiu do
   * forno já sabe pedir o que não saiu. `doDia` vazio é o caso da busca —
   * o produto ainda não foi assado hoje, e a linha diz isso em vez de
   * fingir uma hora que não existe.
   */
  function linhaDoProduto(produto: Produto, doDia: FornadaPronta[], mostrarExcluir = false) {
    const pedindo = codigoPedindo === produto.codigoPdv;
    const meuPedido = jaPedidoHoje.get(produto.codigoPdv);
    const jaPedi = meuPedido?.unidades ?? 0;
    const saiu = doDia.length > 0;

    return (
      <div key={produto.codigoPdv} className="linha-fornada">
        <div className="info-fornada">
          <strong>{produto.nome}</strong>
          <span className="status-filial">
            {saiu ? (
              <>
                {doDia.length > 1 ? `${doDia.length} fornadas · ` : ""}última às{" "}
                {horaDaUltimaFornada(fornadas, hoje, produto.codigoPdv)}
              </>
            ) : (
              "ainda não saiu do forno hoje"
            )}
            {jaPedi > 0 && (
              <>
                {" · "}
                <span className="ja-pedido">
                  <IconeConfere tamanho={13} /> já pedi {jaPedi} un
                </span>
              </>
            )}
          </span>

          {/* A RESPOSTA POSITIVA GANHOU LINHA PRÓPRIA (ago/2026).
              Antes, "não vem" tinha um bloco destacado e o "sim" eram três
              palavras cinzas coladas no fim de outra frase. A assimetria
              não era só estética: quem pediu está sem o produto no balcão
              e precisa saber, de relance, se pode parar de procurar
              alternativa. Só o "não" respondia isso. */}
          {meuPedido?.confirmado && (
            <span className="reposicao-confirmada">
              <IconeConfere tamanho={14} /> Separado — vem na próxima entrega.
            </span>
          )}
          {meuPedido?.cancelado && (
            <span className="reposicao-negada">Não vem: {meuPedido.cancelado}</span>
          )}
        </div>

        {pedindo ? (
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
              disabled={enviando || !ehNumeroValidoPositivo(quantidade)}
              onClick={() => enviarReposicao(produto.codigoPdv)}
            >
              {enviando ? "..." : "Pedir"}
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
          /* DOIS BOTÕES DO MESMO TAMANHO, SEPARADOS PELA COR (ago/2026,
              pedido do dono do negócio).

              "Pedir" era um botão e "excluir aviso" era um link
              sublinhado: tamanhos, pesos e alvos diferentes para duas
              decisões que estão lado a lado e valem o mesmo peso — quero
              este produto, ou tire este aviso da minha frente. O link
              ainda era um alvo pequeno para um dedo com farinha.

              Agora têm a mesma forma e se distinguem pela cor, que é o
              que se lê antes do texto: verde é o caminho de seguir
              adiante, vermelho é o de tirar. O ícone de lixeira repete a
              mensagem — é o mesmo símbolo que a matriz usa para a mesma
              ação na tela dela. */
          <div className="acoes-fornada">
            <button
              type="button"
              className="botao-fornada pedir"
              onClick={() => {
                setCodigoPedindo(produto.codigoPdv);
                setQuantidade("");
              }}
            >
              Pedir
            </button>
            {/* Excluir o AVISO, não a fornada: ela continua registrada na
                nuvem e no relatório do forno. O que some é esta linha,
                nesta loja, neste aparelho, hoje — para o que ainda precisa
                de decisão não ficar enterrado no meio do que já foi
                resolvido. Não aparece na busca: lá o item nem estava na
                lista para ser tirado dela. */}
            {mostrarExcluir && (
              <button
                type="button"
                className="botao-fornada excluir"
                title="Tirar este aviso da lista"
                aria-label={`Tirar o aviso de ${produto.nome} da lista`}
                onClick={() => setDispensadas(dispensarFornada(loja.id, hoje, produto.codigoPdv))}
              >
                <IconeLixeira tamanho={15} />
                Excluir
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const buscando = busca.trim().length > 0;

  /** Nomes que a IA pode escolher ao interpretar o que foi ditado. */
  const nomesAtivos = useMemo(
    () => produtos.filter((p) => p.ativoNaProducao).map((p) => p.nome),
    [produtos]
  );

  return (
    <div className="painel-fornadas">
      {/* Sem título aqui dentro: a aba já se chama "Reposição", e repetir o
          nome logo abaixo dela é a definição de ruído. */}
      <div className="corpo-fornadas">
        {/* A busca vem ANTES da lista: quem chegou aqui pelo aviso já vê
            o item no topo da lista; quem veio porque falta alguma coisa
            no balcão vem justamente digitar o nome dela. */}
        <CampoDeBusca
          className="busca-forno"
          valor={busca}
          onMudar={(v) => {
            setBusca(v);
            setCodigoPedindo(null);
          }}
          placeholder="Buscar produto para pedir..."
          rotulo="Buscar produto no catálogo para pedir à matriz"
          nomesParaVoz={nomesAtivos}
        >
          {buscando && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setBusca("");
                setCodigoPedindo(null);
              }}
            >
              limpar
            </button>
          )}
        </CampoDeBusca>

        {buscando ? (
          <>
            {resultados.length === 0 ? (
              <p className="nota-rodape">Nenhum produto ativo com esse nome.</p>
            ) : (
              resultados.map((produto) =>
                linhaDoProduto(produto, fornadasDoProduto(fornadas, hoje, produto.codigoPdv))
              )
            )}
          </>
        ) : prontosHoje.length === 0 ? (
          <p className="aviso-forno-vazio">
            <IconeChama tamanho={20} />
            <span>
              {dispensadas.size > 0
                ? "Avisos resolvidos. Precisa de algo? Use a busca acima."
                : "Nada saiu do forno ainda. Precisa de algo? Use a busca acima."}
            </span>
          </p>
        ) : (
          <>
            {prontosHoje.map(({ produto, doDia }) => linhaDoProduto(produto, doDia, true))}
          </>
        )}

        {/* Vale com a lista cheia E vazia: quem escondeu tudo por engano
            precisa do caminho de volta, e é justamente na tela vazia que
            ele some se ficar dentro da lista. */}
        {!buscando && dispensadas.size > 0 && (
          <button
            type="button"
            className="pastilha-escondidos"
            aria-label={`Mostrar de novo ${dispensadas.size} aviso(s) escondido(s)`}
            onClick={() => setDispensadas(restaurarFornadas(loja.id, hoje))}
          >
            <IconeLixeira tamanho={15} />
            {dispensadas.size}
            <span className="acao-pastilha">mostrar</span>
          </button>
        )}

      {/* Diagnóstico da direção filial -> matriz: dispara um aviso de
          teste sem criar pedido nenhum. Existe porque "a matriz não
          recebeu meu pedido" tem três causas diferentes — aparelho não
          registrado, FCM recusou, ou chegou e o celular não tocou — e as
          três se parecem com "não chegou nada". */}
      <TesteDeAvisos destino="matriz" />
      </div>
    </div>
  );
}
