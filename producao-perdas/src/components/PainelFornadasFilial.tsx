/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * A aba REPOSIÇÃO da filial (reescrita em ago/2026, a pedido do dono do
 * negócio, para deixar o app "o mais resumido possível" na implantação).
 *
 * O QUE MUDOU, E POR QUÊ
 * -----------------------
 * 1. PEDIR VIROU MONTAR UMA LISTA, e não disparar um pedido por item.
 *    Antes, cada produto falado virava um documento na nuvem na hora:
 *    cinco itens, cinco pedidos, cinco avisos para a matriz. Pior, o item
 *    saía da tela assim que era enviado — e "sumiu" é indistinguível de
 *    "o app apagou o que eu pedi", que foi o defeito relatado.
 *
 *    Agora a fala MONTA. A lista fica na tela, aceita mais itens (falando
 *    de novo ou pela busca), só é descartada por um botão explícito
 *    ("Limpar pedido") e só vira pedido quando a pessoa clica em "Enviar
 *    pedido" — um documento, um aviso.
 *
 * 2. A LISTA DE AVISOS DE FORNADA SAIU, e no lugar dela ficaram duas
 *    sanfonas que respondem à pergunta que a loja realmente faz:
 *    PEDIDOS SEM RESPOSTA (de quem ainda estou esperando) e PEDIDOS
 *    CONCLUÍDOS (o que já foi decidido hoje). O aviso de fornada continua
 *    chegando por push; o que saiu foi a lista que ele alimentava.
 *
 * 3. A BUSCA É A SEGUNDA OPÇÃO, logo abaixo do microfone. Falar é o
 *    caminho curto; digitar é o caminho para um item só, ou para quando o
 *    reconhecimento não ajuda.
 */

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { LinhaDeReposicao, PedidoFilial } from "../types/pedido";
import { idDaReposicao, linhasDeReposicaoDoDia, semRespostaDaMatriz } from "../types/pedido";
import type { Loja } from "../lib/lojas";
import { dataDeHojeIso } from "../lib/data";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { contemBusca } from "../lib/texto";
import { IconeConfere, IconeLixeira, IconeSeta } from "./Icones";
import { TesteDeAvisos } from "./TesteDeAvisos";
import { CampoDeBusca } from "./CampoDeBusca";
import { AssistenteDeVoz } from "./AssistenteDeVoz";
import {
  apagarRascunhoReposicao,
  gravarRascunhoReposicao,
  lerRascunhoReposicao,
  limparRascunhosDeReposicaoAntigos,
} from "../lib/rascunhoReposicao";

/** Quantos resultados a busca mostra — ver PainelFornoDeHoje.tsx. */
const MAXIMO_RESULTADOS = 12;

interface PainelFornadasFilialProps {
  loja: Loja;
  produtos: Produto[];
  pedidos: PedidoFilial[];
  operador: string;
  /**
   * Produtos que a MATRIZ tirou da vitrine de hoje. Acabou o produto — a
   * loja precisa parar de oferecer no mesmo instante, e não continuar
   * pedindo mercadoria que não existe mais.
   */
  encerrados: Set<number>;
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
}

export function PainelFornadasFilial({
  loja,
  produtos,
  pedidos,
  operador,
  encerrados,
  onSalvarPedido,
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [busca, setBusca] = useState("");
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [aberta, setAberta] = useState<Record<string, boolean>>({ semResposta: true });

  /**
   * A lista em montagem sobrevive a trocar de aba e a fechar o app.
   *
   * Sem isso ela viveria só na memória do componente, e sair da aba
   * apagaria o que a pessoa acabou de ditar — que é exatamente a queixa
   * que este painel existe para não repetir. Ver
   * src/lib/rascunhoReposicao.ts.
   */
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

  /** O que já saiu desta loja hoje, separado pelo que a matriz respondeu. */
  const linhas = useMemo(
    () => linhasDeReposicaoDoDia(pedidos, hoje, loja.id),
    [pedidos, hoje, loja.id]
  );
  const semResposta = useMemo(() => linhas.filter(semRespostaDaMatriz), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !semRespostaDaMatriz(l)), [linhas]);

  /**
   * Busca no catálogo inteiro. Só produtos ATIVOS e não encerrados hoje:
   * pedir item pausado no cadastro seria pedir coisa que a padaria
   * decidiu não fazer, e a resposta seria sempre a mesma recusa.
   */
  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && !encerrados.has(p.codigoPdv) && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca, encerrados]);

  /**
   * Acrescenta à lista em montagem.
   *
   * O mesmo produto dito duas vezes SOMA, em vez de virar duas linhas:
   * quem falou "10 pão francês" e depois "mais 5 pão francês" está
   * pedindo 15. A quantidade continua editável na própria linha, então a
   * soma nunca é uma decisão irreversível.
   */
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

  /**
   * ENVIAR É O ÚNICO MOMENTO EM QUE A MATRIZ FICA SABENDO. Um documento
   * com a lista inteira, e por consequência um aviso só — e não um por
   * item, que era o que enchia o celular da matriz.
   */
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
      // Enviado, a lista da tela cumpriu a função: o que vale agora é o
      // documento, e ele aparece logo abaixo em "Pedidos sem resposta".
      setItens([]);
      setBusca("");
      setCodigoPedindo(null);
      setAberta((a) => ({ ...a, semResposta: true }));
    } finally {
      setEnviando(false);
    }
  }

  const totalUnidades = itens.reduce((soma, i) => soma + i.quantidadeUnidades, 0);
  const faltaQuantidade = itens.some((i) => i.quantidadeUnidades <= 0);

  /** Uma sanfona de histórico, igual nas duas listas. */
  function sanfona(chave: string, titulo: string, linhasDaLista: LinhaDeReposicao[]) {
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
              {linhasDaLista.length > 0
                ? `${linhasDaLista.length} ${linhasDaLista.length === 1 ? "item" : "itens"}`
                : ""}
            </span>
            <IconeSeta className="seta-sessao" />
          </button>
        </div>

        {abertaAgora && (
          <div className="corpo-sessao">
            {linhasDaLista.length === 0 ? (
              <p className="nota-rodape">Nada aqui hoje.</p>
            ) : (
              linhasDaLista.map((linha, indice) => (
                <div key={`${linha.pedidoId}-${linha.codigoPdv}-${indice}`} className="linha-reposicao">
                  <span className="nome-reposicao">
                    {nomeDoProduto(linha.codigoPdv)}
                    {linha.situacao === "confirmado" && (
                      <span className="reposicao-confirmada">
                        <IconeConfere tamanho={14} /> Separado — vem na próxima entrega.
                      </span>
                    )}
                    {linha.situacao === "cancelado" && (
                      <span className="reposicao-negada">Não vem: {linha.motivo}</span>
                    )}
                    {linha.situacao === "pendente" && (
                      <span className="reposicao-aguardando">Aguardando a matriz responder</span>
                    )}
                  </span>
                  <span className="qtd-reposicao">{linha.unidades} un</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="painel-fornadas">
      <div className="corpo-fornadas">
        {/* FALAR VEM PRIMEIRO: pedir é o que traz a filial a esta aba, e
            dizer a lista inteira de uma vez é o caminho mais curto. */}
        <AssistenteDeVoz
          produtos={produtos}
          modo="pedir"
          acao="adicionar"
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

        {/* A BUSCA É A SEGUNDA OPÇÃO, logo abaixo do microfone. */}
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

        {/* A LISTA EM MONTAGEM. Só sai da tela por "Limpar pedido" ou
            depois de enviada — decisão explícita do dono do negócio. */}
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

        {sanfona("semResposta", "Pedidos sem resposta", semResposta)}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

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
