/**
 * src/data/repositorioFirestore.ts
 * ---------------------------------------------------------------
 * STUB — caminho de produção recomendado (ver documento de arquitetura,
 * seção 03). Implementa a mesma interface Repositorio que
 * repositorioLocalStorage.ts, então trocar o backend é trocar UMA linha
 * em src/App.tsx (qual repositório é instanciado) — nenhuma tela muda.
 *
 * Deliberadamente SEM o SDK do Firebase instalado ainda, para este
 * projeto compilar e rodar hoje sem exigir uma conta/projeto Firebase
 * criado. Quando for para produção:
 *
 *   1) npm install firebase
 *   2) Criar projeto no console do Firebase, ativar Firestore
 *   3) Preencher as credenciais abaixo (variáveis de ambiente, nunca
 *      hardcoded no repositório)
 *   4) Descomentar as chamadas reais (indicadas em cada método)
 *   5) Trocar `new RepositorioLocalStorage()` por `new RepositorioFirestore()`
 *      em src/App.tsx
 */

import type { NovoProdutoInput, Produto } from "../types/produto";
import type { PlanoDeProducaoDiario } from "../types/producao";
import type { LancamentoPerdaInput, RegistroPerda } from "../types/perda";
import type { Repositorio } from "./repositorio";

// import { initializeApp } from "firebase/app";
// import {
//   getFirestore, collection, getDocs, doc, setDoc, query, where,
// } from "firebase/firestore";
//
// const app = initializeApp({
//   apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
//   authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//   projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
// });
// const db = getFirestore(app);

function naoImplementado(metodo: string): never {
  throw new Error(
    `RepositorioFirestore.${metodo} ainda não está implementado. ` +
      `Siga o passo-a-passo no topo deste arquivo antes de usar em produção.`
  );
}

export class RepositorioFirestore implements Repositorio {
  async listarProdutos(): Promise<Produto[]> {
    // const snap = await getDocs(collection(db, "produtos"));
    // return snap.docs.map((d) => d.data() as Produto);
    return naoImplementado("listarProdutos");
  }

  async salvarNovoProduto(_input: NovoProdutoInput): Promise<Produto> {
    // const codigoPdv = await proximoCodigoPdv(db);
    // const produto: Produto = { codigoPdv, ...input, statusVenda: "Ativo" };
    // await setDoc(doc(db, "produtos", String(codigoPdv)), produto);
    // return produto;
    return naoImplementado("salvarNovoProduto");
  }

  async atualizarProduto(_produto: Produto): Promise<Produto> {
    // await setDoc(doc(db, "produtos", String(produto.codigoPdv)), produto);
    // return produto;
    return naoImplementado("atualizarProduto");
  }

  async listarPlanos(): Promise<PlanoDeProducaoDiario[]> {
    return naoImplementado("listarPlanos");
  }

  async buscarPlanoPorData(_dataIso: string): Promise<PlanoDeProducaoDiario | undefined> {
    // const q = query(collection(db, "planos"), where("data", "==", dataIso));
    // const snap = await getDocs(q);
    // return snap.docs[0]?.data() as PlanoDeProducaoDiario | undefined;
    return naoImplementado("buscarPlanoPorData");
  }

  async salvarPlano(_plano: PlanoDeProducaoDiario): Promise<PlanoDeProducaoDiario> {
    // await setDoc(doc(db, "planos", plano.id), plano);
    // return plano;
    return naoImplementado("salvarPlano");
  }

  async listarPerdas(): Promise<RegistroPerda[]> {
    return naoImplementado("listarPerdas");
  }

  async registrarPerda(
    _input: LancamentoPerdaInput & {
      quantidadeNormalizada: number;
      unidadeNormalizada: string;
      fatorConversaoAplicado: boolean;
      diaDaSemana: RegistroPerda["diaDaSemana"];
      data: string;
    }
  ): Promise<RegistroPerda> {
    // Escrita append-only — nunca sobrescreve um registro de perda
    // existente, mesmo em caso de reenvio (idempotência via id gerado
    // no cliente antes da chamada).
    return naoImplementado("registrarPerda");
  }
}
