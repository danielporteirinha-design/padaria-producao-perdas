/**
 * src/components/TelaCronograma.tsx
 * ---------------------------------------------------------------
 * Fluxo: escolher dia + sessão -> adicionar produtos/quantidades ->
 * Tela de Resumo (conferência) -> confirmar e salvar.
 * Sem fotos de produto, quantidade sempre numérica — conforme pedido.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type {
  DiaDaSemana,
  ItemPlanoProducao,
  PlanoDeProducaoDiario,
  SessaoProducao,
  TipoSessao,
} from "../types/producao";
import { dataDeHojeIso, diaDaSemanaDeData, rotuloDoDia } from "../lib/data";
import { gerarId } from "../lib/id";

interface TelaCronogramaProps {
  produtos: Produto[];
  operador: string;
  onSalvarPlano: (plano: PlanoDeProducaoDiario) => Promise<void>;
}

type Passo = "montar" | "resumo";

export function TelaCronograma({ produtos, operador, onSalvarPlano }: TelaCronogramaProps) {
  const [data, setData] = useState(dataDeHojeIso());
  const [tipoSessao, setTipoSessao] = useState<TipoSessao>("fixa");
  const [nomeSessao, setNomeSessao] = useState("Fornada Padrão");
  const [itens, setItens] = useState<ItemPlanoProducao[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<number | "">("");
  const [quantidade, setQuantidade] = useState("");
  const [passo, setPasso] = useState<Passo>("montar");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const diaDaSemana: DiaDaSemana = diaDaSemanaDeData(data);

  const produtosAtivos = useMemo(
    () => produtos.filter((p) => p.ativoNaProducao).sort((a, b) => a.nome.localeCompare(b.nome)),
    [produtos]
  );

  const totalItens = itens.reduce((soma, i) => soma + i.quantidadePlanejada, 0);

  function adicionarItem() {
    const qtd = Number(quantidade.replace(",", "."));
    if (produtoSelecionado === "" || !Number.isFinite(qtd) || qtd <= 0) return;

    setItens((atual) => {
      const existente = atual.find((i) => i.codigoPdv === produtoSelecionado);
      if (existente) {
        return atual.map((i) =>
          i.codigoPdv === produtoSelecionado ? { ...i, quantidadePlanejada: qtd } : i
        );
      }
      return [...atual, { codigoPdv: produtoSelecionado as number, quantidadePlanejada: qtd }];
    });
    setProdutoSelecionado("");
    setQuantidade("");
  }

  function removerItem(codigoPdv: number) {
    setItens((atual) => atual.filter((i) => i.codigoPdv !== codigoPdv));
  }

  function nomeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.nome ?? `#${codigoPdv}`;
  }

  function unidadeDoProduto(codigoPdv: number): string {
    return produtos.find((p) => p.codigoPdv === codigoPdv)?.unidadeProducao ?? "un";
  }

  async function confirmarESalvar() {
    setSalvando(true);
    const sessao: SessaoProducao = {
      id: gerarId(),
      tipo: tipoSessao,
      nome: nomeSessao || "Sessão sem nome",
      itens,
    };
    const plano: PlanoDeProducaoDiario = {
      id: gerarId(),
      data,
      diaDaSemana,
      sessoes: [sessao],
      status: "confirmado",
      criadoPor: operador,
      criadoEm: new Date().toISOString(),
      confirmadoEm: new Date().toISOString(),
    };
    await onSalvarPlano(plano);
    setSalvando(false);
    setSalvo(true);
    setItens([]);
    setPasso("montar");
  }

  if (passo === "resumo") {
    return (
      <div className="tela">
        <h2>Resumo — última conferência</h2>
        <p className="subtitulo">
          {rotuloDoDia(diaDaSemana)}, {data} · {tipoSessao === "fixa" ? "Sessão Fixa" : "Sessão Especial"}: {nomeSessao}
        </p>

        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Unidade</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={item.codigoPdv}>
                <td>{nomeDoProduto(item.codigoPdv)}</td>
                <td>{item.quantidadePlanejada}</td>
                <td>{unidadeDoProduto(item.codigoPdv)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="total-linha">
          <strong>{itens.length}</strong> itens · <strong>{totalItens}</strong> unidades/kg planejadas no total
        </p>

        <div className="acoes">
          <button type="button" className="secundario" onClick={() => setPasso("montar")}>
            Voltar e ajustar
          </button>
          <button type="button" className="primario" disabled={salvando} onClick={confirmarESalvar}>
            {salvando ? "Salvando..." : "Confirmar produção"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Cronograma de Produção</h2>

      {salvo && <p className="mensagem-sucesso">Plano do dia anterior salvo com sucesso.</p>}

      <div className="linha-campos">
        <label>
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <span className="dia-semana-badge">{rotuloDoDia(diaDaSemana)}</span>
      </div>

      <div className="linha-campos">
        <label>
          Tipo de sessão
          <select value={tipoSessao} onChange={(e) => setTipoSessao(e.target.value as TipoSessao)}>
            <option value="fixa">Fixa (rotina diária)</option>
            <option value="especial">Especial (encomenda/teste)</option>
          </select>
        </label>
        <label>
          Nome da sessão
          <input value={nomeSessao} onChange={(e) => setNomeSessao(e.target.value)} />
        </label>
      </div>

      <div className="linha-campos adicionar-item">
        <label>
          Produto
          <select
            value={produtoSelecionado}
            onChange={(e) => setProdutoSelecionado(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Selecione...</option>
            {produtosAtivos.map((p) => (
              <option key={p.codigoPdv} value={p.codigoPdv}>
                {p.nome} ({p.unidadeProducao})
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </label>
        <button type="button" className="secundario" onClick={adicionarItem}>
          Adicionar
        </button>
      </div>

      <table className="tabela-simples">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr>
              <td colSpan={3} className="vazio">
                Nenhum item adicionado ainda.
              </td>
            </tr>
          )}
          {itens.map((item) => (
            <tr key={item.codigoPdv}>
              <td>{nomeDoProduto(item.codigoPdv)}</td>
              <td>{item.quantidadePlanejada}</td>
              <td>
                <button type="button" className="link" onClick={() => removerItem(item.codigoPdv)}>
                  remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="acoes">
        <button type="button" className="primario" disabled={itens.length === 0} onClick={() => setPasso("resumo")}>
          Ir para o Resumo
        </button>
      </div>
    </div>
  );
}
