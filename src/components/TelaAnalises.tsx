/**
 * src/components/TelaAnalises.tsx
 * ---------------------------------------------------------------
 * Consome src/lib/metricas.ts para mostrar taxa de perda por produto,
 * volume de produção por dia da semana e picos de perda.
 */

import { useMemo } from "react";
import type { Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { RegistroPerda } from "../types/perda";
import {
  calcularTaxaPerdaPorProduto,
  calcularVolumeProducaoPorDiaDaSemana,
  identificarPicosDePerda,
} from "../lib/metricas";
import { ORDEM_DIAS, rotuloDoDia } from "../lib/data";

interface TelaAnalisesProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
}

export function TelaAnalises({ produtos, planos, perdas }: TelaAnalisesProps) {
  const taxas = useMemo(() => calcularTaxaPerdaPorProduto(produtos, planos, perdas), [produtos, planos, perdas]);
  const volumes = useMemo(() => calcularVolumeProducaoPorDiaDaSemana(planos), [planos]);
  const picos = useMemo(() => identificarPicosDePerda(produtos, planos, perdas, false), [produtos, planos, perdas]);

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

      <h3>Volume de produção por dia da semana</h3>
      <div className="barras">
        {volumePorDiaOrdenado.map((v) => (
          <div key={v.diaDaSemana} className="linha-barra">
            <span className="rotulo-barra">{rotuloDoDia(v.diaDaSemana)}</span>
            <div className="trilho-barra">
              <div className="barra" style={{ width: `${(v.totalPlanejado / maiorVolume) * 100}%` }} />
            </div>
            <span className="valor-barra">{v.totalPlanejado} kg</span>
          </div>
        ))}
      </div>

      <h3>Taxa de perda por produto</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Produzido (kg)</th>
              <th>Perdido (kg)</th>
              <th>Perda %</th>
            </tr>
          </thead>
          <tbody>
            {taxas.length === 0 && (
              <tr><td colSpan={4} className="vazio">Sem dados de perda ainda.</td></tr>
            )}
            {taxas.slice(0, 30).map((t) => (
              <tr key={t.codigoPdv}>
                <td>{t.nomeProduto}</td>
                <td>{t.totalProduzido}</td>
                <td>{t.totalPerdido}</td>
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
