/**
 * src/components/PainelFornadasFilial.tsx
 * ---------------------------------------------------------------
 * A aba REPOSIÇÃO da filial (reescrita em ago/2026, com suporte a suprimentos).
 */

import { useEffect, useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao } from "../types/producao";
import type { FornadaPronta } from "../types/fornada";
import type { PedidoFilial } from "../types/pedido";
import { idDaReposicao } from "../types/pedido";
import type { PedidoSuprimentos, Suprimento } from "../types/suprimento";
import { desfechoDosSuprimentos } from "../types/suprimento";
import type { LinhaDoDia } from "../lib/reposicaoDoDia";
import { estaPendente, montarLinhasDoDia } from "../lib/reposicaoDoDia";
import { dispensarFornada, fornadasDispensadas } from "../lib/fornadasDispensadas";
import type { Loja } from "../lib/lojas";
import { dataDeHojeIso, horaDoInstante } from "../lib/data";
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

const MAXIMO_RESULTADOS = 12;

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
}: PainelFornadasFilialProps) {
  const hoje = dataDeHojeIso();
  const [busca, setBusca] = useState("");
  const [codigoPedindo, setCodigoPedindo] = useState<number | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [aberta, setAberta] = useState<Record<string, boolean>>({});

  const pedidoSuprimentosHoje = useMemo(
    () => pedidosSuprimentos.find((p) => p.data === hoje && p.lojaId === loja.id),
    [pedidosSuprimentos, hoje, loja.id]
  );
  const desfechoSup = desfechoDosSuprimentos(pedidoSuprimentosHoje);

  const nomePorSuprimentoId = useMemo(
    () => new Map(catalogoSuprimentos.map((s) => [s.id, s.nome])),
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
    () => montarLinhasDoDia({ fornadas, pedidos, hoje, lojaId: loja.id, encerrados, dispensadas }),
    [fornadas, pedidos, hoje, loja.id, encerrados, dispensadas]
  );
  const semResposta = useMemo(() => linhas.filter(estaPendente), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !estaPendente(l)), [linhas]);

  const resultados = useMemo(() => {
    const termo = busca.trim();
    if (termo.length === 0) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && !encerrados.has(p.codigoPdv) && contemBusca(p.nome, termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, MAXIMO_RESULTADOS);
  }, [produtos, busca, encerrados]);

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

  function sanfona(chave: string, titulo: string, linhasDaLista: LinhaDoDia[]) {
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
              linhasDaLista.map((linha) => linhaDoDia(linha))
            )}
          </div>
        )}
      </div>
    );
  }

  function linhaDoDia(linha: LinhaDoDia) {
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
          {linha.situacao === "dispensado" && (
            <span className="reposicao-aguardando">Aviso dispensado por esta loja.</span>
          )}

          {daMatriz && linha.situacao === "pendente" && (
            <span className="acoes-fornada">
              <button
                type="button"
                className="botao-fornada pedir"
                onClick={() => {
                  setCodigoPedindo(linha.codigoPdv);
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
              <button
                type="button"
                className="primario"
                disabled={!ehNumeroValidoPositivo(quantidade)}
                onClick={() => {
                  acrescentar([
                    { codigoPdv: linha.codigoPdv, quantidadeUnidades: paraNumero(quantidade) },
                  ]);
                  setCodigoPedindo(null);
                  setQuantidade("");
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
            </span>
          )}
        </span>

        {linha.unidades !== undefined && <span className="qtd-reposicao">{linha.unidades} un</span>}
      </div>
    );
  }

  return (
    <div className="painel-fornadas">
      <div className="corpo-fornadas">
        {pedidoSuprimentosHoje && pedidoSuprimentosHoje.status === "enviado" && (
          <div className={`cartao-status-suprimentos ${desfechoSup}`}>
            <strong className="titulo-montagem">Lista de Suprimentos enviada hoje</strong>
            <p className="nota-rodape">
              {pedidoSuprimentosHoje.itens
                .map((i) => `${nomePorSuprimentoId.get(i.suprimentoId) ?? i.suprimentoId} (${i.quantidade} un)`)
                .join(", ")}
            </p>
            {desfechoSup === "pendente" && (
              <span className="reposicao-aguardando">Aguardando a matriz responder a lista de suprimentos...</span>
            )}
            {desfechoSup === "confirmado" && (
              <span className="reposicao-confirmada">
                <IconeConfere tamanho={14} /> Suprimentos separados pela matriz!
              </span>
            )}
            {desfechoSup === "cancelado" && (
              <span className="reposicao-negada">
                Suprimentos não enviados: {pedidoSuprimentosHoje.atendimento?.motivo}
              </span>
            )}
          </div>
        )}

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

        <TesteDeAvisos destino="matriz" />
      </div>
    </div>
  );
}