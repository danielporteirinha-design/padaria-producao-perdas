/**
 * src/components/TelaRegistroPerda.tsx
 * ---------------------------------------------------------------
 * Lançamento de perda de fim de expediente.
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { MotivoPerda } from "../types/perda";
import { calcularPerdaEmUnidades, ErroConversaoPerda } from "../lib/conversao";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import type { OrigemCandidata } from "../lib/janelaValidade";
import { formatarDataBr } from "../lib/data";
import { AssistenteDeVoz } from "./AssistenteDeVoz";

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
  produtos?: Produto[];
  origens: OrigemCandidata[];
  registradoPor: string;
  onSelecionarProdutoPorVoz?: (produto: Produto, quantidade?: number) => void;
  onSalvar: (payload: {
    codigoPdv: number;
    planoDeProducaoId: string;
    quantidadeQuilos: number;
    pesoUnitarioGramasInformado: number;
    quantidadeUnidadesEstimada: number;
    motivo: MotivoPerda;
    observacao?: string;
    registradoPor: string;
  }) => void;
}

export function TelaRegistroPerda({
  produto,
  produtos = [],
  origens,
  registradoPor,
  onSelecionarProdutoPorVoz,
  onSalvar,
}: TelaRegistroPerdaProps) {
  const [planoDeProducaoId, setPlanoDeProducaoId] = useState(origens[0]?.planoDeProducaoId ?? "");
  const [quilos, setQuilos] = useState("");
  const [unidadesDiretas, setUnidadesDiretas] = useState("");
  const [pesoUnitario, setPesoUnitario] = useState(
    produto.pesoMedioUnitarioGramas ? String(produto.pesoMedioUnitarioGramas) : ""
  );
  const [motivo, setMotivo] = useState<MotivoPerda>("sobra_nao_vendida");
  const [observacao, setObservacao] = useState("");

  const possuiPesoCadastrado = Boolean(produto.pesoMedioUnitarioGramas && produto.pesoMedioUnitarioGramas > 0);

  const quilosValidos = ehNumeroValidoPositivo(quilos);
  const pesoValido = ehNumeroValidoPositivo(pesoUnitario);
  const unidadesValidas = ehNumeroValidoPositivo(unidadesDiretas);

  const preview = useMemo(() => {
    if (!possuiPesoCadastrado) {
      if (!unidadesValidas) return null;
      const qtd = paraNumero(unidadesDiretas);
      return {
        ok: true as const,
        resultado: {
          quantidadeQuilos: 0,
          pesoUnitarioGramasInformado: 0,
          quantidadeUnidadesEstimada: qtd,
        },
      };
    }

    if (!quilosValidos || !pesoValido) return null;
    try {
      const resultado = calcularPerdaEmUnidades(produto, paraNumero(quilos), paraNumero(pesoUnitario));
      return { ok: true as const, resultado };
    } catch (erro) {
      if (erro instanceof ErroConversaoPerda) {
        return { ok: false as const, mensagem: erro.message };
      }
      return { ok: false as const, mensagem: "Erro ao calcular a perda em unidades." };
    }
  }, [produto, quilos, pesoUnitario, unidadesDiretas, possuiPesoCadastrado, quilosValidos, pesoValido, unidadesValidas]);

  const exigeFornadaDeOrigem = origens.length > 0;
  const podeSalvar = preview?.ok === true && (!exigeFornadaDeOrigem || planoDeProducaoId !== "");
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!podeSalvar || preview?.ok !== true) return;
    setSalvando(true);
    try {
      await onSalvar({
        codigoPdv: produto.codigoPdv,
        planoDeProducaoId,
        quantidadeQuilos: preview.resultado.quantidadeQuilos,
        pesoUnitarioGramasInformado: preview.resultado.pesoUnitarioGramasInformado,
        quantidadeUnidadesEstimada: preview.resultado.quantidadeUnidadesEstimada,
        motivo,
        observacao: observacao || undefined,
        registradoPor,
      });
    } catch {
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="tela-registro-perda layout-cartao">
      {produtos.length > 0 && onSelecionarProdutoPorVoz && (
        <AssistenteDeVoz
          produtos={produtos}
          modo="pedir"
          onConfirmar={async (itens) => { // CORREÇÃO: ADICIONADO async AQUI
            if (itens && itens.length > 0) {
              const item = itens[0];
              onSelecionarProdutoPorVoz(item.produto, item.quantidade ?? undefined);
              if (item.quantidade) {
                setUnidadesDiretas(String(item.quantidade));
              }
            }
          }}
        />
      )}

      <h2 className="titulo-produto">{produto.nome}</h2>

      {origens.length === 0 && (
        <p className="callout-inline aviso-origem">
          Nenhuma fornada deste produto está dentro do prazo hoje. A perda vai ser registrada mesmo assim.
        </p>
      )}

      <div className="formulario-campos">
        {origens.length > 1 && (
          <label className="campo-label">
            <span className="texto-label">Produzido em</span>
            <select className="campo-input" value={planoDeProducaoId} onChange={(e) => setPlanoDeProducaoId(e.target.value)}>
              {origens.map((o) => (
                <option key={o.planoDeProducaoId} value={o.planoDeProducaoId}>
                  {formatarDataBr(o.data)} — há {o.diasDesdeProducao === 0 ? "menos de 1 dia" : `${o.diasDesdeProducao} dia(s)`}
                </option>
              ))}
            </select>
          </label>
        )}

        {!possuiPesoCadastrado ? (
          <label className="campo-label">
            <span className="texto-label">Quantidade de itens perdida (unidades)</span>
            <div className="campo-valor com-unidade">
              <input
                type="text"
                className="campo-input input-numerico"
                inputMode="numeric"
                pattern="[0-9]*"
                value={unidadesDiretas}
                onChange={(e) => setUnidadesDiretas(sanitizarEntradaNumerica(e.target.value))}
                placeholder="Ex: 10"
                aria-label="Quantidade de itens perdida em unidades"
                autoFocus
              />
              <span className="unidade-fixa">un</span>
            </div>
            <span className="nota-rodape">
              Este produto não possui peso médio unitário cadastrado. Informe a quantidade de itens a retirar do balcão.
            </span>
          </label>
        ) : (
          <>
            <label className="campo-label">
              <span className="texto-label">Peso perdido (balança)</span>
              <div className="campo-valor com-unidade">
                <input
                  type="text"
                  className="campo-input input-numerico"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={quilos}
                  onChange={(e) => setQuilos(sanitizarEntradaNumerica(e.target.value))}
                  placeholder="0"
                  aria-label="Peso perdido em quilos"
                  autoFocus
                />
                <span className="unidade-fixa">kg</span>
              </div>
            </label>

            <label className="campo-label">
              <span className="texto-label">Peso de 1 unidade desta fornada</span>
              <div className="campo-valor com-unidade">
                <input
                  type="text"
                  className="campo-input input-numerico"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={pesoUnitario}
                  onChange={(e) => setPesoUnitario(sanitizarEntradaNumerica(e.target.value))}
                  placeholder="0"
                  aria-label="Peso de 1 unidade em gramas"
                />
                <span className="unidade-fixa">g</span>
              </div>
            </label>
          </>
        )}

        {preview?.ok === true && (
          <div className="preview-conversao destaque-sucesso">
            ≈ {preview.resultado.quantidadeUnidadesEstimada} unidade(s) perdida(s)
          </div>
        )}
        {preview?.ok === false && (
          <div className="erro-conversao destaque-erro" role="alert">
            {preview.mensagem}
          </div>
        )}

        <label className="campo-label">
          <span className="texto-label">Motivo do descarte</span>
          <select className="campo-input" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoPerda)}>
            {MOTIVOS.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="campo-label">
          <span className="texto-label">Observação (opcional)</span>
          <textarea
            className="campo-input"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Detalhes adicionais..."
            rows={3}
          />
        </label>
      </div>

      <button
        type="button"
        className="primario botao-largo"
        disabled={!podeSalvar || salvando}
        onClick={handleSalvar}
      >
        {salvando ? "Registrando..." : "Registrar perda"}
      </button>
    </div>
  );
}