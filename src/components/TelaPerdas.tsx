/**
 * src/components/TelaPerdas.tsx
 * ---------------------------------------------------------------
 * Tela de fim de expediente: escolhe o produto, usa TelaRegistroPerda
 * (já com o cálculo kg -> unidades embutido) e mostra o histórico do dia.
 *
 * A lista de produtos disponível NÃO é só o plano de hoje — cada produto
 * tem seu próprio prazo de validade (ver src/lib/janelaValidade.ts), então
 * uma perda lançada hoje pode vir de uma fornada de vários dias atrás
 * (ex.: confeitaria dura 5 dias). Quando um produto tem mais de uma
 * fornada ainda válida, o operador escolhe qual — ver TelaRegistroPerda.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { calcularCandidatosPerda } from "../lib/janelaValidade";
import { dataDeHojeIso, diaDaSemanaDeData, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  onRegistrarPerda: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    quantidadeQuilos: number;
    pesoUnitarioGramasInformado: number;
    quantidadeUnidadesEstimada: number;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) => Promise<void>;
}

export function TelaPerdas({ produtos, planos, perdas, operador, onRegistrarPerda }: TelaPerdasProps) {
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const hoje = dataDeHojeIso();
  const diaDaSemana = diaDaSemanaDeData(hoje);

  const candidatos = useMemo(() => calcularCandidatosPerda(hoje, produtos, planos), [hoje, produtos, planos]);

  const perdasDeHoje = useMemo(() => perdas.filter((p) => p.data === hoje), [perdas, hoje]);

  const candidatoSelecionado = candidatos.find((c) => c.produto.codigoPdv === codigoSelecionado);

  if (candidatos.length === 0) {
    return (
      <div className="tela">
        <h2>Registro de Perdas</h2>
        <p className="callout-inline">
          Nenhum produto dentro do prazo de validade está disponível para lançar perda hoje
          ({rotuloDoDia(diaDaSemana)}). Isso normalmente significa que ainda não há um cronograma
          confirmado nos últimos dias — o Cronograma de hoje deveria ter sido montado ontem, no fim do
          expediente.
        </p>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {hoje}</p>

      {!candidatoSelecionado ? (
        <div>
          <p>Selecione o produto para lançar a perda:</p>
          <div className="grade-produtos">
            {candidatos.map((c) => (
              <button
                key={c.produto.codigoPdv}
                type="button"
                className="cartao-produto"
                onClick={() => setCodigoSelecionado(c.produto.codigoPdv)}
              >
                {c.produto.nome}
                {c.origens.length > 1 && (
                  <span className="tag-pendente"> · {c.origens.length} fornadas válidas</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className="link" onClick={() => setCodigoSelecionado("")}>
            &larr; escolher outro produto
          </button>
          <TelaRegistroPerda
            produto={candidatoSelecionado.produto}
            origens={candidatoSelecionado.origens}
            registradoPor={operador}
            onSalvar={async (payload) => {
              await onRegistrarPerda(payload);
              setCodigoSelecionado("");
            }}
          />
        </div>
      )}

      <h3>Perdas lançadas hoje</h3>
      <div className="tabela-scroll">
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Peso perdido</th>
              <th>Peso unitário usado</th>
              <th>Unidades (est.)</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {perdasDeHoje.length === 0 && (
              <tr>
                <td colSpan={5} className="vazio">Nenhuma perda registrada ainda hoje.</td>
              </tr>
            )}
            {perdasDeHoje.map((p) => (
              <tr key={p.id}>
                <td>{produtos.find((pr) => pr.codigoPdv === p.codigoPdv)?.nome ?? p.codigoPdv}</td>
                <td>{p.quantidadeQuilos} kg</td>
                <td>{p.pesoUnitarioGramasInformado} g</td>
                <td>{p.quantidadeUnidadesEstimada}</td>
                <td>{p.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
