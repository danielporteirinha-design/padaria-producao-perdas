/**
 * src/components/TelaPerdas.tsx
 * ---------------------------------------------------------------
 * Escolhe o produto, usa TelaRegistroPerda (já com o cálculo kg ->
 * unidades embutido) e mostra o histórico do dia. Serve tanto para o
 * lançamento de fim de expediente quanto para uma perda no meio do dia —
 * fornada queimada ou fora do padrão tem que ser lançada na hora.
 *
 * Perda NÃO é sinônimo de vencimento: um produto pode sair do forno fora
 * do padrão e virar perda no mesmo dia. Por isso a lista aqui traz todo
 * produto que já foi produzido em alguma ocasião, e não só os que estão
 * dentro do prazo — o prazo serve para identificar de qual fornada a
 * perda veio, nunca para autorizar o lançamento (ver janelaValidade.ts).
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { calcularCandidatosPerda } from "../lib/janelaValidade";
import { ConfirmarProducao } from "./ConfirmarProducao";
import { dataDeHojeIso, diaDaSemanaDeData, formatarDataBr, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  planos: PlanoDeProducaoDiario[];
  perdas: RegistroPerda[];
  operador: string;
  /** Confirma o que realmente saiu do forno no plano de hoje (ver ConfirmarProducao.tsx). */
  onConfirmarProducao: (planoId: string, codigosNaoProduzidos: number[]) => Promise<void>;
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

export function TelaPerdas({
  produtos,
  planos,
  perdas,
  operador,
  onConfirmarProducao,
  onRegistrarPerda,
}: TelaPerdasProps) {
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const hoje = dataDeHojeIso();
  const diaDaSemana = diaDaSemanaDeData(hoje);

  const candidatos = useMemo(() => calcularCandidatosPerda(hoje, produtos, planos), [hoje, produtos, planos]);

  // Plano de HOJE já confirmado — é o que pode ter a produção real conferida.
  const planoDeHoje = useMemo(
    () => planos.find((p) => p.data === hoje && p.status === "confirmado"),
    [planos, hoje]
  );

  const blocoConfirmacao = planoDeHoje ? (
    <ConfirmarProducao
      plano={planoDeHoje}
      produtos={produtos}
      operador={operador}
      onConfirmar={(codigos) => onConfirmarProducao(planoDeHoje.id, codigos)}
    />
  ) : null;

  const perdasDeHoje = useMemo(() => perdas.filter((p) => p.data === hoje), [perdas, hoje]);

  const candidatoSelecionado = candidatos.find((c) => c.produto.codigoPdv === codigoSelecionado);

  if (candidatos.length === 0) {
    return (
      <div className="tela">
        <h2>Registro de Perdas</h2>
        {blocoConfirmacao}
        <p className="callout-inline">
          Ainda não há nenhuma fornada confirmada no app, então não existe produção à qual atribuir
          uma perda. Isso não tem relação com prazo de validade — assim que existir um cronograma
          confirmado, qualquer item dele pode ser lançado como perda, inclusive no mesmo dia em que
          foi produzido.
          <br />
          <br />
          Se a padaria já produziu hoje ({rotuloDoDia(diaDaSemana)}) sem passar pelo app, vá em{" "}
          <strong>Cronograma</strong> → <strong>planejar para outra data</strong>, escolha hoje,
          registre o que foi produzido e confirme. Os itens passam a aparecer aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {hoje}</p>

      {blocoConfirmacao}

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
                {c.origens.length === 0 && (
                  <span className="tag-sem-fornada">
                    {" "}
                    · última produção {formatarDataBr(c.ultimaProducao)}
                  </span>
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
