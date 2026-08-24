/**
 * src/components/TelaCadastroProdutos.tsx
 * ---------------------------------------------------------------
 * Cadastro rápido de produto novo + lista/busca do catálogo +
 * revisão assistida de categoria para os itens "SEM_CATEGORIA".
 */

import { useMemo, useState } from "react";
import type { NovoProdutoInput, Produto, UnidadeProducao } from "../types/produto";
import { construirVocabularioPorCategoria, sugerirCategorias } from "../lib/sugestaoCategoria";

interface TelaCadastroProdutosProps {
  produtos: Produto[];
  onCriarProduto: (input: NovoProdutoInput) => Promise<void>;
  onAtualizarProduto: (produto: Produto) => Promise<void>;
}

const VALOR_INICIAL: NovoProdutoInput = {
  nome: "",
  categoria: "",
  unidadeProducao: "un",
  precoCusto: 0,
  precoVenda: 0,
  ativoNaProducao: true,
  permiteRegistroPerdaPorPeso: false,
  pesoMedioUnitarioGramas: undefined,
};

export function TelaCadastroProdutos({
  produtos,
  onCriarProduto,
  onAtualizarProduto,
}: TelaCadastroProdutosProps) {
  const [form, setForm] = useState<NovoProdutoInput>(VALOR_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"novo" | "lista" | "revisao">("novo");

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSalvando(true);
    await onCriarProduto(form);
    setSalvando(false);
    setForm(VALOR_INICIAL);
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

  const vocabulario = useMemo(() => construirVocabularioPorCategoria(produtos), [produtos]);

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
      </div>

      {abaAtiva === "novo" && (
        <form onSubmit={handleSalvar} className="formulario">
          <label>
            Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>
            Categoria
            <input
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Deixe em branco para SEM_CATEGORIA"
            />
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

          {form.unidadeProducao === "un" && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.permiteRegistroPerdaPorPeso}
                  onChange={(e) => setForm({ ...form, permiteRegistroPerdaPorPeso: e.target.checked })}
                />
                Permitir registrar perda por peso (balança em kg)
              </label>
              {form.permiteRegistroPerdaPorPeso && (
                <label>
                  Peso médio por unidade (gramas)
                  <input
                    type="number"
                    min={0}
                    value={form.pesoMedioUnitarioGramas ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, pesoMedioUnitarioGramas: Number(e.target.value) || undefined })
                    }
                  />
                </label>
              )}
            </>
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
          <table className="tabela-simples">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Perda por peso</th>
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.slice(0, 200).map((p) => (
                <tr key={p.codigoPdv}>
                  <td className="mono">{p.codigoPdv}</td>
                  <td>{p.nome}</td>
                  <td>{p.categoria === "SEM_CATEGORIA" ? <span className="tag-pendente">sem categoria</span> : p.categoria}</td>
                  <td>{p.unidadeProducao}</td>
                  <td>{p.permiteRegistroPerdaPorPeso ? `sim (${p.pesoMedioUnitarioGramas ?? "?"}g)` : "não"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      {produtos.length > 50 && (
        <p className="nota-rodape">Mostrando 50 de {produtos.length} pendentes — vá salvando e a lista avança.</p>
      )}
    </div>
  );
}
