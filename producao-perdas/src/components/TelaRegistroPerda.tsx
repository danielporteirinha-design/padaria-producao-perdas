/**
 * src/components/TelaRegistroPerda.tsx
 * ---------------------------------------------------------------
 * Lançamento de perda de fim de expediente: o operador PESA o item
 * descartado na balança (quilos) e informa o peso de 1 unidade daquele
 * item — o app deriva ao vivo quantas unidades a perda representa (ver
 * src/lib/conversao.ts). O peso de 1 unidade vem pré-preenchido do
 * cadastro do produto quando existe (editável, porque pode variar de
 * fornada para fornada); ao salvar, esse valor retroalimenta o cadastro
 * (ver src/App.tsx).
 */

import { useMemo, useState } from "react";
import type { Produto } from "../types/produto";
import type { MotivoPerda } from "../types/perda";
import { calcularPerdaEmUnidades, ErroConversaoPerda } from "../lib/conversao";
import { ehNumeroValidoPositivo, paraNumero, sanitizarEntradaNumerica } from "../lib/numeros";
import type { OrigemCandidata } from "../lib/janelaValidade";
import { formatarDataBr } from "../lib/data";

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
  /**
   * Fornadas ainda dentro do prazo, da mais antiga para a mais nova (ver
   * janelaValidade.ts). Pode vir VAZIO — o produto já foi produzido antes
   * mas nenhuma fornada está dentro do prazo agora. Nesse caso a perda é
   * registrada sem fornada de origem identificada, e não é bloqueada:
   * perda não é sinônimo de vencimento.
   */
  origens: OrigemCandidata[];
  registradoPor: string;
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
  origens,
  registradoPor,
  onSalvar,
}: TelaRegistroPerdaProps) {
  // A mais antiga vem pré-selecionada (FIFO — descarta-se o lote mais velho primeiro).
  const [planoDeProducaoId, setPlanoDeProducaoId] = useState(origens[0]?.planoDeProducaoId ?? "");
  const [quilos, setQuilos] = useState("");
  const [pesoUnitario, setPesoUnitario] = useState(
    produto.pesoMedioUnitarioGramas ? String(produto.pesoMedioUnitarioGramas) : ""
  );
  const [motivo, setMotivo] = useState<MotivoPerda>("sobra_nao_vendida");
  const [observacao, setObservacao] = useState("");

  const quilosValidos = ehNumeroValidoPositivo(quilos);
  const pesoValido = ehNumeroValidoPositivo(pesoUnitario);

  const preview = useMemo(() => {
    if (!quilosValidos || !pesoValido) return null;
    try {
      const resultado = calcularPerdaEmUnidades(produto, paraNumero(quilos), paraNumero(pesoUnitario));
      return { ok: true as const, resultado };
    } catch (erro) {
      if (erro instanceof ErroConversaoPerda) {
        return { ok: false as const, mensagem: erro.message };
      }
      return { ok: false as const, mensagem: "Erro inesperado ao calcular a perda em unidades." };
    }
  }, [produto, quilos, pesoUnitario, quilosValidos, pesoValido]);

  // A fornada de origem só é obrigatória quando existe alguma para escolher.
  // Produto já produzido antes, mas sem fornada dentro do prazo, é lançado
  // sem vínculo de fornada — perda não é sinônimo de vencimento e não pode
  // ficar bloqueada por não haver lote atribuível (ver janelaValidade.ts).
  const exigeFornadaDeOrigem = origens.length > 0;
  const podeSalvar =
    preview?.ok === true && (!exigeFornadaDeOrigem || planoDeProducaoId !== "");

  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (!podeSalvar || preview?.ok !== true) return;
    setSalvando(true);
    try {
      // Precisa AGUARDAR: antes era disparo sem espera, então uma
      // gravação recusada pelo banco virava rejeição não tratada e o
      // operador achava que a perda tinha sido lançada.
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
      // Mantém os valores na tela para o operador tentar de novo sem
      // repesar o produto. A mensagem vem do aviso global (App.tsx).
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="tela-registro-perda">
      <h2>{produto.nome}</h2>

      {origens.length === 0 && (
        <p className="callout-inline">
          Nenhuma fornada deste produto está dentro do prazo hoje. A perda vai ser registrada mesmo
          assim, sem fornada de origem identificada — as análises tratam esse caso à parte para não
          distorcer a taxa de perda.
        </p>
      )}

      {origens.length > 1 && (
        <label>
          Produzido em
          <select value={planoDeProducaoId} onChange={(e) => setPlanoDeProducaoId(e.target.value)}>
            {origens.map((o) => (
              <option key={o.planoDeProducaoId} value={o.planoDeProducaoId}>
                {formatarDataBr(o.data)} — há {o.diasDesdeProducao === 0 ? "menos de 1 dia" : `${o.diasDesdeProducao} dia(s)`}
              </option>
            ))}
          </select>
          <span className="nota-rodape">
            Este produto tem mais de uma fornada ainda dentro da validade — a mais antiga já vem
            selecionada (descarte o lote mais velho primeiro).
          </span>
        </label>
      )}

      <label>
        Peso perdido (balança)
        <div className="campo-valor">
          <input
            type="text"
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

      <label>
        Peso de 1 unidade desta fornada
        <div className="campo-valor">
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            value={pesoUnitario}
            onChange={(e) => setPesoUnitario(sanitizarEntradaNumerica(e.target.value))}
            placeholder="0"
            aria-label="Peso de 1 unidade em gramas"
          />
          <span className="unidade-fixa">g</span>
        </div>
        <span className="nota-rodape">
          {produto.pesoMedioUnitarioGramas
            ? "Valor sugerido do cadastro — ajuste se esta fornada pesou diferente. O cadastro é atualizado com o que você informar aqui."
            : "Ainda não há peso cadastrado para este produto — o valor informado aqui vira o cadastro inicial."}
        </span>
      </label>

      {/* Preview em tempo real — nunca deixa o operador "no escuro" */}
      {preview?.ok === true && (
        <p className="preview-conversao">
          ≈ {preview.resultado.quantidadeUnidadesEstimada} unidade(s) perdida(s)
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

      <button
        type="button"
        className="primario"
        disabled={!podeSalvar || salvando}
        onClick={handleSalvar}
      >
        {salvando ? "Registrando..." : "Registrar perda"}
      </button>
    </div>
  );
}
