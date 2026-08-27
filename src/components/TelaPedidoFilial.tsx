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
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { PedidoFilial } from "../types/pedido";
import { ehPedidoDiario, idDoPedido } from "../types/pedido";
import { AtivarAvisos } from "./AtivarAvisos";
import type { Loja } from "../lib/lojas";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria } from "../lib/categorias";
import { dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { proximaDataAlvo } from "../lib/dataAlvoDoDia";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { IconeCalendario, IconeConfere, IconeLixeira, IconeSeta } from "./Icones";

interface TelaPedidoFilialProps {
  loja: Loja;
  produtos: Produto[];
  pedidos: PedidoFilial[];
  operador: string;
  /** Data de hoje, viva — ver src/lib/useDiaCorrente.ts. */
  hoje: string;
  /** Fornadas prontas hoje na matriz — base do pedido de reposição. */
  onSalvarPedido: (pedido: PedidoFilial) => Promise<void>;
}

export function TelaPedidoFilial({
  loja,
  produtos,
  pedidos,
  operador,
  hoje,
  onSalvarPedido,
}: TelaPedidoFilialProps) {
  const [dataAlvo, setDataAlvo] = useState(dataDeAmanhaIso());
  const [mostrarSeletorData, setMostrarSeletorData] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [sessaoAConfirmarLimpeza, setSessaoAConfirmarLimpeza] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const pedidoExistente = useMemo(
    // Só o pedido DIÁRIO: a reposição é outra lista, com outra urgência,
    // e não pode ser confundida com o planejamento de amanhã.
    () => pedidos.find((p) => p.data === dataAlvo && p.lojaId === loja.id && ehPedidoDiario(p)),
    [pedidos, dataAlvo, loja.id]
  );

  const [itens, setItens] = useState<ItemPlanoProducao[]>(() => pedidoExistente?.itens ?? []);
  const [dataCarregada, setDataCarregada] = useState(dataAlvo);

  // Ao trocar de data, recarrega os itens do pedido daquele dia.
  if (dataCarregada !== dataAlvo) {
    setDataCarregada(dataAlvo);
    setItens(pedidoExistente?.itens ?? []);
    setProdutoAtivo(null);
    setSessaoAConfirmarLimpeza(null);
  }

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

  function removerItem(codigoPdv: number) {
    setItens((atual) => atual.filter((i) => i.codigoPdv !== codigoPdv));
  }

  function limparCategoria(chave: string) {
    const codigos = new Set(produtosDaCategoria(chave).map((p) => p.codigoPdv));
    setItens((atual) => atual.filter((i) => !codigos.has(i.codigoPdv)));
    setSessaoAConfirmarLimpeza(null);
    setExpandido((a) => ({ ...a, [chave]: false }));
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
    <div className="tela">
      <AtivarAvisos loja={loja} operador={operador} />

      {/*
        O estado do pedido mora DENTRO do bloco do título, e não num cartão
        próprio embaixo (ago/2026). Solto, ele virava um segundo balão
        competindo com a data por atenção e empurrando a lista para baixo;
        colado ao título, "Pedido para quinta, 27/08" e "enviado" se leem
        como uma frase só — que é como a informação existe na cabeça de
        quem opera.
      */}
      <div className={`destaque-data bloco-pedido ${jaEnviado ? "enviado" : ""}`}>
        <IconeCalendario tamanho={20} />
        <div className="texto-bloco-pedido">
          <span>
            Pedido para {rotuloDoDia(diaDaSemana)}, {formatarDataBr(dataAlvo)}
          </span>
          <span className="estado-pedido">
            {jaEnviado ? (
              <>
                <IconeConfere tamanho={14} /> enviado · {pedidoExistente?.itens.length ?? 0} produtos
              </>
            ) : (
              "não enviado — a quantidade ainda não entra na produção"
            )}
          </span>
        </div>
      </div>

      <button type="button" className="link" onClick={() => setMostrarSeletorData((v) => !v)}>
        {mostrarSeletorData ? "usar amanhã (padrão)" : "pedir para outra data"}
      </button>
      {mostrarSeletorData && (
        <input type="date" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
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

      <button
        type="button"
        className="primario largura-cheia"
        disabled={enviando || itens.length === 0}
        onClick={enviar}
      >
        {/* "Atualizar", e não "Enviar pedido atualizado" (ago/2026): a
            frase longa fazia o botão quebrar em duas linhas no celular e
            ainda repetia "pedido", que é o assunto da tela inteira. Uma
            palavra diz o que o toque faz. */}
        {enviando ? "Enviando..." : jaEnviado ? "Atualizar" : "Enviar pedido"}
      </button>
      <p className="nota-rodape">
        Enviando como {operador}, pela {loja.nome}. Ao enviar, a lista também sai na impressora do
        caixa da matriz.
      </p>
    </div>
  );
}
