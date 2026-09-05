/**
 * src/lib/adivinharSuprimento.ts
 * ---------------------------------------------------------------
 * Chuta se um nome que não bateu com nenhum catálogo é mais provavelmente
 * um PRODUTO DE PADARIA ou um SUPRIMENTO — e, sendo suprimento, em qual
 * segmento (set/2026, pedido do dono do negócio: "a própria voz deve
 * sugerir... cadastrar como embalagem", exemplo dado: "um saco de papel
 * grande").
 *
 * NÃO É INTELIGÊNCIA ARTIFICIAL, DE PROPÓSITO. É uma lista de palavras por
 * segmento — rápida, sem rede, e fácil de qualquer um ler e ajustar. Errar
 * aqui custa um toque a mais (o link "na verdade é..." em
 * PainelFornadasFilial.tsx troca de lado); a IA que já existe no
 * reconhecimento de voz (ver src/lib/vozParaBusca.ts) resolve o problema
 * difícil, que é entender o que foi dito — esta função só decide ONDE
 * sugerir guardar o que já foi entendido.
 *
 * O CASAMENTO MAIS LONGO GANHA, não o primeiro da lista — "papel toalha"
 * (limpeza) não pode perder para um "papel" solto que nem está aqui, mas
 * se duas palavras específicas batessem ao mesmo tempo, a mais longa é a
 * mais provável de estar certa.
 */
import { paraBusca } from "./texto";

const PALAVRAS_POR_SEGMENTO: { segmento: string; palavras: string[] }[] = [
  {
    segmento: "LIMPEZA",
    palavras: [
      "DETERGENTE",
      "DESINFETANTE",
      "SABAO",
      "SABONETE",
      "ALCOOL",
      "AGUA SANITARIA",
      "ALVEJANTE",
      "CLORO",
      "MULTIUSO",
      "VASSOURA",
      "RODO",
      "ESPONJA",
      "SAPONACEO",
      "PANO DE CHAO",
      "PANO MULTIUSO",
      "BALDE",
      "LUVA",
      "ESCOVA",
      "PAPEL HIGIENICO",
      "PAPEL TOALHA",
      "LUSTRA MOVEIS",
    ],
  },
  {
    segmento: "SACOLAS",
    palavras: ["SACOLA"],
  },
  {
    segmento: "EMBALAGENS",
    palavras: [
      "SACO",
      "EMBALAGEM",
      "CAIXA DE PAPELAO",
      "POTE",
      "COPO DESCARTAVEL",
      "GUARDANAPO",
      "BANDEJA",
      "PAPEL MANTEIGA",
      "PAPEL ALUMINIO",
      "FILME PVC",
      "FILME PLASTICO",
      "ETIQUETA",
      "FITA ADESIVA",
      "ISOPOR",
      "MARMITEX",
      "FORMINHA DE PAPEL",
      "FITILHO",
      "BARBANTE",
    ],
  },
];

/**
 * Devolve o segmento sugerido (já na forma de `chaveDoSegmento`), ou
 * `null` quando nada bateu — o palpite, nesse caso, é "produto de
 * padaria", que é o uso principal da tela que chama esta função.
 */
export function adivinharSegmentoSuprimento(nomeBruto: string): string | null {
  const alvo = paraBusca(nomeBruto);
  if (!alvo) return null;

  let melhor: { segmento: string; tamanho: number } | null = null;
  for (const grupo of PALAVRAS_POR_SEGMENTO) {
    for (const palavra of grupo.palavras) {
      if (alvo.includes(palavra) && (!melhor || palavra.length > melhor.tamanho)) {
        melhor = { segmento: grupo.segmento, tamanho: palavra.length };
      }
    }
  }
  return melhor?.segmento ?? null;
}
