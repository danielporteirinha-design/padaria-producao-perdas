/**
 * src/components/GraficoBarras.tsx
 * ---------------------------------------------------------------
 * Barras horizontais para comparar taxa de perda entre dias da semana,
 * semanas do mês ou produtos (ago/2026).
 *
 * BARRAS EM HTML/CSS, NÃO SVG NEM BIBLIOTECA
 * -------------------------------------------
 * O app roda em celular com wifi ruim e o pacote já carrega o Firebase.
 * Uma biblioteca de gráficos custaria mais que todo o resto da tela para
 * desenhar retângulos. Em HTML as barras já são responsivas sem cálculo
 * de viewBox, o texto quebra sozinho, e o leitor de tela lê a tabela por
 * baixo — coisas que em SVG dariam trabalho para replicar.
 *
 * VALOR ESCRITO EM CADA BARRA, DE PROPÓSITO
 * ------------------------------------------
 * A recomendação usual é rotular só o extremo e deixar o resto no
 * tooltip. Isso pressupõe mouse. Aqui não existe passar o mouse: é dedo
 * em tela de celular, e um número que só aparece no hover simplesmente
 * não existe para este operador. Com poucas barras e layout horizontal,
 * cabe o valor em todas — e é o único canal confiável.
 *
 * BARRA HORIZONTAL, E NÃO COLUNA
 * -------------------------------
 * "Segunda-feira" e "PÃO DE QUEIJO CONGELADO" não cabem embaixo de uma
 * coluna em tela de celular sem girar o texto. Deitada, o rótulo fica na
 * horizontal e legível.
 *
 * Uma série só por gráfico: sem legenda (o título já diz o que é) e uma
 * cor só para todas as barras — colorir cada barra por tamanho seria
 * codificar duas vezes a mesma informação que o comprimento já dá.
 */

import { useState } from "react";
import { formatarPercentual, type BarraAnalise } from "../lib/analises";

interface GraficoBarrasProps {
  titulo: string;
  descricao?: string;
  barras: BarraAnalise[];
  /** Texto quando não há dado suficiente para desenhar. */
  vazio: string;
}

export function GraficoBarras({ titulo, descricao, barras, vazio }: GraficoBarrasProps) {
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const comValor = barras.filter((b) => b.valor !== null);
  if (comValor.length === 0) {
    return (
      <div className="cartao-grafico">
        <h4>{titulo}</h4>
        <p className="nota-rodape">{vazio}</p>
      </div>
    );
  }

  // A escala vai até o maior valor, não até 100%: taxas de perda vivem
  // entre 2% e 15%, e uma escala fixa em 100 deixaria todas as barras
  // rentes a zero, escondendo exatamente a diferença que interessa.
  const maximo = Math.max(...comValor.map((b) => b.valor ?? 0));
  const maiorValor = maximo > 0 ? maximo : 1;

  return (
    <div className="cartao-grafico">
      <h4>{titulo}</h4>
      {descricao && <p className="nota-rodape">{descricao}</p>}

      <div className="barras">
        {barras.map((barra) => {
          const semDado = barra.valor === null;
          const largura = semDado ? 0 : ((barra.valor ?? 0) / maiorValor) * 100;
          const aberto = detalhe === barra.rotulo;
          return (
            <button
              key={barra.rotulo}
              type="button"
              className={`linha-barra ${aberto ? "aberta" : ""}`}
              onClick={() => setDetalhe(aberto ? null : barra.rotulo)}
              aria-label={`${barra.rotulo}: ${semDado ? "sem produção" : `${formatarPercentual(barra.valor ?? 0)} de perda`}`}
            >
              <span className="rotulo-barra">{barra.rotulo}</span>
              <span className="trilha-barra">
                <span
                  className="preenchimento-barra"
                  style={{ width: `${Math.max(largura, semDado ? 0 : 2)}%` }}
                />
              </span>
              <span className="valor-barra">{semDado ? "—" : formatarPercentual(barra.valor ?? 0)}</span>
            </button>
          );
        })}
      </div>

      {detalhe && (
        <p className="detalhe-barra">
          {(() => {
            const b = barras.find((x) => x.rotulo === detalhe);
            if (!b) return null;
            if (b.valor === null) return `${b.rotulo}: nenhuma produção registrada no período.`;
            return `${b.rotulo}: ${b.perdido} un perdidas de ${b.produzido} un produzidas.`;
          })()}
        </p>
      )}
    </div>
  );
}
