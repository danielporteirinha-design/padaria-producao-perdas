/**
 * src/components/PainelPedidosFiliais.tsx
 * ---------------------------------------------------------------
 * Indicador de "quem já mandou o pedido", no topo do Cronograma da
 * matriz (Parte B, ago/2026).
 *
 * Resolve um risco operacional concreto: a matriz monta o cronograma no
 * fim do expediente, e se uma filial atrasar o envio a produção sai sem
 * ela — a loja abre no dia seguinte sem mercadoria e ninguém percebeu a
 * tempo. O indicador põe isso na frente do operador ANTES de confirmar.
 *
 * Não bloqueia a confirmação de propósito: pode ser tarde, a filial pode
 * não ter o que pedir, e travar o cronograma da padaria inteira por causa
 * de uma loja seria pior. O que se garante é que ninguém confirme sem ter
 * visto que faltava alguém.
 *
 * O desenho é de CARTÃO por loja, não de linha de tabela (ago/2026): a
 * primeira versão era compacta demais e exigia leitura para entender o
 * estado. Cada loja agora ocupa um bloco com cor de fundo própria — verde
 * ou âmbar — e o estado se lê pela cor, antes de ler a palavra.
 */

import type { PedidoFilial } from "../types/pedido";

/**
 * Quantas VARIEDADES o pedido tem, não quantas unidades (ago/2026): "195
 * unidades" não diz nada a quem confere de relance, enquanto "12
 * produtos" dá a dimensão da lista que vai chegar para separar.
 */
function variedadesDoPedido(pedido: PedidoFilial | undefined): number {
  return pedido?.itens.length ?? 0;
}
import { FILIAIS } from "../lib/lojas";
import { IconeAtencao, IconeConfere } from "./Icones";

interface PainelPedidosFiliaisProps {
  pedidos: PedidoFilial[];
  data: string;
  /** Reposições pedidas HOJE — urgentes, aparecem em destaque à parte. */
  reposicoesDeHoje?: PedidoFilial[];
  nomeDoProduto?: (codigoPdv: number) => string;
}

export function PainelPedidosFiliais({
  pedidos,
  data,
  reposicoesDeHoje = [],
  nomeDoProduto,
}: PainelPedidosFiliaisProps) {
  const situacao = FILIAIS.map((filial) => {
    const pedido = pedidos.find(
      (p) => p.data === data && p.lojaId === filial.id && p.tipo !== "reposicao"
    );
    return { filial, pedido, enviado: pedido?.status === "enviado" };
  });

  const faltando = situacao.filter((s) => !s.enviado);

  return (
    <div className="painel-pedidos">
      {situacao.map(({ filial, pedido, enviado }) => (
        <div key={filial.id} className={`cartao-filial ${enviado ? "enviado" : "aguardando"}`}>
          <span className="icone-status">
            {enviado ? <IconeConfere tamanho={22} /> : <IconeAtencao tamanho={22} />}
          </span>
          <span className="dados-filial">
            <strong>{filial.nomeCurto}</strong>
            <span className="status-filial">
              {enviado ? `${variedadesDoPedido(pedido)} produtos` : "não enviou o pedido"}
            </span>
          </span>
        </div>
      ))}
      {faltando.length > 0 && (
        <p className="nota-rodape">
          Confirmando agora, o que falta não entra na produção.
        </p>
      )}

      {/* Reposição é de HOJE e não entra no planejamento de amanhã — por
          isso aparece separada, e não somada ao pedido diário da loja. */}
      {reposicoesDeHoje.length > 0 && (
        <div className="cartao-reposicoes">
          <strong>Reposições pedidas hoje</strong>
          {reposicoesDeHoje.map((pedido) => (
            <div key={pedido.id} className="linha-reposicao">
              <span className="nome-filial">
                {FILIAIS.find((f) => f.id === pedido.lojaId)?.nomeCurto ?? pedido.lojaId}
              </span>
              <span className="status-filial">
                {pedido.itens
                  .map(
                    (i) =>
                      `${nomeDoProduto ? nomeDoProduto(i.codigoPdv) : i.codigoPdv} (${i.quantidadeUnidades} un)`
                  )
                  .join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
