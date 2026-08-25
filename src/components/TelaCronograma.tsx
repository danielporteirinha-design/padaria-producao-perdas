/**
 * src/components/TelaCronograma.tsx
 * ---------------------------------------------------------------
 * Fluxo: 5 categorias fixas + "Encomendas e Especiais", exibidas
 * recolhidas (acordeão) -> tocar num produto abre uma textbox de
 * quantidade (sempre em quilos, protegida contra erro de digitação) ->
 * Confirmar adiciona à lista -> Resumo (conferência final) -> Confirmar
 * produção salva o plano -> Exportar/Imprimir (uma imagem por sessão,
 * pronta para WhatsApp/impressora térmica).
 *
 * Sempre monta a produção do DIA SEGUINTE (decisão operacional: o
 * cronograma é fechado no fim do expediente do dia anterior).
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { ItemPlanoProducao, PlanoDeProducaoDiario, SessaoProducao } from "../types/producao";
import { dataDeAmanhaIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";
import { gerarId } from "../lib/id";
import { CATEGORIAS_PRODUCAO, CHAVE_ESPECIAL, ROTULO_ESPECIAL, rotuloDaCategoria } from "../lib/categorias";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import { ExportarSessao } from "./ExportarSessao";

interface TelaCronogramaProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  operador: string;
  onSalvarPlano: (plano: PlanoDeProducaoDiario) => Promise<void>;
}

type Fase = "montar" | "resumo" | "exportar";

const GRUPOS = [...CATEGORIAS_PRODUCAO.map((c) => c.chave), CHAVE_ESPECIAL];

export function TelaCronograma({ produtos, planos, operador, onSalvarPlano }: TelaCronogramaProps) {
  const [dataAlvo, setDataAlvo] = useState(dataDeAmanhaIso());
  const [mostrarSeletorData, setMostrarSeletorData] = useState(false);

  const planoExistente = useMemo(() => planos.find((p) => p.data === dataAlvo), [planos, dataAlvo]);

  const [itensPorGrupo, setItensPorGrupo] = useState<Record<string, ItemPlanoProducao[]>>(() =>
    mapaInicial(planoExistente)
  );
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [produtoAtivo, setProdutoAtivo] = useState<number | null>(null);
  const [valorEditando, setValorEditando] = useState("");
  const [buscaEspecial, setBuscaEspecial] = useState("");
  const [fase, setFase] = useState<Fase>("montar");
  const [salvando, setSalvando] = useState(false);
  const [planoConfirmado, setPlanoConfirmado] = useState<PlanoDeProducaoDiario | null>(null);

  const diaDaSemana = diaDaSemanaDeData(dataAlvo);
  const dataFormatada = `${rotuloDoDia(diaDaSemana)}, ${formatarDataBr(dataAlvo)}`;

  function trocarData(novaData: string) {
    setDataAlvo(novaData);
    const plano = planos.find((p) => p.data === novaData);
    setItensPorGrupo(mapaInicial(plano));
    setFase("montar");
    setProdutoAtivo(null);
  }

  const totalItens = Object.values(itensPorGrupo).reduce((soma, itens) => soma + itens.length, 0);
  const totalQuilos = Object.values(itensPorGrupo)
    .flat()
    .reduce((soma, i) => soma + i.quantidadeQuilos, 0);

  function produtosDaCategoria(chave: string): Produto[] {
    return produtos
      .filter((p) => p.categoria === chave && p.ativoNaProducao)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  const produtosEspecial = useMemo(() => {
    const termo = buscaEspecial.trim().toUpperCase();
    if (!termo) return [];
    return produtos
      .filter((p) => p.ativoNaProducao && p.nome.toUpperCase().includes(termo))
      .slice(0, 25);
  }, [produtos, buscaEspecial]);

  function abrirEdicao(codigoPdv: number, chaveGrupo: string) {
    if (produtoAtivo === codigoPdv) {
      setProdutoAtivo(null);
      setValorEditando("");
      return;
    }
    setProdutoAtivo(codigoPdv);
    const existente = itensPorGrupo[chaveGrupo]?.find((i) => i.codigoPdv === codigoPdv);
    setValorEditando(existente ? String(existente.quantidadeQuilos) : "");
  }

  function confirmarQuantidade(chaveGrupo: string, codigoPdv: number) {
    if (!ehNumeroValidoPositivo(valorEditando)) return;
    const quantidadeQuilos = paraNumero(valorEditando);
    setItensPorGrupo((atual) => {
      const itensAtuais = atual[chaveGrupo] ?? [];
      const existe = itensAtuais.some((i) => i.codigoPdv === codigoPdv);
      const novosItens = existe
        ? itensAtuais.map((i) => (i.codigoPdv === codigoPdv ? { ...i, quantidadeQuilos } : i))
        : [...itensAtuais, { codigoPdv, quantidadeQuilos }];
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

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
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
          Produção de {dataFormatada} confirmada. Gere a imagem de cada sessão abaixo — cada uma é um papel
          separado para o quadro de avisos.
        </p>
        {planoConfirmado.sessoes.map((sessao) => (
          <ExportarSessao
            key={sessao.id}
            sessao={sessao}
            dataFormatada={dataFormatada}
            produtos={produtos}
            nomeArquivoBase={`producao-${sessao.categoria.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dataAlvo}`}
          />
        ))}
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
          const subtotal = itens.reduce((s, i) => s + i.quantidadeQuilos, 0);
          return (
            <div key={chave}>
              <h3>{rotuloDaCategoria(chave)}</h3>
              <div className="tabela-scroll">
                <table className="tabela-simples">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Quilos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.codigoPdv}>
                        <td>{nomeDoProduto(item.codigoPdv)}</td>
                        <td>{item.quantidadeQuilos} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="nota-rodape">Subtotal: {arred(subtotal)} kg</p>
            </div>
          );
        })}

        <p className="total-linha">
          <strong>{totalItens}</strong> itens · <strong>{arred(totalQuilos)}</strong> kg planejados no total
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
        </p>
      )}

      <button type="button" className="link" onClick={() => setMostrarSeletorData((v) => !v)}>
        {mostrarSeletorData ? "usar amanhã (padrão)" : "planejar para outra data"}
      </button>
      {mostrarSeletorData && (
        <input type="date" value={dataAlvo} onChange={(e) => trocarData(e.target.value)} />
      )}

      {GRUPOS.map((chave) => {
        const rotulo = chave === CHAVE_ESPECIAL ? ROTULO_ESPECIAL : rotuloDaCategoria(chave);
        const itensDoGrupo = itensPorGrupo[chave] ?? [];
        const aberto = !!expandido[chave];
        const listaProdutos = chave === CHAVE_ESPECIAL ? produtosEspecial : produtosDaCategoria(chave);

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
                {chave === CHAVE_ESPECIAL && (
                  <input
                    className="campo-busca"
                    placeholder="Buscar produto no catálogo completo..."
                    value={buscaEspecial}
                    onChange={(e) => setBuscaEspecial(e.target.value)}
                  />
                )}
                {chave === CHAVE_ESPECIAL && buscaEspecial.trim() === "" && (
                  <p className="nota-rodape">Digite para buscar qualquer produto do catálogo.</p>
                )}

                {listaProdutos.length === 0 && chave !== CHAVE_ESPECIAL && (
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
                        {itemSalvo && <span className="valor-confirmado">{itemSalvo.quantidadeQuilos} kg ✓</span>}
                      </button>

                      {editando && (
                        <div className="editor-quantidade">
                          <input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*[.,]?[0-9]*"
                            autoFocus
                            placeholder="Quantidade em kg"
                            value={valorEditando}
                            onChange={(e) => setValorEditando(sanitizarEntradaNumerica(e.target.value))}
                          />
                          <span className="unidade-fixa">kg</span>
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
