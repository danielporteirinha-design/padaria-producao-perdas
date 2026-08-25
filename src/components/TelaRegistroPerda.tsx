/**
 * src/components/TelaRegistroPerda.tsx
 * ---------------------------------------------------------------
 * Tela ágil de lançamento de perda, fim de expediente.
 * Demonstra o uso de normalizarQuantidadePerda() com preview em
 * tempo real e tratamento de erro visível ao operador (nunca falha
 * silenciosamente nem permite salvar um dado inconsistente).
 *
 * Este componente é um EXEMPLO FUNCIONAL de referência — a app real
 * deve substituir o array `produtosMock` por dados vindos do backend
 * (ver README.md, seção "Camada de dados").
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { MotivoPerda, UnidadeEntradaPerda } from "../types/perda";
import { normalizarQuantidadePerda, ErroConversaoPerda } from "../lib/conversao";

const MOTIVOS: { valor: MotivoPerda; rotulo: string }[] = [
  { valor: "queimado", rotulo: "Queimado / erro de forno" },
  { valor: "erro_producao", rotulo: "Erro de produção" },
  { valor: "validade_vencida", rotulo: "Validade vencida" },
  { valor: "quebra_transporte", rotulo: "Quebra / transporte" },
  { valor: "sobra_nao_vendida", rotulo: "Sobra não vendida" },
  { valor: "outro", rotulo: "Outro" },
];

interface TelaRegistroPerdaProps {
  produto: Produto;
  planoDeProducaoId: string;
  registradoPor: string;
  onSalvar: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    entradaBruta: { valor: number; unidade: UnidadeEntradaPerda };
    quantidadeNormalizada: number;
    unidadeNormalizada: string;
    fatorConversaoAplicado: boolean;
    motivo: MotivoPerda;
    observacao?: string;
    registradoPor: string;
  }) => void;
}

export function TelaRegistroPerda({
  produto,
  planoDeProducaoId,
  registradoPor,
  onSalvar,
}: TelaRegistroPerdaProps) {
  // "kg" sempre disponível (pesar na balança nunca precisa de cadastro prévio);
  // "un" só aparece quando o peso médio está cadastrado, senão não há como converter.
  const unidadesDisponiveis: UnidadeEntradaPerda[] =
    produto.pesoMedioUnitarioGramas && produto.pesoMedioUnitarioGramas > 0 ? ["kg", "un"] : ["kg"];

  const [valor, setValor] = useState<string>("");
  const [unidadeEntrada, setUnidadeEntrada] = useState<UnidadeEntradaPerda>(
    unidadesDisponiveis[0]
  );
  const [motivo, setMotivo] = useState<MotivoPerda>("sobra_nao_vendida");
  const [observacao, setObservacao] = useState("");

  const valorNumerico = Number(valor.replace(",", "."));
  const valorValido = valor !== "" && Number.isFinite(valorNumerico) && valorNumerico >= 0;

  const preview = useMemo(() => {
    if (!valorValido) return null;
    try {
      const resultado = normalizarQuantidadePerda(produto, valorNumerico, unidadeEntrada);
      return { ok: true as const, resultado };
    } catch (erro) {
      if (erro instanceof ErroConversaoPerda) {
        return { ok: false as const, mensagem: erro.message };
      }
      return { ok: false as const, mensagem: "Erro inesperado ao calcular a conversão." };
    }
  }, [produto, valorNumerico, unidadeEntrada, valorValido]);

  const podeSalvar = valorValido && preview?.ok === true;

  function handleSalvar() {
    if (!podeSalvar || preview?.ok !== true) return;
    onSalvar({
      codigoPdv: produto.codigoPdv,
      planoDeProducaoId,
      entradaBruta: { valor: valorNumerico, unidade: unidadeEntrada },
      quantidadeNormalizada: preview.resultado.quantidadeNormalizada,
      unidadeNormalizada: preview.resultado.unidadeNormalizada,
      fatorConversaoAplicado: preview.resultado.fatorConversaoAplicado,
      motivo,
      observacao: observacao || undefined,
      registradoPor,
    });
  }

  return (
    <div className="tela-registro-perda">
      <h2>{produto.nome}</h2>

      <div className="campo-valor">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="0"
          aria-label="Quantidade perdida"
        />

        {unidadesDisponiveis.length > 1 ? (
          <div className="toggle-unidade" role="group" aria-label="Unidade de lançamento">
            {unidadesDisponiveis.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unidadeEntrada === u}
                onClick={() => setUnidadeEntrada(u)}
              >
                {u}
              </button>
            ))}
          </div>
        ) : (
          <span className="unidade-fixa">{unidadesDisponiveis[0]}</span>
        )}
      </div>

      {/* Preview em tempo real da conversão — nunca deixa o operador "no escuro" */}
      {preview?.ok === true && preview.resultado.fatorConversaoAplicado && (
        <p className="preview-conversao">
          ≈ {preview.resultado.quantidadeNormalizada} {preview.resultado.unidadeNormalizada}{" "}
          (convertido automaticamente)
        </p>
      )}
      {preview?.ok === false && <p className="erro-conversao" role="alert">{preview.mensagem}</p>}

      <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoPerda)}>
        {MOTIVOS.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.rotulo}
          </option>
        ))}
      </select>

      <textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="Observação (opcional)"
      />

      <button type="button" disabled={!podeSalvar} onClick={handleSalvar}>
        Registrar perda
      </button>
    </div>
  );
}
