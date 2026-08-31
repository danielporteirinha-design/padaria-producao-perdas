/**
 * src/components/PainelFornoDeHoje.tsx
 * ---------------------------------------------------------------
 * Marcação de fornada pronta, ao longo do expediente.
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

const MAXIMO_RESULTADOS = 12;

interface PainelFornoDeHojeProps {
  produtos: Produto[];
  fornadas: FornadaPronta[];
  pedidos: PedidoFilial[];
  dataHoje: string;
  encerrados: Set<number>;
  onEncerrarAnuncio: (codigoPdv: number) => Promise<void>;
  onReabrirTudo: () => Promise<void>;
  onMarcarFornada: (
    codigoPdv: number,
    nomeConhecido?: string,
    quantidade?: number
  ) => Promise<void>;
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
  const [cadastrando, setCadastrando] = useState(false);
  const [categoriaNova, setCategoriaNova] = useState("");
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const [aberta, setAberta] = useState<Record<string, boolean>>({});
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
    () => montarLinhasDaMatriz({ fornadas, pedidos, hoje: dataHoje, encerrados }),
    [fornadas, pedidos, dataHoje, encerrados]
  );
  const semResposta = useMemo(() => linhas.filter(anuncioPendente), [linhas]);
  const concluidos = useMemo(() => linhas.filter((l) => !anuncioPendente(l)), [linhas]);

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
      if (!novo) return;
      await onMarcarFornada(novo.codigoPdv, novo.nome);
      setCadastrando(false);
      setCategoriaNova("");
    } catch {
    } finally {
      setSalvandoNovo(false);
    }
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

  function linhaAnunciada(linha: LinhaDaMatriz) {
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

          <span className="acoes-fornada">
            {linha.situacao === "encerrado" ? (
              <button
                type="button"
                className="botao-fornada pedir"
                onClick={() => void onReabrirTudo()}
              >
                Anunciar novamente
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
        <AssistenteDeVoz
          produtos={produtos}
          modo="anunciar"
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

        {sanfona("semResposta", "Pedidos sem resposta", semResposta)}
        {sanfona("concluidos", "Pedidos concluídos", concluidos)}

        <TesteDeAvisos destino="filiais" />
      </div>
    </div>
  );
}