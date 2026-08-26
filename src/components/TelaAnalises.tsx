/**
 * src/components/TelaAnalises.tsx
 * ---------------------------------------------------------------
 * Painel de análises (ago/2026). A pergunta que o dono do negócio quer
 * responder de relance: "existe padrão de perda por dia da semana ou por
 * semana do mês?". Se terça desperdiça o dobro de sexta, o cronograma de
 * terça está errado — e isso é dinheiro que dá para parar de jogar fora
 * sem cortar nada da operação.
 *
 * UM FILTRO SÓ, NO TOPO, VALENDO PARA TUDO
 * -----------------------------------------
 * Período, loja e categoria são aplicados uma única vez (ver
 * src/lib/analises.ts) e alimentam os números, os três gráficos E o
 * resumo mandado para a IA. É o que garante que a tela e a IA estejam
 * olhando exatamente o mesmo recorte — se cada bloco filtrasse por conta
 * própria, a IA acabaria comentando dados que não estão na tela.
 *
 * PERCENTUAL, NÃO VOLUME
 * -----------------------
 * Os gráficos comparam TAXA de perda. Sábado produz muito mais que
 * segunda, então o total perdido no sábado seria sempre maior sem que
 * isso significasse desperdício pior. O percentual é o que torna os dias
 * comparáveis.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import {
  calcularTotais,
  perdaPorDiaDaSemana,
  perdaPorSemanaDoMes,
  formatarPercentual,
  recortar,
  topProdutosPorPerda,
  type FiltroAnalise,
} from "../lib/analises";
import { CATEGORIAS_PRODUCAO } from "../lib/categorias";
import { LOJAS } from "../lib/lojas";
import { dataDeHojeIso } from "../lib/data";
import {
  buscarInsightsCatalogo,
  construirResumoParaInsights,
  ErroInsightsCatalogo,
  type InsightCatalogo,
} from "../lib/insightsCatalogo";
import { GraficoBarras } from "./GraficoBarras";

interface TelaAnalisesProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
}

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

export function TelaAnalises({ produtos, planos, perdas }: TelaAnalisesProps) {
  const [filtro, setFiltro] = useState<FiltroAnalise>({ dias: 30 });
  const hoje = dataDeHojeIso();

  const recorte = useMemo(
    () => recortar(produtos, planos, perdas, hoje, filtro),
    [produtos, planos, perdas, hoje, filtro]
  );

  const totais = useMemo(() => calcularTotais(recorte), [recorte]);
  const porDia = useMemo(() => perdaPorDiaDaSemana(recorte), [recorte]);
  const porSemana = useMemo(() => perdaPorSemanaDoMes(recorte), [recorte]);
  const porProduto = useMemo(() => topProdutosPorPerda(recorte), [recorte]);

  const [insights, setInsights] = useState<InsightCatalogo[] | null>(null);
  const [statusInsights, setStatusInsights] = useState<"" | "carregando" | "erro">("");
  const [mensagemInsights, setMensagemInsights] = useState("");

  async function gerarInsights() {
    setStatusInsights("carregando");
    setMensagemInsights("");
    try {
      const resumo = construirResumoParaInsights(produtos, planos, perdas, hoje);
      if (resumo.length === 0) {
        setStatusInsights("erro");
        setMensagemInsights("Ainda não há histórico suficiente para analisar.");
        return;
      }
      // Os padrões vão junto do resumo por produto: sem eles a IA só
      // consegue falar de item isolado, e a pergunta do dono do negócio é
      // sobre PADRÃO — que dia, que semana, e o que fazer a respeito.
      const resultado = await buscarInsightsCatalogo(resumo, {
        porDiaDaSemana: porDia,
        porSemanaDoMes: porSemana,
        taxaGeral: totais.taxaPerda,
        janelaDias: filtro.dias,
      });
      setInsights(resultado);
      setStatusInsights("");
      if (resultado.length === 0) {
        setMensagemInsights("A IA não encontrou padrões relevantes neste recorte.");
      }
    } catch (erro) {
      console.error("Falha ao gerar insights:", erro);
      setStatusInsights("erro");
      setMensagemInsights(
        erro instanceof ErroInsightsCatalogo
          ? erro.message
          : "Não foi possível gerar os insights agora. Tente de novo em alguns minutos."
      );
    }
  }

  const semDados = totais.produzido === 0 && totais.perdido === 0;

  return (
    <div className="tela">
      <h2>Análises</h2>

      {/* Filtros numa linha só, acima de tudo — vale para os números, os
          gráficos e a IA ao mesmo tempo. */}
      <div className="filtros-analise">
        <div className="grupo-periodo">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              className={filtro.dias === p.dias ? "ativa" : ""}
              onClick={() => setFiltro((f) => ({ ...f, dias: p.dias }))}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <div className="grupo-selects">
          <select
            value={filtro.lojaId ?? ""}
            aria-label="Loja"
            onChange={(e) => setFiltro((f) => ({ ...f, lojaId: e.target.value || undefined }))}
          >
            <option value="">Todas as lojas</option>
            {LOJAS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nomeCurto}
              </option>
            ))}
          </select>
          <select
            value={filtro.categoria ?? ""}
            aria-label="Categoria"
            onChange={(e) => setFiltro((f) => ({ ...f, categoria: e.target.value || undefined }))}
          >
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PRODUCAO.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {semDados ? (
        <p className="callout-inline">
          Nenhum dado neste recorte. Amplie o período ou tire os filtros de loja e categoria.
        </p>
      ) : (
        <>
          {/* Números-cabeçalho: três valores, não um gráfico de três barras. */}
          <div className="linha-kpis">
            <div className="kpi">
              <span className="valor-kpi">
                {totais.taxaPerda === null ? "—" : formatarPercentual(totais.taxaPerda)}
              </span>
              <span className="rotulo-kpi">Taxa de perda</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.produzido)}</span>
              <span className="rotulo-kpi">Produzido (un)</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.perdido)}</span>
              <span className="rotulo-kpi">Perdido (un)</span>
            </div>
            <div className="kpi">
              <span className="valor-kpi">{formatar(totais.perdidoQuilos)}</span>
              <span className="rotulo-kpi">Perdido (kg)</span>
            </div>
          </div>

          <GraficoBarras
            titulo="Perda por dia da semana"
            descricao="Percentual, não volume — sábado produz mais que segunda, e sem a taxa a comparação seria injusta. Toque numa barra para ver os números."
            barras={porDia}
            vazio="Ainda não há produção registrada neste recorte."
          />

          <GraficoBarras
            titulo="Perda por semana do mês"
            descricao="Pega efeito de salário, feriado e data comemorativa no movimento."
            barras={porSemana}
            vazio="Ainda não há produção registrada neste recorte."
          />

          <GraficoBarras
            titulo="Produtos que mais desperdiçam"
            descricao="Só itens com pelo menos 20 unidades produzidas no período — abaixo disso a porcentagem é ruído, não padrão."
            barras={porProduto}
            vazio="Nenhum produto com produção suficiente para comparar ainda."
          />
        </>
      )}

      <div className="cartao-insights">
        <div className="cabecalho-insights">
          <h3>✨ Insights e melhorias (IA)</h3>
          <button
            type="button"
            className="secundario"
            disabled={statusInsights === "carregando"}
            onClick={gerarInsights}
          >
            {statusInsights === "carregando" ? "Analisando..." : insights ? "Gerar de novo" : "Analisar"}
          </button>
        </div>
        <p className="nota-rodape">
          Lê os mesmos números da tela — inclusive os padrões por dia e por semana — e aponta o que
          está fora da curva e o que dá para fazer a respeito. Sempre informativo: nunca altera
          cadastro nem cronograma sozinho.
        </p>
        {mensagemInsights && (
          <p
            className={statusInsights === "erro" ? "erro-conversao" : "nota-rodape"}
            role={statusInsights === "erro" ? "alert" : undefined}
          >
            {mensagemInsights}
          </p>
        )}
        {insights && insights.length > 0 && (
          <ul className="lista-insights">
            {insights.map((insight, i) => (
              <li key={i} className={`cartao-insight ${insight.tipo}`}>
                <strong>{insight.titulo}</strong>
                <p>{insight.detalhe}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatar(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
