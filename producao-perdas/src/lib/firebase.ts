/**
 * src/lib/firebase.ts
 * ---------------------------------------------------------------
 * Inicialização única do Firebase (Firestore + Authentication).
 *
 * SOBRE ESTAS CREDENCIAIS ESTAREM NO CÓDIGO
 * -----------------------------------------
 * A configuração web do Firebase NÃO é segredo, e é assim por desenho: o
 * navegador de qualquer usuário do app precisa dela para conversar com o
 * projeto, então ela é sempre visível no bundle público — colocá-la em
 * variável de ambiente não a esconderia de ninguém, só daria a falsa
 * sensação de que está escondida.
 *
 * A segurança real está em dois lugares, e é neles que se mexe se algo
 * precisar ser trancado:
 *
 *   1. Firebase Authentication — nenhuma operação acontece sem uma das
 *      três contas de loja autenticada.
 *   2. firestore.rules (na raiz do projeto) — define o que CADA loja pode
 *      ler e escrever. É o arquivo que importa numa auditoria de acesso.
 *
 * PERSISTÊNCIA OFFLINE
 * --------------------
 * Requisito decisivo desta operação: o wifi da cozinha cai. Com
 * `persistentLocalCache` o Firestore guarda os dados em IndexedDB, deixa
 * o app ler e ESCREVER offline, e sincroniza sozinho quando a conexão
 * volta — o operador não vê diferença nenhuma. Foi por isso que o
 * Firestore foi escolhido em vez do Supabase, onde isso não é nativo.
 *
 * `persistentMultipleTabManager` cobre o caso de o app estar aberto em
 * mais de uma aba no PC; sem ele, só a primeira aba teria cache em disco.
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWQq1TVzd9ycS8tpwl-lxmj7SPek0Pyuc",
  authDomain: "producao-padaria-pao-de-mel.firebaseapp.com",
  projectId: "producao-padaria-pao-de-mel",
  storageBucket: "producao-padaria-pao-de-mel.firebasestorage.app",
  messagingSenderId: "387803878936",
  appId: "1:387803878936:web:26ab9179bb813e114fd56d",
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
