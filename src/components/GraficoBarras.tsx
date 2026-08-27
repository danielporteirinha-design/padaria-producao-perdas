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

/**
 * Como escrever o valor da barra. Os gráficos de perda plotam TAXA; os de
 * fornada plotam CONTAGEM MÉDIA POR DIA. Escrever "3,2%" onde o dado é
 * "3,2 fornadas por dia" não é um detalhe de formatação — é um número
 * errado na tela.
 */
export type FormatoDaBarra = "percentual" | "media";

interface GraficoBarrasProps {
  titulo: string;
  descricao?: string;
  barras: BarraAnalise[];
  /** Texto quando não há dado suficiente para desenhar. */
  vazio: string;
  /** Padrão: percentual (os três gráficos de perda). */
  formato?: FormatoDaBarra;
  /**
   * Sufixo colado no valor do formato "media" — ex.: "/dia". Curto de
   * propósito: em tela de 390px, "por dia" repetido em toda barra rouba
   * largura da própria barra, que é o dado.
   */
  sufixo?: string;
}

export function GraficoBarras({
  titulo,
  descricao,
  barras,
  vazio,
  formato = "percentual",
  sufixo = "",
}: GraficoBarrasProps) {
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const escrever = (valor: number): string =>
    formato === "percentual"
      ? formatarPercentual(valor)
      : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${sufixo}`;

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
          // Zero de verdade não ganha o traço mínimo. O piso de 2% existe
          // para que uma taxa baixíssima ainda se veja; usá-lo em quem
          // marcou ZERO fornada desenharia atividade onde não houve
          // nenhuma — exatamente o buraco no dia que o gráfico serve para
          // denunciar.
          const zerado = barra.valor === 0;
          const largura = semDado ? 0 : ((barra.valor ?? 0) / maiorValor) * 100;
          const aberto = detalhe === barra.rotulo;
          return (
            <button
              key={barra.rotulo}
              type="button"
              className={`linha-barra ${aberto ? "aberta" : ""}`}
              onClick={() => setDetalhe(aberto ? null : barra.rotulo)}
              // Leitor de tela recebe a frase inteira quando ela existe:
              // "3,2/dia" vira "três vírgula dois barra dia" na fala, que
              // não informa nada.
              aria-label={
                barra.detalhe ??
                `${barra.rotulo}: ${semDado ? "sem dados no período" : escrever(barra.valor ?? 0)}`
              }
            >
              <span className="rotulo-barra">{barra.rotulo}</span>
              <span className="trilha-barra">
                <span
                  className="preenchimento-barra"
                  style={{ width: `${semDado || zerado ? 0 : Math.max(largura, 2)}%` }}
                />
              </span>
              <span className="valor-barra">{semDado ? "—" : escrever(barra.valor ?? 0)}</span>
            </button>
          );
        })}
      </div>

      {detalhe && (
        <p className="detalhe-barra">
          {(() => {
            const b = barras.find((x) => x.rotulo === detalhe);
            if (!b) return null;
            // A barra que sabe contar a própria história tem prioridade:
            // fornada conta EVENTOS, e "un perdidas de un produzidas"
            // descreveria outro gráfico.
            if (b.detalhe) return b.detalhe;
            if (b.valor === null) return `${b.rotulo}: nenhuma produção registrada no período.`;
            return `${b.rotulo}: ${b.perdido} un perdidas de ${b.produzido} un produzidas.`;
          })()}
        </p>
      )}
    </div>
  );
}
