/**
 * src/data/repositorio.ts
 * ---------------------------------------------------------------
 * Interface de persistência. As telas (src/components) só conhecem
 * esta interface — nunca localStorage ou Firestore diretamente. Isso
 * é o que permite trocar o backend (ver repositorioFirestore.ts) sem
 * reescrever nenhuma tela.
 */

import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";

export interface Repositorio {
  listarProdutos(): Promise<Produto[]>;
  salvarNovoProduto(input: NovoProdutoInput): Promise<Produto>;
  atualizarProduto(produto: Produto): Promise<Produto>;

  listarPlanos(): Promise<PlanoDeProducaoDiario[]>;
  buscarPlanoPorData(dataIso: string): Promise<PlanoDeProducaoDiario | undefined>;
  salvarPlano(plano: PlanoDeProducaoDiario): Promise<PlanoDeProducaoDiario>;

  listarPerdas(): Promise<RegistroPerda[]>;
  registrarPerda(
    input: LancamentoPerdaInput & {
      quantidadeUnidadesEstimada: number;
      diaDaSemana: RegistroPerda["diaDaSemana"];
      data: string;
    }
  ): Promise<RegistroPerda>;
}
