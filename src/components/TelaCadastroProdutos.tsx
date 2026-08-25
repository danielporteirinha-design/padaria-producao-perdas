/**
 * src/components/TelaCadastroProdutos.tsx
 * ---------------------------------------------------------------
 * Cadastro rápido de produto novo + lista/busca do catálogo + revisão
 * assistida de categoria para os itens "SEM_CATEGORIA" + limpeza de
 * produtos fora das 5 categorias de produção (decisão do dono do
 * negócio — ago/2026: o catálogo deste app deve conter só o que é
 * produzido nessas 5 categorias).
 */

import { useEffect, useMemo, useState } from "react";
import type { NovoProdutoInput, Produto, UnidadeProducao } from "../types/produto";
import { construirVocabularioPorCategoria, sugerirCategorias } from "../lib/sugestaoCategoria";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";

interface TelaCadastroProdutosProps {
  produtos: Produto[];
  onCriarProduto: (input: NovoProdutoInput) => Promise<void>;
  onAtualizarProduto: (produto: Produto) => Promise<void>;
  onExcluirProdutos: (codigosPdv: number[]) => Promise<void>;
}

const VALOR_INICIAL: NovoProdutoInput = {
  nome: "",
  categoria: CATEGORIAS_PRODUCAO[0].chave,
  unidadeProducao: "un",
  precoCusto: 0,
  precoVenda: 0,
  ativoNaProducao: true,
  pesoMedioUnitarioGramas: undefined,
  prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[CATEGORIAS_PRODUCAO[0].chave] ?? null,
};

export function TelaCadastroProdutos({
  produtos,
  onCriarProduto,
  onAtualizarProduto,
  onExcluirProdutos,
}: TelaCadastroProdutosProps) {
  const [form, setForm] = useState<NovoProdutoInput>(VALOR_INICIAL);
  const [validadeTocada, setValidadeTocada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"novo" | "lista" | "revisao" | "limpeza">("novo");

  // Ao trocar a categoria, sugere o prazo de validade típico dela — só se o
  // operador ainda não tiver ajustado esse campo manualmente (ex.: uma
  // rosca dentro de "Pães e Roscas" precisa de um valor diferente do pão).
  useEffect(() => {
    if (!validadeTocada) {
      setForm((atual) => ({ ...atual, prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[atual.categoria] ?? null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoria]);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    await onCriarProduto(form);
    setSalvando(false);
    setForm(VALOR_INICIAL);
    setValidadeTocada(false);
  }

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) => p.nome.toUpperCase().includes(termo) || p.categoria.toUpperCase().includes(termo)
    );
  }, [produtos, busca]);

  const semCategoria = useMemo(
    () => produtos.filter((p) => p.categoria === "SEM_CATEGORIA"),
    [produtos]
  );

  // Fora de escopo = qualquer produto que não esteja em nenhuma das 5
  // categorias de produção — inclui "SEM_CATEGORIA" e categorias de
  // revenda (mercearia, refrigerante...) importadas junto na planilha
  // original do PDV.
  const foraDeEscopo = useMemo(
    () => produtos.filter((p) => !CATEGORIAS_PRODUCAO.some((c) => c.chave === p.categoria)),
    [produtos]
  );

  // Vocabulário restrito às 5 categorias de produção — sugerir uma categoria de
  // revenda (ex.: "MERCEARIA") não ajudaria em nada, já que essas não aparecem
  // em mais nenhuma tela do app.
  const produtosDasCategoriasDeProducao = useMemo(
    () => produtos.filter((p) => CATEGORIAS_PRODUCAO.some((c) => c.chave === p.categoria)),
    [produtos]
  );
  const vocabulario = useMemo(
    () => construirVocabularioPorCategoria(produtosDasCategoriasDeProducao),
    [produtosDasCategoriasDeProducao]
  );

  return (
    <div className="tela">
      <h2>Cadastro de Produtos</h2>

      <div className="abas">
        <button type="button" className={abaAtiva === "novo" ? "aba ativa" : "aba"} onClick={() => setAbaAtiva("novo")}>
          Novo produto
        </button>
        <button type="button" className={abaAtiva === "lista" ? "aba ativa" : "aba"} onClick={() => setAbaAtiva("lista")}>
          Catálogo ({produtos.length})
        </button>
        <button
          type="button"
          className={abaAtiva === "revisao" ? "aba ativa" : "aba"}
          onClick={() => setAbaAtiva("revisao")}
        >
          Sem categoria ({semCategoria.length})
        </button>
        <button
          type="button"
          className={abaAtiva === "limpeza" ? "aba ativa" : "aba"}
          onClick={() => setAbaAtiva("limpeza")}
        >
          Fora de escopo ({foraDeEscopo.length})
        </button>
      </div>

      {abaAtiva === "novo" && (
        <form onSubmit={handleSalvar} className="formulario">
          <label>
            Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>
            Categoria
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_PRODUCAO.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <div className="linha-campos">
            <label>
              Unidade de produção
              <select
                value={form.unidadeProducao}
                onChange={(e) => setForm({ ...form, unidadeProducao: e.target.value as UnidadeProducao })}
              >
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
              </select>
            </label>
            <label>
              Preço custo
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.precoCusto}
                onChange={(e) => setForm({ ...form, precoCusto: Number(e.target.value) })}
              />
            </label>
            <label>
              Preço venda
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.precoVenda}
                onChange={(e) => setForm({ ...form, precoVenda: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.ativoNaProducao}
              onChange={(e) => setForm({ ...form, ativoNaProducao: e.target.checked })}
            />
            Ativo no Cronograma de Produção
          </label>

          <label>
            Prazo de validade (dias)
            <input
              type="number"
              min={1}
              value={form.prazoValidadeDias ?? ""}
              onChange={(e) => {
                setValidadeTocada(true);
                setForm({ ...form, prazoValidadeDias: Number(e.target.value) || undefined });
              }}
            />
            <span className="nota-rodape">
              Sugerido pela categoria, mas ajuste por produto — ex.: "Pães e Roscas" sugere validade de
              pão (1 dia); uma rosca da mesma categoria costuma durar mais, digite 2. Usado na tela de
              Perdas para saber de qual dia de produção uma perda pode ter vindo, já que a etiqueta não
              traz data de fabricação isolada.
            </span>
          </label>

          {form.unidadeProducao === "un" && (
            <label>
              Peso médio por unidade (gramas) — opcional
              <input
                type="number"
                min={0}
                value={form.pesoMedioUnitarioGramas ?? ""}
                onChange={(e) =>
                  setForm({ ...form, pesoMedioUnitarioGramas: Number(e.target.value) || undefined })
                }
              />
              <span className="nota-rodape">
                Usado como sugestão pré-preenchida na tela de Perdas, para calcular quantas unidades uma
                perda pesada na balança representa. É atualizado automaticamente a cada perda lançada — não
                precisa manter manualmente, só cadastre um valor inicial.
              </span>
            </label>
          )}

          <button type="submit" className="primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar produto"}
          </button>
        </form>
      )}

      {abaAtiva === "lista" && (
        <div>
          <input
            className="campo-busca"
            placeholder="Buscar por nome ou categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="tabela-scroll">
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Unidade</th>
                  <th>Peso médio</th>
                  <th>Validade</th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.slice(0, 200).map((p) => (
                  <tr key={p.codigoPdv}>
                    <td className="mono">{p.codigoPdv}</td>
                    <td>{p.nome}</td>
                    <td>{p.categoria === "SEM_CATEGORIA" ? <span className="tag-pendente">sem categoria</span> : p.categoria}</td>
                    <td>{p.unidadeProducao}</td>
                    <td>{p.pesoMedioUnitarioGramas ? `${p.pesoMedioUnitarioGramas}g` : "—"}</td>
                    <td>{p.prazoValidadeDias ? `${p.prazoValidadeDias} dia(s)` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {produtosFiltrados.length > 200 && (
            <p className="nota-rodape">Mostrando 200 de {produtosFiltrados.length} resultados — refine a busca.</p>
          )}
        </div>
      )}

      {abaAtiva === "revisao" && (
        <RevisaoCategoria
          produtos={semCategoria}
          vocabulario={vocabulario}
          onAtualizarProduto={onAtualizarProduto}
        />
      )}

      {abaAtiva === "limpeza" && (
        <LimpezaCatalogo produtos={foraDeEscopo} onExcluirProdutos={onExcluirProdutos} />
      )}
    </div>
  );
}

function RevisaoCategoria({
  produtos,
  vocabulario,
  onAtualizarProduto,
}: {
  produtos: Produto[];
  vocabulario: Map<string, Map<string, number>>;
  onAtualizarProduto: (produto: Produto) => Promise<void>;
}) {
  if (produtos.length === 0) {
    return <p className="mensagem-sucesso">Todos os produtos têm categoria definida.</p>;
  }

  return (
    <div>
      <p className="nota-rodape">
        Sugestões calculadas por sobreposição de palavras com as categorias já existentes — sempre
        exigem sua confirmação, nunca são aplicadas sozinhas (produtos ambíguos, ex.: "queijo",
        aparecem em várias categorias).
      </p>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Sugestões</th>
            </tr>
          </thead>
          <tbody>
            {produtos.slice(0, 50).map((p) => {
              const sugestoes = sugerirCategorias(p, vocabulario);
              return (
                <tr key={p.codigoPdv}>
                  <td>{p.nome}</td>
                  <td className="sugestoes-linha">
                    {sugestoes.length === 0 && <span className="nota-rodape">sem sugestão — revisar manualmente</span>}
                    {sugestoes.map((s) => (
                      <button
                        key={s.categoria}
                        type="button"
                        className="chip-sugestao"
                        onClick={() => onAtualizarProduto({ ...p, categoria: s.categoria })}
                        title={`confiança: ${(s.pontuacao * 100).toFixed(0)}%`}
                      >
                        {s.categoria}
                      </button>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {produtos.length > 50 && (
        <p className="nota-rodape">Mostrando 50 de {produtos.length} pendentes — vá salvando e a lista avança.</p>
      )}
    </div>
  );
}

/**
 * Exclusão em massa dos produtos fora das 5 categorias de produção
 * (decisão do dono do negócio — ago/2026). Agrupado por categoria
 * original do PDV, com cada grupo selecionável individualmente — um
 * item ambíguo (ex.: "BOLOS DE ANIVERSÁRIO", que é claramente um bolo
 * mas veio com categoria própria da planilha) pode ficar de fora da
 * exclusão só desmarcando o grupo dele, sem precisar revisar item a
 * item. Exige um segundo clique de confirmação — ação irreversível.
 */
function LimpezaCatalogo({
  produtos,
  onExcluirProdutos,
}: {
  produtos: Produto[];
  onExcluirProdutos: (codigosPdv: number[]) => Promise<void>;
}) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, Produto[]>();
    for (const p of produtos) {
      const lista = mapa.get(p.categoria) ?? [];
      lista.push(p);
      mapa.set(p.categoria, lista);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [produtos]);

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(grupos.map(([categoria]) => categoria)));
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  if (produtos.length === 0) {
    return <p className="mensagem-sucesso">O catálogo já contém só produtos das 5 categorias de produção.</p>;
  }

  function alternar(categoria: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  }

  const codigosSelecionados = grupos
    .filter(([categoria]) => selecionados.has(categoria))
    .flatMap(([, lista]) => lista.map((p) => p.codigoPdv));

  return (
    <div>
      <p className="callout-inline">
        Estes {produtos.length} produtos não pertencem a nenhuma das 5 categorias de produção — não
        aparecem no Cronograma nem em Perdas. Desmarque qualquer categoria que precise de uma segunda
        olhada antes de excluir (ex.: um item claramente da padaria que só ficou com o nome de categoria
        errado na planilha original do PDV).
      </p>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th></th>
              <th>Categoria original (PDV)</th>
              <th>Itens</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([categoria, lista]) => (
              <tr key={categoria}>
                <td>
                  <input
                    type="checkbox"
                    checked={selecionados.has(categoria)}
                    onChange={() => alternar(categoria)}
                    aria-label={`Selecionar categoria ${categoria}`}
                  />
                </td>
                <td>{categoria === "SEM_CATEGORIA" ? <span className="tag-pendente">sem categoria</span> : categoria}</td>
                <td>{lista.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="total-linha">
        <strong>{codigosSelecionados.length}</strong> de {produtos.length} produtos serão excluídos permanentemente.
      </p>

      {!confirmando ? (
        <div className="acoes">
          <button
            type="button"
            className="secundario"
            disabled={codigosSelecionados.length === 0}
            onClick={() => setConfirmando(true)}
          >
            Excluir selecionados
          </button>
        </div>
      ) : (
        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={excluindo}
            onClick={async () => {
              setExcluindo(true);
              await onExcluirProdutos(codigosSelecionados);
              setExcluindo(false);
              setConfirmando(false);
            }}
          >
            {excluindo ? "Excluindo..." : `Confirmar exclusão de ${codigosSelecionados.length} produtos`}
          </button>
        </div>
      )}
    </div>
  );
}
