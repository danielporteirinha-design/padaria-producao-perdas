/**
 * src/components/TelaPerdas.tsx
 * ---------------------------------------------------------------
 * Tela de fim de expediente: escolhe o produto, usa TelaRegistroPerda
 * (já com a conversão kg/un embutida) e mostra o histórico do dia.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { RegistroPerda } from "../types/perda";
import type { PlanoDeProducaoDiario } from "../types/producao";
import { TelaRegistroPerda } from "./TelaRegistroPerda";
import { dataDeHojeIso, diaDaSemanaDeData, rotuloDoDia } from "../lib/data";

interface TelaPerdasProps {
  produtos: Produto[];
  perdas: RegistroPerda[];
  planoDeHoje: PlanoDeProducaoDiario | undefined;
  operador: string;
  onRegistrarPerda: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    entradaBruta: { valor: number; unidade: "un" | "kg" };
    quantidadeNormalizada: number;
    unidadeNormalizada: string;
    fatorConversaoAplicado: boolean;
    motivo: RegistroPerda["motivo"];
    observacao?: string;
    registradoPor: string;
  }) => Promise<void>;
}

export function TelaPerdas({ produtos, perdas, planoDeHoje, operador, onRegistrarPerda }: TelaPerdasProps) {
  const [codigoSelecionado, setCodigoSelecionado] = useState<number | "">("");

  const hoje = dataDeHojeIso();
  const diaDaSemana = diaDaSemanaDeData(hoje);

  const produtosDoPlano = useMemo(() => {
    if (!planoDeHoje) return [];
    const codigos = new Set(planoDeHoje.sessoes.flatMap((s) => s.itens.map((i) => i.codigoPdv)));
    return produtos.filter((p) => codigos.has(p.codigoPdv));
  }, [produtos, planoDeHoje]);

  const perdasDeHoje = useMemo(() => perdas.filter((p) => p.data === hoje), [perdas, hoje]);

  const produtoSelecionado = produtos.find((p) => p.codigoPdv === codigoSelecionado);

  if (!planoDeHoje) {
    return (
      <div className="tela">
        <h2>Registro de Perdas</h2>
        <p className="callout-inline">
          Ainda não há um plano de produção confirmado para hoje ({rotuloDoDia(diaDaSemana)}). Registre o
          Cronograma do dia primeiro — a tela de Perdas trabalha em cima dos produtos planejados.
        </p>
      </div>
    );
  }

  return (
    <div className="tela">
      <h2>Registro de Perdas</h2>
      <p className="subtitulo">{rotuloDoDia(diaDaSemana)}, {hoje}</p>

      {!produtoSelecionado ? (
        <div>
          <p>Selecione o produto para lançar a perda:</p>
          <div className="grade-produtos">
            {produtosDoPlano.map((p) => (
              <button key={p.codigoPdv} type="button" className="cartao-produto" onClick={() => setCodigoSelecionado(p.codigoPdv)}>
                {p.nome}
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
            produto={produtoSelecionado}
            planoDeProducaoId={planoDeHoje.id}
            registradoPor={operador}
            onSalvar={async (payload) => {
              await onRegistrarPerda(payload);
              setCodigoSelecionado("");
            }}
          />
        </div>
      )}

      <h3>Perdas lançadas hoje</h3>
      <table className="tabela-simples">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Lançado</th>
            <th>Normalizado</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {perdasDeHoje.length === 0 && (
            <tr>
              <td colSpan={4} className="vazio">Nenhuma perda registrada ainda hoje.</td>
            </tr>
          )}
          {perdasDeHoje.map((p) => (
            <tr key={p.id}>
              <td>{produtos.find((pr) => pr.codigoPdv === p.codigoPdv)?.nome ?? p.codigoPdv}</td>
              <td>{p.entradaBruta.valor} {p.entradaBruta.unidade}</td>
              <td>{p.quantidadeNormalizada} {p.unidadeNormalizada}{p.fatorConversaoAplicado ? " (convertido)" : ""}</td>
              <td>{p.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
