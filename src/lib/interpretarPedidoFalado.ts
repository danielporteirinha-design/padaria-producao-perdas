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

import { paraBusca, radicalDaFrase } from "./texto";
import { trocarApelidos } from "./apelidosDeProdutos";
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
const RUIDO = [
  "UNIDADES", "UNIDADE", "UN",
  "PECAS", "PECA", "ITENS", "ITEM",
  "DUZIA", "DUZIAS",
  "DE", "DO", "DA", "DOS", "DAS",
];

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
/**
 * Distância de edição: quantas letras é preciso trocar, inserir ou tirar
 * para uma palavra virar a outra.
 *
 * Existe por um caso real (ago/2026): "ROSCA TATU" ditado saía do
 * transcritor como "ROSCA TATTOO" — ele conhece a palavra inglesa e não
 * conhece o bicho. A comparação letra por letra dava zero, e o produto
 * ficava impossível de pedir por voz. Não é exceção: o reconhecedor
 * anglicaniza nome próprio o tempo todo.
 */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1, // remoção
        linha[j - 1] + 1, // inserção
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1) // troca
      );
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/**
 * Letra repetida some antes da comparação.
 *
 * O transcritor dobra consoante e vogal quando acha que está escrevendo
 * inglês: "TATU" virou "TATTOO". Em português a letra dobrada quase não
 * muda o som ("TATTOO" e "TATO" se leem igual), então colapsar antes de
 * medir a distância corrige a grafia sem afrouxar o limite para palavras
 * que são de fato diferentes.
 */
function semLetraDobrada(palavra: string): string {
  return palavra.replace(/(.)\1+/g, "$1");
}

/**
 * Duas palavras são "a mesma coisa mal ouvida"?
 *
 * Mede a distância JÁ SEM as letras dobradas. "TATU" e "TATTOO" viram
 * "TATU" e "TATO" — distância 1, passa. "BROA" e "BOLO" continuam a
 * distância 3, e não passam. A folga é um terço das letras, no máximo
 * duas; palavra curta quase não tem folga, porque nela uma letra trocada
 * já é outra palavra.
 */
function pareceMesmaPalavra(a: string, b: string): boolean {
  if (a === b) return true;
  const ca = semLetraDobrada(a);
  const cb = semLetraDobrada(b);
  if (ca === cb) return true;
  const maior = Math.max(ca.length, cb.length);
  if (maior < 4) return false;
  const folga = Math.min(2, Math.floor(maior / 3));
  return distancia(ca, cb) <= folga;
}

/**
 * `trecho` chega AQUI já em radical (ver `melhorProduto`); o nome do
 * catálogo é reduzido do mesmo jeito. É essa simetria que faz "pães
 * sovados" encontrar "PÃO SOVADO" sem afrouxar nada: as duas pontas
 * viram "PAO SOVADO", e a comparação segue exigindo palavra inteira.
 */
function pontuar(nome: string, trecho: string): number {
  const palavrasDoNome = radicalDaFrase(paraBusca(nome))
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (palavrasDoNome.length === 0) return 0;

  const ditas = trecho.split(/\s+/).filter((p) => p.length > 2);
  const alvo = ` ${trecho} `;

  let exatas = 0;
  let aproximadas = 0;
  for (const palavra of palavrasDoNome) {
    if (alvo.includes(` ${palavra} `)) exatas++;
    else if (ditas.some((d) => pareceMesmaPalavra(palavra, d))) aproximadas++;
  }

  /**
   * APROXIMAÇÃO SÓ VALE COM ÂNCORA — OU COM O NOME INTEIRO.
   *
   * A regra original exigia pelo menos uma palavra EXATA: com "ROSCA"
   * certo, a semelhança em "TATU" deixa de ser chute e vira correção.
   * Ela cai num caso real (ago/2026): "roska tattoo", em que o
   * transcritor errou AS DUAS palavras e não sobrou âncora nenhuma.
   *
   * A saída não é afrouxar o limite — é exigir mais do outro lado.
   * Sem nenhuma palavra exata, só casa quando TODAS as palavras do nome
   * casaram por semelhança, e o nome tem pelo menos duas. Duas palavras
   * erradas do mesmo jeito, na mesma ordem, é transcrição ruim do
   * produto certo; uma palavra parecida sozinha continua sendo chute, e
   * chute vira entrega errada.
   */
  if (exatas === 0) {
    if (palavrasDoNome.length < 2) return 0;
    if (aproximadas !== palavrasDoNome.length) return 0;
  }

  const encontradas = exatas + aproximadas;

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

  /**
   * A palavra exata vale mais que a parecida no desempate. Entre dois
   * produtos que casaram, ganha o que a pessoa disse por inteiro.
   */
  return (exatas + aproximadas * 0.9) / palavrasDoNome.length;
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
  /**
   * Duas reduções antes de comparar, nesta ordem:
   *
   * 1. RADICAL — singular e plural passam a ser a mesma palavra, dos
   *    dois lados ("pães sovados" e "PÃO SOVADO" viram "PAO SOVADO").
   * 2. APELIDO — o nome do balcão vira o nome do cadastro ("pão de sal"
   *    vira "PAO FRANCES"). Depois do radical, para que o apelido valha
   *    também no plural: "pães de sal".
   */
  const alvo = trocarApelidos(radicalDaFrase(trecho), nomes);
  if (!alvo) return "";

  let melhor = "";
  let melhorNota = 0;
  let melhorTamanho = 0;
  for (const nome of nomes) {
    const nota = pontuar(nome, alvo);
    if (nota < 0.5) continue;
    const tamanho = radicalDaFrase(paraBusca(nome)).split(/\s+/).filter((p) => p.length > 2).length;
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
 * Quebra um trecho que traz VÁRIOS produtos sem "e" nem vírgula.
 *
 * No balcão ninguém dita pontuação. A frase real é "vinte pão francês
 * dez broa de fubá" — dois pedidos colados. O único sinal confiável de
 * onde um acaba e o outro começa é o número, e ele aparece nas duas
 * cadências: antes do nome ("20 pão francês 10 broa") ou depois dele
 * ("pão francês 20 broa 10").
 *
 * Por isso as duas partições são TESTADAS contra o catálogo, e só vale a
 * que faz TODAS as partes casarem com um produto. Se nenhuma casa
 * inteira, o trecho segue inteiro — errar a divisão é pior que não
 * dividir, porque produziria um pedido que ninguém fez.
 */
function separarPorNumeros(trecho: string, nomes: string[]): string[] {
  const tokens = trecho.split(/\s+/).filter((t) => t.length > 0);
  const numeros = tokens.map((t, i) => (/^\d+$/.test(t) ? i : -1)).filter((i) => i >= 0);
  if (numeros.length < 2) return [trecho];

  const cortar = (pontos: number[]): string[] => {
    const partes: string[] = [];
    let inicio = 0;
    for (const p of pontos) {
      if (p <= inicio || p >= tokens.length) continue;
      partes.push(tokens.slice(inicio, p).join(" "));
      inicio = p;
    }
    partes.push(tokens.slice(inicio).join(" "));
    return partes.filter((p) => p.length > 0);
  };

  const candidatas = [
    cortar(numeros), // número ABRE o item: "20 pão francês 10 broa"
    cortar(numeros.map((i) => i + 1)), // número FECHA o item: "pão francês 20 broa 10"
  ];

  for (const partes of candidatas) {
    if (partes.length < 2) continue;
    if (partes.every((parte) => melhorProduto(soONome(parte), nomes) !== "")) return partes;
  }
  return [trecho];
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

  const trechos = emTrechos(limpa).flatMap((t) => separarPorNumeros(t, nomes));

  for (const trecho of trechos) {
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
