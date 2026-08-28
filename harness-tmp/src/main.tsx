import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PainelFornadasFilial } from "../../src/components/PainelFornadasFilial";
import type { Produto } from "../../src/types/produto";
import type { PedidoFilial } from "../../src/types/pedido";
import type { FornadaPronta } from "../../src/types/fornada";
import { LOJAS } from "../../src/lib/lojas";
import "../../src/index.css";

const NOMES = ["PAO FRANCES","PAO SOVADO","BROA DE FUBA","SONHO DE CREME","ROSCA TATU","PALITO VEGETARIANO","PAO DE QUEIJO CONGELADO GRANDE"];
const PRODUTOS = NOMES.map((nome, i) => ({ codigoPdv: 100+i, nome, categoria: "PAES_E_ROSCAS", ativoNaProducao: true })) as unknown as Produto[];
const HOJE = new Date().toISOString().slice(0,10);
const FORNADAS = [
  { data: HOJE, codigoPdv: 104, marcadaEm: `${HOJE}T08:00:00.000Z`, marcadaPor: "Matriz" },
  { data: HOJE, codigoPdv: 105, marcadaEm: `${HOJE}T09:00:00.000Z`, marcadaPor: "Matriz" },
] as unknown as FornadaPronta[];

function App() {
  const [pedidos, setPedidos] = useState<PedidoFilial[]>([]);
  (window as any).__pedidos = pedidos;
  (window as any).__responder = (id: string, desfecho: string, motivo?: string) =>
    setPedidos((a) => a.map((p) => p.id === id ? { ...p, atendimento: { desfecho, motivo, decididoPor: "Matriz", decididoEm: new Date().toISOString() } } as PedidoFilial : p));
  return (
    <PainelFornadasFilial loja={LOJAS[1]} produtos={PRODUTOS} fornadas={FORNADAS} pedidos={pedidos}
      operador="Teste" encerrados={new Set()}
      onSalvarPedido={async (p) => setPedidos((a) => [...a.filter((x) => x.id !== p.id), p])} />
  );
}
createRoot(document.getElementById("raiz")!).render(<StrictMode><App /></StrictMode>);
