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
 */

import type { PedidoFilial } from "../types/pedido";
import { totalDoPedido } from "../types/pedido";
import { FILIAIS } from "../lib/lojas";
import { IconeAtencao, IconeConfere } from "./Icones";

interface PainelPedidosFiliaisProps {
  pedidos: PedidoFilial[];
  data: string;
}

export function PainelPedidosFiliais({ pedidos, data }: PainelPedidosFiliaisProps) {
  const situacao = FILIAIS.map((filial) => {
    const pedido = pedidos.find((p) => p.data === data && p.lojaId === filial.id);
    return { filial, pedido, enviado: pedido?.status === "enviado" };
  });

  const faltando = situacao.filter((s) => !s.enviado);

  return (
    <div className={`painel-pedidos ${faltando.length > 0 ? "aguardando" : "completo"}`}>
      <div className="linhas-pedidos">
        {situacao.map(({ filial, pedido, enviado }) => (
          <div key={filial.id} className="linha-pedido-filial">
            <span className="icone-status">
              {enviado ? <IconeConfere tamanho={16} /> : <IconeAtencao tamanho={16} />}
            </span>
            <span className="nome-filial">{filial.nomeCurto}</span>
            <span className="status-filial">
              {enviado ? `enviado · ${totalDoPedido(pedido)} un` : "aguardando"}
            </span>
          </div>
        ))}
      </div>
      {faltando.length > 0 && (
        <p className="nota-rodape">
          {faltando.length === 1
            ? `${faltando[0].filial.nomeCurto} ainda não enviou o pedido.`
            : "Nenhuma filial enviou o pedido ainda."}{" "}
          Se confirmar a produção agora, a quantidade dessa loja não entra.
        </p>
      )}
    </div>
  );
}
