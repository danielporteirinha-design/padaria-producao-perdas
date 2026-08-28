/**
 * src/lib/interpretarPedidoFalado.ts
 * ---------------------------------------------------------------
 * Uma frase inteira vira uma lista de itens (ago/2026, pedido do dono do
 * negócio).
 *
 * O QUE MUDOU, E POR QUÊ
 * -----------------------
 * A primeira versão do assistente era um diálogo: o app perguntava o
 * produto, esperava, perguntava a quantidade, esperava, perguntava se
 * podia enviar. Cinco aberturas de microfone para um anúncio. Ficou
 * lento, e desligar o microfone no meio dava trabalho — o oposto do que
 * o recurso existia para resolver.
 *
 * Agora é UMA frase, dita do jeito que se fala no balcão:
 *
 *   "anunciar fornada de palito vegetariano"
 *   "quero 20 pão francês e 10 broa de fubá"
 *   "manda 12 sonho, 6 croissant e 30 pão de queijo"
 *
 * Este módulo transforma isso numa lista de {produto, quantidade}. É
 * PURO e sem rede — ver scripts/verificar_logica.ts.
 *
 * A IA ENTRA DEPOIS, E É OPCIONAL. Quando o casamento por texto não acha
 * um produto, a tela consulta o Gemini (ver api/interpretar-busca.ts)
 * para traduzir a fala coloquial no nome do catálogo. Sem chave, sem
 * rede ou com erro, vale o que este arquivo achou sozinho — que já cobre
 * o caso comum, porque a comparação ignora acento e caixa.
 *
 * NADA É INVENTADO. Produto que não casa com o catálogo não vira item:
 * ele volta como texto não reconhecido, e a tela mostra para a pessoa
 * decidir. Um pedido com o produto errado custa uma entrega errada.
 */

import { paraBusca } from "./texto";
import { entenderQuantidade } from "./vozRespostas";

export interface ItemFalado {
  /** Nome EXATO do catálogo. */
  nome: string;
  /** `null` quando a pessoa não disse quantidade (comum ao anunciar). */
  quantidade: number | null;
}

export interface LeituraDaFrase {
  itens: ItemFalado[];
  /** Trechos que não casaram com nenhum produto — a tela os mostra. */
  naoReconhecidos: string[];
}

/**
 * Palavras de comando que abrem a frase e não fazem parte do nome de
 * nada. Saem antes do casamento para que "anunciar fornada de broa" não
 * tente achar um produto chamado "anunciar".
 */
const COMANDOS = [
  "ANUNCIAR FORNADA DE",
  "ANUNCIAR FORNADA",
  "ANUNCIA FORNADA DE",
  "ANUNCIA FORNADA",
  "ANUNCIAR",
  "ANUNCIA",
  "FORNADA DE",
  "FORNADA",
  "SAIU DO FORNO",
  "SAIU",
  "QUERO PEDIR",
  "QUERO",
  "PRECISO DE",
  "PRECISO",
  "ME MANDA",
  "MANDA",
  "MANDAR",
  "PEDIR",
  "PEDIDO DE",
  "PEDIDO",
  "SOLICITAR",
  "SOLICITA",
  "FAVOR",
  "POR FAVOR",
];

/** Palavras que sobram depois do número e não ajudam a achar o produto. */
const RUIDO = ["UNIDADES", "UNIDADE", "UN", "PECAS", "PECA", "ITENS", "ITEM", "DE", "DO", "DA"];

/**
 * Quebra a frase em trechos, um por item.
 *
 * O separador é a vírgula ou o " E " isolado. O " E " precisa ser palavra
 * inteira: "PAO DE QUEIJO" tem um "DE" e não pode ser partido, e há
 * produto com "E" no nome ("DOCE E SALGADO") — por isso o corte é por
 * palavra, nunca por substring.
 */
function emTrechos(frase: string): string[] {
  return frase
    .split(/,|;|\s+E\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function semComandos(texto: string): string {
  let saida = ` ${texto} `;
  for (const comando of COMANDOS) {
    saida = saida.replace(new RegExp(`(^|\\s)${comando}(\\s|$)`, "g"), " ");
  }
  return saida.replace(/\s+/g, " ").trim();
}

/**
 * O quanto um nome do catálogo aparece no trecho falado.
 *
 * Conta PALAVRAS do nome presentes no trecho, e não substring: o
 * transcritor troca a ordem ("francês pão") e engole preposições, e uma
 * comparação de substring perderia os dois casos. Palavras de uma ou
 * duas letras não contam — "DE" casaria com metade do catálogo.
 */
function pontuar(nome: string, trecho: string): number {
  const palavrasDoNome = paraBusca(nome)
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (palavrasDoNome.length === 0) return 0;
  const alvo = ` ${trecho} `;
  const encontradas = palavrasDoNome.filter((p) => alvo.includes(` ${p} `)).length;

  /**
   * UMA PALAVRA SÓ NÃO BASTA quando o nome tem mais de uma.
   *
   * Sem esta trava, "dez pão" casava com "PAO FRANCES" — metade das
   * palavras, dentro do limite — e o pedido saía com um produto que
   * ninguém pediu. A padaria tem onze produtos que começam com "pão", e
   * escolher um deles no chute custa uma entrega errada.
   *
   * Nome de palavra única ("SONHO") continua casando com a palavra
   * única: aí não há ambiguidade a resolver.
   */
  if (encontradas < 2 && palavrasDoNome.length > 1) return 0;
  return encontradas / palavrasDoNome.length;
}

/**
 * O produto que melhor casa com o trecho, ou vazio.
 *
 * Exige METADE das palavras do nome. Abaixo disso o casamento vira
 * palpite — "PAO" sozinho casaria com onze produtos, e o pedido sairia
 * com o pão errado. Empate é resolvido pelo nome mais específico (mais
 * palavras casadas), que é o que a pessoa disse por extenso.
 */
function melhorProduto(trecho: string, nomes: string[]): string {
  let melhor = "";
  let melhorNota = 0;
  let melhorTamanho = 0;
  for (const nome of nomes) {
    const nota = pontuar(nome, trecho);
    if (nota < 0.5) continue;
    const tamanho = paraBusca(nome).split(/\s+/).filter((p) => p.length > 2).length;
    if (nota > melhorNota || (nota === melhorNota && tamanho > melhorTamanho)) {
      melhor = nome;
      melhorNota = nota;
      melhorTamanho = tamanho;
    }
  }
  return melhor;
}

/** Tira o número e as palavras de medida, deixando só o que nomeia. */
function soONome(trecho: string): string {
  return trecho
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !RUIDO.includes(p))
    .join(" ");
}

/**
 * Lê a frase inteira e devolve os itens reconhecidos.
 *
 * `nomes` são os nomes EXATOS do catálogo — o que sai daqui é sempre um
 * deles, nunca um texto livre.
 */
export function interpretarFrase(frase: string, nomes: string[]): LeituraDaFrase {
  const limpa = semComandos(paraBusca(frase).replace(/[.!?]/g, " "));
  if (!limpa) return { itens: [], naoReconhecidos: [] };

  const itens: ItemFalado[] = [];
  const naoReconhecidos: string[] = [];

  for (const trecho of emTrechos(limpa)) {
    const quantidade = entenderQuantidade(trecho);
    const nome = melhorProduto(soONome(trecho), nomes);
    if (!nome) {
      naoReconhecidos.push(trecho);
      continue;
    }
    // O mesmo produto dito duas vezes soma, em vez de virar duas linhas:
    // "10 pão francês e mais 5 pão francês" é um pedido de 15.
    const existente = itens.find((i) => i.nome === nome);
    if (existente) {
      existente.quantidade = (existente.quantidade ?? 0) + (quantidade ?? 0) || null;
    } else {
      itens.push({ nome, quantidade });
    }
  }

  return { itens, naoReconhecidos };
}
