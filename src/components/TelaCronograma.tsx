/**
 * src/components/TelaCronograma.tsx
 * ---------------------------------------------------------------
 * Fluxo: as 5 categorias fixas de produção, exibidas
 * recolhidas (acordeão) -> tocar num produto abre uma textbox de
 * quantidade (sempre em UNIDADES, protegida contra erro de digitação) ->
 * Confirmar adiciona à lista -> Resumo (conferência final) -> Confirmar
 * produção salva o plano -> Exportar/Imprimir (uma única fita com todas
 * as sessões, separadas por linha de corte, pronta para WhatsApp/impressora
 * térmica).
 *
 * Sempre monta a produção do DIA SEGUINTE (decisão operacional: o
 * cronograma é fechado no fim do expediente do dia anterior).
 *
 * Cada categoria fixa tem um botão "Sugerir com IA" (Gemini, via
 * src/lib/sugestaoProducao.ts) que pré-preenche quantidades vazias com
 * base no histórico de produção/perda — sempre assistido, nunca
 * automático: o operador revisa e ajusta antes de confirmar.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao, PlanoDeProducaoDiario, SessaoProducao } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import { dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { gerarId } from "../lib/id";
import { CATEGORIAS_PRODUCAO, rotuloDaCategoria } from "../lib/categorias";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { buscarSugestaoProducao, montarHistoricoPorCategoria, ErroSugestaoProducao } from "../lib/sugestaoProducao";
import { ExportarFita } from "./ExportarFita";

interface TelaCronogramaProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  onSalvarPlano: (plano: PlanoDeProducaoDiario) => Promise<void>;
}

type Fase = "montar" | "resumo" | "exportar";
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

export function TelaCronograma({ produtos, planos, perdas, operador, onSalvarPlano }: TelaCronogramaProps) {
  const [dataAlvo, setDataAlvo] = useState(dataDeAmanhaIso());
  const [mostrarSeletorData, setMostrarSeletorData] = useState(false);

  const planoExistente = useMemo(() => planos.find((p) => p.data === dataAlvo), [planos, dataAlvo]);

  const [itensPorGrupo, setItensPorGrupo] = useState<Record<string, ItemPlanoProducao[]>>(() =>
    mapaInicial(planoExistente)
  );
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [fase, setFase] = useState<Fase>("montar");
  const [salvando, setSalvando] = useState(false);
  const [planoConfirmado, setPlanoConfirmado] = useState<PlanoDeProducaoDiario | null>(null);
  // Qual sessão está com a limpeza pendente de confirmação (só uma por vez).
  // Limpar é destrutivo e não tem desfazer, então exige dois toques.
  const [sessaoAConfirmarLimpeza, setSessaoAConfirmarLimpeza] = useState<string | null>(null);
  const [statusSugestao, setStatusSugestao] = useState<Record<string, StatusSugestao>>({});
  const [mensagemSugestao, setMensagemSugestao] = useState<Record<string, string>>({});

  const diaDaSemana = diaDaSemanaDeData(dataAlvo);
  const dataFormatada = `${rotuloDoDia(diaDaSemana)}, ${formatarDataBr(dataAlvo)}`;

  function trocarData(novaData: string) {
    setDataAlvo(novaData);
    setSessaoAConfirmarLimpeza(null);
    const plano = planos.find((p) => p.data === novaData);
    setItensPorGrupo(mapaInicial(plano));
    setFase("montar");
    setProdutoAtivo(null);
  }

  const totalItens = Object.values(itensPorGrupo).reduce((soma, itens) => soma + itens.length, 0);
  const totalUnidades = Object.values(itensPorGrupo)
    .flat()
    .reduce((soma, i) => soma + i.quantidadeUnidades, 0);

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
  }

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
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
    await onSalvarPlano(plano);
    setSalvando(false);
    setPlanoConfirmado(plano);
    setFase("exportar");
  }

  // ------------------------------------------------------------------
  // Fase: Exportar / Imprimir
  // ------------------------------------------------------------------
  if (fase === "exportar" && planoConfirmado) {
    return (
      <div className="tela">
        <h2>Lista pronta para impressão</h2>
        <p className="mensagem-sucesso">
          Produção de {dataFormatada} confirmada. A fita abaixo traz todas as sessões separadas por linha
          de corte — imprima, corte em cada tesourinha e fixe cada pedaço no quadro do respectivo setor.
        </p>
        <ExportarFita
          sessoes={planoConfirmado.sessoes}
          dataFormatada={dataFormatada}
          produtos={produtos}
          montadoPor={planoConfirmado.criadoPor}
          nomeArquivoBase={`producao-${dataAlvo}`}
        />
        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setFase("montar")}>
            Voltar ao Cronograma
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fase: Resumo
  // ------------------------------------------------------------------
  if (fase === "resumo") {
    return (
      <div className="tela">
        <h2>Resumo — última conferência</h2>
        <p className="subtitulo destaque-data">{dataFormatada}</p>

        {GRUPOS.filter((chave) => (itensPorGrupo[chave]?.length ?? 0) > 0).map((chave) => {
          const itens = itensPorGrupo[chave] ?? [];
          const subtotal = itens.reduce((s, i) => s + i.quantidadeUnidades, 0);
          return (
            <div key={chave}>
              <h3>{rotuloDaCategoria(chave)}</h3>
              <div className="tabela-scroll">
                <table className="tabela-simples">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.codigoPdv}>
                        <td>{nomeDoProduto(item.codigoPdv)}</td>
                        <td>{item.quantidadeUnidades} un</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="nota-rodape">Subtotal: {arred(subtotal)} un</p>
            </div>
          );
        })}

        <p className="total-linha">
          <strong>{totalItens}</strong> itens · <strong>{arred(totalUnidades)}</strong> unidades planejadas no total
        </p>

        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setFase("montar")}>
            Voltar e ajustar
          </button>
          <button type="button" className="primario" disabled={salvando} onClick={confirmarESalvar}>
            {salvando ? "Salvando..." : "Confirmar produção"}
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Fase: Montar (padrão)
  // ------------------------------------------------------------------
  return (
    <div className="tela">
      <h2>Cronograma de Produção</h2>
      <p className="subtitulo destaque-data">Produção de {dataFormatada}</p>

      {planoExistente && (
        <p className="callout-inline">
          Já existe um plano {planoExistente.status === "confirmado" ? "confirmado" : "salvo"} para esta data —
          os itens abaixo foram carregados dele. Salvar de novo atualiza a lista.
          {planoExistente.status === "confirmado" && (
            <>
              {" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setPlanoConfirmado(planoExistente);
                  setFase("exportar");
                }}
              >
                reimprimir esta lista sem mexer nela
              </button>
            </>
          )}
        </p>
      )}

      <button type="button" className="link" onClick={() => setMostrarSeletorData((v) => !v)}>
        {mostrarSeletorData ? "usar amanhã (padrão)" : "planejar para outra data"}
      </button>
      {mostrarSeletorData && (
        <input type="date" value={dataAlvo} onChange={(e) => trocarData(e.target.value)} />
      )}

      {GRUPOS.map((chave) => {
        const rotulo = rotuloDaCategoria(chave);
        const itensDoGrupo = itensPorGrupo[chave] ?? [];
        const aberto = !!expandido[chave];
        const listaProdutos = produtosDaCategoria(chave);
        const statusIA = statusSugestao[chave] ?? "";
        const mensagemIA = mensagemSugestao[chave] ?? "";

        return (
          <div key={chave} className="acordeao-sessao">
            <button
              type="button"
              className="cabecalho-sessao"
              aria-expanded={aberto}
              onClick={() => setExpandido((atual) => ({ ...atual, [chave]: !atual[chave] }))}
            >
              <span>{rotulo}</span>
              <span className="contagem-itens">
                {itensDoGrupo.length > 0 ? `${itensDoGrupo.length} itens` : ""} {aberto ? "▲" : "▼"}
              </span>
            </button>

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
                  {itensDoGrupo.length > 0 &&
                    (sessaoAConfirmarLimpeza === chave ? (
                      <span className="confirmar-limpeza">
                        <button type="button" className="perigo" onClick={() => limparSessao(chave)}>
                          Apagar {itensDoGrupo.length} {itensDoGrupo.length === 1 ? "item" : "itens"}?
                        </button>
                        <button
                          type="button"
                          className="link"
                          onClick={() => setSessaoAConfirmarLimpeza(null)}
                        >
                          cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="link"
                        onClick={() => setSessaoAConfirmarLimpeza(chave)}
                      >
                        limpar esta sessão
                      </button>
                    ))}
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
                        <button type="button" className="link" onClick={() => removerItem(chave, produto.codigoPdv)}>
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

      <div className="acoes">
        <button type="button" className="primario" disabled={totalItens === 0} onClick={() => setFase("resumo")}>
          Ir para o Resumo ({totalItens} itens)
        </button>
      </div>
    </div>
  );
}

function mapaInicial(plano: PlanoDeProducaoDiario | undefined): Record<string, ItemPlanoProducao[]> {
  if (!plano) return {};
  const mapa: Record<string, ItemPlanoProducao[]> = {};
  for (const sessao of plano.sessoes) {
    mapa[sessao.categoria] = sessao.itens;
  }
  return mapa;
}

function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}
