/**
 * src/components/TelaAnalises.tsx
 * ---------------------------------------------------------------
 * Consome src/lib/metricas.ts para mostrar taxa de perda por produto,
 * volume de produção por dia da semana e picos de perda. Também oferece
 * insights por IA (Gemini) sobre o catálogo — produtos sobrando, parados
 * há muito tempo, ou outros padrões úteis (ver src/lib/insightsCatalogo.ts).
 * Sempre informativo, nunca automático: só aponta padrões para o operador
 * avaliar, não altera nada no cadastro nem no cronograma sozinho.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import {
  calcularTaxaPerdaPorProduto,
  calcularVolumeProducaoPorDiaDaSemana,
  identificarPicosDePerda,
} from "../lib/metricas";
import { ORDEM_DIAS, dataDeHojeIso, rotuloDoDia } from "../lib/data";
import {
  buscarInsightsCatalogo,
  construirResumoParaInsights,
  ErroInsightsCatalogo,
  type InsightCatalogo,
} from "../lib/insightsCatalogo";

interface TelaAnalisesProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
}

export function TelaAnalises({ produtos, planos, perdas }: TelaAnalisesProps) {
  const taxas = useMemo(() => calcularTaxaPerdaPorProduto(produtos, planos, perdas), [produtos, planos, perdas]);
  const volumes = useMemo(() => calcularVolumeProducaoPorDiaDaSemana(planos), [planos]);
  const picos = useMemo(() => identificarPicosDePerda(produtos, planos, perdas, false), [produtos, planos, perdas]);

  const [insights, setInsights] = useState<InsightCatalogo[] | null>(null);
  const [statusInsights, setStatusInsights] = useState<"" | "carregando" | "erro">("");
  const [mensagemInsights, setMensagemInsights] = useState("");

  async function gerarInsights() {
    setStatusInsights("carregando");
    setMensagemInsights("");
    try {
      const resumo = construirResumoParaInsights(produtos, planos, perdas, dataDeHojeIso());
      if (resumo.length === 0) {
        setStatusInsights("");
        setInsights([]);
        setMensagemInsights("Nenhum produto ativo das categorias de produção para analisar ainda.");
        return;
      }
      const resultado = await buscarInsightsCatalogo(resumo);
      setInsights(resultado);
      setStatusInsights("");
      setMensagemInsights(resultado.length === 0 ? "A IA não encontrou padrões confiáveis com os dados atuais." : "");
    } catch (erro) {
      setStatusInsights("erro");
      setInsights(null);
      setMensagemInsights(
        erro instanceof ErroInsightsCatalogo ? erro.message : "Não foi possível gerar os insights agora."
      );
    }
  }

  const volumePorDiaOrdenado = ORDEM_DIAS.map(
    (dia) => volumes.find((v) => v.diaDaSemana === dia) ?? { diaDaSemana: dia, totalPlanejado: 0, numeroDePlanos: 0 }
  );
  const maiorVolume = Math.max(1, ...volumePorDiaOrdenado.map((v) => v.totalPlanejado));

  if (planos.length === 0) {
    return (
      <div className="tela">
        <h2>Análises</h2>
        <p className="callout-inline">
          Ainda não há planos de produção confirmados — as análises aparecem aqui assim que o
          Cronograma e as Perdas tiverem pelo menos alguns dias registrados.
        </p>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Análises</h2>

      <div className="cartao-insights">
        <div className="cabecalho-insights">
          <h3>✨ Insights do catálogo (IA)</h3>
          <button type="button" className="secundario" disabled={statusInsights === "carregando"} onClick={gerarInsights}>
            {statusInsights === "carregando" ? "Analisando..." : insights ? "Gerar de novo" : "Gerar insights com IA"}
          </button>
        </div>
        <p className="nota-rodape">
          Analisa o histórico dos últimos ~60 dias para apontar produtos que estão sobrando (perda por
          sobra alta), produtos ativos parados há muito tempo, ou outros padrões úteis. Sempre
          informativo — nunca pausa produto nem altera o cadastro sozinho, só o operador decide.
        </p>
        {mensagemInsights && (
          <p className={statusInsights === "erro" ? "erro-conversao" : "nota-rodape"} role={statusInsights === "erro" ? "alert" : undefined}>
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

      <h3>Volume de produção por dia da semana</h3>
      <div className="barras">
        {volumePorDiaOrdenado.map((v) => (
          <div key={v.diaDaSemana} className="linha-barra">
            <span className="rotulo-barra">{rotuloDoDia(v.diaDaSemana)}</span>
            <div className="trilho-barra">
              <div className="barra" style={{ width: `${(v.totalPlanejado / maiorVolume) * 100}%` }} />
            </div>
            <span className="valor-barra">{v.totalPlanejado} un</span>
          </div>
        ))}
      </div>

      <h3>Taxa de perda por produto</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Produzido (un)</th>
              <th>Perdido (un)</th>
              <th>Perdido (kg)</th>
              <th>Perda %</th>
            </tr>
          </thead>
          <tbody>
            {taxas.length === 0 && (
              <tr><td colSpan={5} className="vazio">Sem dados de perda ainda.</td></tr>
            )}
            {taxas.slice(0, 30).map((t) => (
              <tr key={t.codigoPdv}>
                <td>{t.nomeProduto}</td>
                <td>{t.totalProduzido}</td>
                <td>{t.totalPerdido}</td>
                <td>{t.totalPerdidoQuilos} kg</td>
                <td className={t.perdaPercentual >= 15 ? "perda-alta" : t.perdaPercentual > 0 ? "perda-media" : ""}>
                  {t.perdaPercentual}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Picos de perda por dia da semana</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Perda % média</th>
            </tr>
          </thead>
          <tbody>
            {picos.length === 0 && (
              <tr><td colSpan={2} className="vazio">Sem dados suficientes ainda.</td></tr>
            )}
            {picos.slice(0, 7).map((p) => (
              <tr key={p.diaDaSemana}>
                <td>{rotuloDoDia(p.diaDaSemana)}</td>
                <td className={p.perdaPercentualMedia >= 15 ? "perda-alta" : ""}>{p.perdaPercentualMedia}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
