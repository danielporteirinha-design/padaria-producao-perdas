/**
 * src/components/TelaCadastroProdutos.tsx
 * ---------------------------------------------------------------
 * Cadastro rápido de produto novo + lista/busca do catálogo (com edição
 * inline de nome, categoria, unidade, peso médio e validade) + revisão
 * assistida de categoria para os itens "SEM_CATEGORIA" + limpeza de
 * produtos fora das 5 categorias de produção (decisão do dono do
 * negócio — ago/2026: o catálogo deste app deve conter só o que é
 * produzido nessas 5 categorias).
 */

import { useMemo, useState } from "react";
import type { NovoProdutoInput, Produto, UnidadeProducao } from "../types/produto";
import type { Suprimento } from "../types/suprimento";
import { ConfirmarComSenha } from "./ConfirmarComSenha";
import { CampoDeBusca } from "./CampoDeBusca";
import { IconeLixeira } from "./Icones";
import { CATEGORIAS_PRODUCAO, VALIDADE_SUGERIDA_DIAS } from "../lib/categorias";
import { contemBusca } from "../lib/texto";

interface TelaCadastroProdutosProps {
  produtos: Produto[];
  onCriarProduto: (input: NovoProdutoInput) => Promise<void>;
  onAtualizarProduto: (produto: Produto) => Promise<void>;
  onExcluirProdutos: (codigosPdv: number[]) => Promise<void>;
  /**
   * Catálogo de suprimentos (embalagens, sacolas, material de limpeza) —
   * cresce sozinho com o uso das filiais (ver TelaSuprimentos.tsx). A
   * matriz não cadastra suprimento aqui, só PODA o catálogo quando um
   * item entrou duplicado ou errado (set/2026, pedido do dono do
   * negócio: "possibilite a exclusão de suprimentos cadastrados").
   */
  suprimentos: Suprimento[];
  onExcluirSuprimentos: (ids: string[]) => Promise<void>;
}

/**
 * Categoria começa VAZIA de propósito (ago/2026): antes vinha
 * pré-selecionada em "Pães e Roscas", e um cadastro feito às pressas
 * arquivava o produto na primeira categoria da lista sem ninguém
 * perceber. Categoria errada contamina o cronograma (o produto aparece na
 * sessão errada) e toda análise por categoria.
 */
const VALOR_INICIAL: NovoProdutoInput = {
  nome: "",
  categoria: "",
  unidadeProducao: "un",
  ativoNaProducao: true,
  pesoMedioUnitarioGramas: undefined,
  prazoValidadeDias: null,
};

export function TelaCadastroProdutos({
  produtos,
  onCriarProduto,
  onAtualizarProduto,
  onExcluirProdutos,
  suprimentos,
  onExcluirSuprimentos,
}: TelaCadastroProdutosProps) {
  const [form, setForm] = useState<NovoProdutoInput>(VALOR_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  /**
   * As abas "Sem categoria" e "Fora de escopo" foram removidas (ago/2026).
   * Eram ferramentas da migração inicial do catálogo do PDV (881 -> 89
   * produtos), já concluída. Hoje nada consegue voltar a entrar sem
   * categoria ou fora das 5 categorias de produção: o formulário exige a
   * escolha, a importação de planilha filtra, e o catálogo semente já vem
   * limpo. Manter as abas era oferecer duas telas que nunca teriam nada.
   */
  const [abaAtiva, setAbaAtiva] = useState<"novo" | "lista" | "suprimentos">("novo");

  // Edição inline do catálogo — nome, categoria, unidade, peso médio e
  // validade (decisão do dono do negócio — set/2026: esses 5 campos podem
  // ter vindo errados da planilha original ou precisar de ajuste depois do
  // cadastro inicial, sem precisar excluir e recriar o produto).
  const [codigoEmEdicao, setCodigoEmEdicao] = useState<number | null>(null);
  const [rascunhoEdicao, setRascunhoEdicao] = useState<{
    nome: string;
    categoria: string;
    unidadeProducao: UnidadeProducao;
    pesoMedioUnitarioGramas: string;
    prazoValidadeDias: string;
  } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  /**
   * A exclusão passou a viver no próprio Catálogo (ago/2026), depois que a
   * aba "Fora de escopo" — antigo único caminho para excluir — saiu.
   * Continua exigindo a senha da loja: apaga catálogo compartilhado pelas
   * três lojas e não tem como desfazer.
   */
  const [produtoAExcluir, setProdutoAExcluir] = useState<Produto | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // --- Catálogo de suprimentos: só busca e exclusão (set/2026) ---
  const [buscaSuprimento, setBuscaSuprimento] = useState("");
  const [suprimentoAExcluir, setSuprimentoAExcluir] = useState<Suprimento | null>(null);
  const [excluindoSuprimento, setExcluindoSuprimento] = useState(false);


  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.categoria) return;
    setSalvando(true);
    try {
      await onCriarProduto({
        ...form,
        // Padrões que saíram do formulário: produção é sempre em unidades
        // (decisão operacional), e o prazo vem da categoria escolhida.
        unidadeProducao: "un",
        ativoNaProducao: true,
        prazoValidadeDias: VALIDADE_SUGERIDA_DIAS[form.categoria] ?? null,
      });
      // Só limpa o formulário quando a gravação deu certo — senão o
      // operador perderia o que digitou junto com o erro.
      setForm(VALOR_INICIAL);
    } catch {
      // A mensagem já é exibida pelo aviso global (ver App.tsx). Aqui só
      // interessa não deixar o botão preso em "Salvando..." — foi
      // exatamente esse o defeito relatado em produção.
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(p: Produto) {
    setCodigoEmEdicao(p.codigoPdv);
    setRascunhoEdicao({
      nome: p.nome,
      categoria: p.categoria,
      unidadeProducao: p.unidadeProducao,
      pesoMedioUnitarioGramas: p.pesoMedioUnitarioGramas != null ? String(p.pesoMedioUnitarioGramas) : "",
      prazoValidadeDias: p.prazoValidadeDias != null ? String(p.prazoValidadeDias) : "",
    });
  }

  function cancelarEdicao() {
    setCodigoEmEdicao(null);
    setRascunhoEdicao(null);
  }

  async function salvarEdicao(produtoOriginal: Produto) {
    if (!rascunhoEdicao || !rascunhoEdicao.nome.trim()) return;
    setSalvandoEdicao(true);
    try {
      await onAtualizarProduto({
        ...produtoOriginal,
        nome: rascunhoEdicao.nome.trim(),
        categoria: rascunhoEdicao.categoria,
        unidadeProducao: rascunhoEdicao.unidadeProducao,
        pesoMedioUnitarioGramas: rascunhoEdicao.pesoMedioUnitarioGramas.trim()
          ? Number(rascunhoEdicao.pesoMedioUnitarioGramas)
          : undefined,
        prazoValidadeDias: rascunhoEdicao.prazoValidadeDias.trim()
          ? Number(rascunhoEdicao.prazoValidadeDias)
          : null,
      });
      setCodigoEmEdicao(null);
      setRascunhoEdicao(null);
    } catch {
      // Mantém a linha aberta em edição: o operador não perde o que
      // digitou e pode tentar de novo. A mensagem vem do aviso global.
    } finally {
      setSalvandoEdicao(false);
    }
  }

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim();
    if (!termo) return produtos;
    return produtos.filter(
      (p) => contemBusca(p.nome, termo) || contemBusca(p.categoria, termo)
    );
  }, [produtos, busca]);

  const suprimentosFiltrados = useMemo(() => {
    const termo = buscaSuprimento.trim();
    const base = [...suprimentos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    if (!termo) return base;
    return base.filter((s) => contemBusca(s.nome, termo) || contemBusca(s.segmento, termo));
  }, [suprimentos, buscaSuprimento]);



  // Vocabulário restrito às 5 categorias de produção — sugerir uma categoria de
  // revenda (ex.: "MERCEARIA") não ajudaria em nada, já que essas não aparecem
  // em mais nenhuma tela do app.

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
          className={abaAtiva === "suprimentos" ? "aba ativa" : "aba"}
          onClick={() => setAbaAtiva("suprimentos")}
        >
          Suprimentos ({suprimentos.length})
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
            <select
              value={form.categoria}
              required
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            >
              <option value="">Escolha a categoria...</option>
              {CATEGORIAS_PRODUCAO.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
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
              Pode deixar em branco: o app aprende esse peso sozinho no primeiro lançamento de perda
              daquele produto, e vai refinando a cada lançamento seguinte.
            </span>
          </label>

          <p className="nota-rodape">
            Unidade e prazo de validade saíram deste formulário (ago/2026) para o cadastro ser de três
            campos. Produção é sempre em unidades, e o prazo entra sozinho pela categoria — os dois
            ficam editáveis na linha do produto, no Catálogo, quando algum caso fugir da regra.
          </p>

          <button type="submit" className="primario" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar produto"}
          </button>
        </form>
      )}

      {abaAtiva === "lista" && (
        <div>
          <CampoDeBusca
            className="campo-busca"
            valor={busca}
            onMudar={setBusca}
            placeholder="Buscar por nome ou categoria..."
            rotulo="Buscar produto por nome ou categoria"
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {produtosFiltrados.slice(0, 200).map((p) => {
                  if (codigoEmEdicao === p.codigoPdv && rascunhoEdicao) {
                    const opcoesCategoria = CATEGORIAS_PRODUCAO.some((c) => c.chave === rascunhoEdicao.categoria)
                      ? CATEGORIAS_PRODUCAO
                      : [
                          {
                            chave: rascunhoEdicao.categoria,
                            rotulo:
                              rascunhoEdicao.categoria === "SEM_CATEGORIA" ? "Sem categoria" : rascunhoEdicao.categoria,
                          },
                          ...CATEGORIAS_PRODUCAO,
                        ];
                    return (
                      <tr key={p.codigoPdv} className="linha-em-edicao">
                        <td className="mono">{p.codigoPdv}</td>
                        <td>
                          <input
                            value={rascunhoEdicao.nome}
                            onChange={(e) => setRascunhoEdicao({ ...rascunhoEdicao, nome: e.target.value })}
                            aria-label="Nome do produto"
                          />
                        </td>
                        <td>
                          <select
                            value={rascunhoEdicao.categoria}
                            onChange={(e) => setRascunhoEdicao({ ...rascunhoEdicao, categoria: e.target.value })}
                            aria-label="Categoria do produto"
                          >
                            {opcoesCategoria.map((c) => (
                              <option key={c.chave} value={c.chave}>
                                {c.rotulo}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={rascunhoEdicao.unidadeProducao}
                            onChange={(e) =>
                              setRascunhoEdicao({ ...rascunhoEdicao, unidadeProducao: e.target.value as UnidadeProducao })
                            }
                            aria-label="Unidade de produção"
                          >
                            <option value="un">un</option>
                            <option value="kg">kg</option>
                            <option value="l">l</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={rascunhoEdicao.pesoMedioUnitarioGramas}
                            onChange={(e) =>
                              setRascunhoEdicao({ ...rascunhoEdicao, pesoMedioUnitarioGramas: e.target.value })
                            }
                            placeholder="g"
                            aria-label="Peso médio por unidade em gramas"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            value={rascunhoEdicao.prazoValidadeDias}
                            onChange={(e) => setRascunhoEdicao({ ...rascunhoEdicao, prazoValidadeDias: e.target.value })}
                            placeholder="dias"
                            aria-label="Prazo de validade em dias"
                          />
                        </td>
                        <td className="acoes-linha">
                          <button
                            type="button"
                            className="link"
                            disabled={salvandoEdicao || !rascunhoEdicao.nome.trim()}
                            onClick={() => salvarEdicao(p)}
                          >
                            {salvandoEdicao ? "Salvando..." : "Salvar"}
                          </button>
                          <button type="button" className="link" disabled={salvandoEdicao} onClick={cancelarEdicao}>
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={p.codigoPdv}>
                      <td className="mono">{p.codigoPdv}</td>
                      <td>{p.nome}</td>
                      <td>{p.categoria === "SEM_CATEGORIA" ? <span className="tag-pendente">sem categoria</span> : p.categoria}</td>
                      <td>{p.unidadeProducao}</td>
                      <td>{p.pesoMedioUnitarioGramas ? `${p.pesoMedioUnitarioGramas}g` : "—"}</td>
                      <td>{p.prazoValidadeDias ? `${p.prazoValidadeDias} dia(s)` : "—"}</td>
                      <td className="acoes-linha">
                        <button type="button" className="link" onClick={() => iniciarEdicao(p)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="botao-limpar-sessao"
                          title={`Excluir ${p.nome}`}
                          aria-label={`Excluir ${p.nome}`}
                          onClick={() => setProdutoAExcluir(p)}
                        >
                          <IconeLixeira tamanho={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {produtosFiltrados.length > 200 && (
            <p className="nota-rodape">Mostrando 200 de {produtosFiltrados.length} resultados — refine a busca.</p>
          )}
        </div>
      )}

      {/*
        CATÁLOGO DE SUPRIMENTOS — SÓ BUSCA E EXCLUSÃO (set/2026, pedido do
        dono do negócio: "possibilite a exclusão de suprimentos
        cadastrados"). O catálogo cresce sozinho com o uso das filiais
        (ver TelaSuprimentos.tsx) — a matriz não precisa de um formulário
        de cadastro aqui, só de podar o que entrou duplicado ou errado.
      */}
      {abaAtiva === "suprimentos" && (
        <div>
          <CampoDeBusca
            className="campo-busca"
            valor={buscaSuprimento}
            onMudar={setBuscaSuprimento}
            placeholder="Buscar por nome ou segmento..."
            rotulo="Buscar suprimento por nome ou segmento"
          />
          <div className="tabela-scroll">
            <table className="tabela-simples">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Segmento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suprimentosFiltrados.slice(0, 200).map((s) => (
                  <tr key={s.id}>
                    <td>{s.nome}</td>
                    <td>{s.segmento}</td>
                    <td className="acoes-linha">
                      <button
                        type="button"
                        className="botao-limpar-sessao"
                        title={`Excluir ${s.nome}`}
                        aria-label={`Excluir ${s.nome}`}
                        onClick={() => setSuprimentoAExcluir(s)}
                      >
                        <IconeLixeira tamanho={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {suprimentosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={3} className="nota-rodape">
                      Nada cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {suprimentosFiltrados.length > 200 && (
            <p className="nota-rodape">
              Mostrando 200 de {suprimentosFiltrados.length} resultados — refine a busca.
            </p>
          )}
        </div>
      )}

      {produtoAExcluir && (
        <ConfirmarComSenha
          titulo="Excluir produto"
          descricao={`"${produtoAExcluir.nome}" sai do catálogo das três lojas. Cronogramas e perdas já lançados continuam no histórico, mas o produto não poderá mais ser escolhido. Não há como desfazer.`}
          rotuloConfirmar={excluindo ? "Excluindo..." : "Excluir definitivamente"}
          onCancelar={() => setProdutoAExcluir(null)}
          onConfirmado={async () => {
            setExcluindo(true);
            try {
              await onExcluirProdutos([produtoAExcluir.codigoPdv]);
              setProdutoAExcluir(null);
            } catch {
              // Mensagem vem do aviso global (ver App.tsx).
            } finally {
              setExcluindo(false);
            }
          }}
        />
      )}

      {suprimentoAExcluir && (
        <ConfirmarComSenha
          titulo="Excluir suprimento"
          descricao={`"${suprimentoAExcluir.nome}" sai do catálogo das três lojas. Pedidos de suprimentos já enviados continuam no histórico, mas o item não poderá mais ser escolhido. Não há como desfazer.`}
          rotuloConfirmar={excluindoSuprimento ? "Excluindo..." : "Excluir definitivamente"}
          onCancelar={() => setSuprimentoAExcluir(null)}
          onConfirmado={async () => {
            setExcluindoSuprimento(true);
            try {
              await onExcluirSuprimentos([suprimentoAExcluir.id]);
              setSuprimentoAExcluir(null);
            } catch {
              // Mensagem vem do aviso global (ver App.tsx).
            } finally {
              setExcluindoSuprimento(false);
            }
          }}
        />
      )}
    </div>
  );
}
