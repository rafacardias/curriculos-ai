/**
 * Segmentação de JD por seção — a capacidade que o REQ-002 vinha pedindo em três
 * aparições diferentes.
 *
 * POR QUE O EIXO ANTERIOR ESTAVA ERRADO. O `blockingTechnology` decidia por
 * PROXIMIDADE: procurava um marcador de obrigatoriedade numa janela ao redor da
 * menção. Funciona em JD brasileiro, que escreve "Python (obrigatório)". Não
 * funciona em JD em inglês estruturado por seção, e o caso que provou isso foi a
 * 10x Advisory (score 82):
 *
 *   "Develop scalable backend services using Python"   ← Responsibilities
 *
 * Não há marcador perto porque não precisa haver: **a seção já é o marcador**.
 * Construir o backend em Python é a descrição do trabalho. Enquanto isso, três
 * parágrafos abaixo:
 *
 *   "Preferred Qualifications … Experience building production applications
 *    using Python"                                      ← preferencial
 *
 * onde o próprio anúncio diz que é preferência. Um filtro de distância não
 * distingue as duas; um de seção distingue.
 *
 * DOIS CONSUMIDORES, UM SEGMENTADOR. `blockingTechnology` e a checagem de anos
 * usam a MESMA segmentação. Foi a duplicação de cascata que fez `scoreNewJobs` e
 * `rescoreAll` divergirem antes, e não vale a pena repetir o erro só porque desta
 * vez os dois detectores parecem independentes — eles fazem a mesma pergunta
 * ("isto é exigência?") sobre o mesmo texto.
 *
 * O TEXTO CHEGA ACHATADO. `stripHtml` colapsa o HTML, então o cabeçalho não vem
 * numa linha própria: no acervo real ele aparece embutido, "…Anthropic Preferred
 * Qualifications 3+ years of…". Por isso os cabeçalhos são casados como FRASES
 * dentro do corpo, e não por estrutura de linha.
 *
 * FORA DE SEÇÃO RECONHECIDA, NADA MUDA. Quem não cai em cabeçalho nenhum recebe
 * `neutral` e volta ao comportamento de janela. Tratar "não reconheci a seção"
 * como "é preferencial" seria a CLASSE-01 forma A dentro da correção da forma B.
 */

/** O que a seção diz sobre a força do que está escrito dentro dela. */
export type SectionWeight =
  /** Requisito ou descrição do trabalho: o que está aqui é exigência. */
  | "obligation"
  /** Diferencial, desejável, bônus: menção explicitamente enfraquecida. */
  | "weak"
  /** Empresa, benefícios, cultura: não fala do candidato. */
  | "context"
  /** Nenhum cabeçalho reconhecido — cai no comportamento anterior. */
  | "neutral";

export interface JdSection {
  weight: SectionWeight;
  /** O cabeçalho que abriu a seção, como apareceu no texto. `null` no trecho inicial. */
  heading: string | null;
  start: number;
  end: number;
}

/**
 * Cabeçalhos, em PT e EN.
 *
 * Cada um exige uma FRONTEIRA à esquerda — início do texto, pontuação ou quebra —
 * para que "temos requisitos rigorosos" no meio de uma frase não abra seção. É a
 * mesma disciplina do `hasWord` em locality.ts: casar palavra inteira, nunca
 * pedaço. E são majoritariamente expressões de duas ou mais palavras, porque
 * palavra solta é onde o falso positivo mora.
 */
const FRASES: Array<{ weight: SectionWeight; alt: string }> = [
  {
    // Preferencial vem PRIMEIRO: "Preferred Qualifications" contém
    // "Qualifications", e a ordem de teste é o que impede o mais fraco de ser
    // engolido pelo mais forte.
    weight: "weak",
    alt: "diferenciais?|desej[áa]ve(?:l|is)|ser[áa] um diferencial|nice to have|bonus points?|preferred qualifications?|preferred skills?|preferred experience|good to have|o que seria legal|tamb[ée]m valorizamos",
  },
  {
    weight: "obligation",
    alt: "requisitos?(?: obrigat[óo]rios?| e qualifica[çc][õo]es| t[ée]cnicos?)?|pr[ée][- ]?requisitos?|qualifica[çc][õo]es|conhecimentos? (?:essenciais?|necess[áa]rios?)|hard skills|o que (?:esperamos|buscamos|precisamos)|quem procuramos|perfil desejado|requirements?|required (?:qualifications?|skills?|experience)|minimum qualifications?|basic qualifications?|must[- ]have|qualifications?|what you(?:'| a)?ll need|who you are|about you",
  },
  {
    weight: "obligation",
    alt: "responsabilidades?|principais atividades|atividades(?: e responsabilidades)?|suas atribui[çc][õo]es|o que voc[êe] (?:vai|ir[áa]) fazer|sua miss[ãa]o|responsibilities|key responsibilities|what you(?:'| wi)?ll do|the role|day[- ]to[- ]day|your impact",
  },
  {
    weight: "context",
    alt: "sobre (?:a empresa|n[óo]s)|quem somos|nossa hist[óo]ria|about (?:us|the company)|who we are|benef[íi]cios|o que (?:oferecemos|voc[êe] (?:vai|ir[áa]) encontrar)|benefits|perks|what we offer|nosso pacote",
  },
];

/** Pontuação ou quebra à esquerda: o cabeçalho preservou a estrutura original. */
const COM_FRONTEIRA = FRASES.map(({ weight, alt }) => ({
  weight,
  re: new RegExp(`(?:^|[.;:!?)\\]\\n•·—-]\\s*)(${alt})\\b`, "gi"),
}));

/**
 * O MESMO vocabulário sem exigir fronteira — construído a partir da mesma string,
 * nunca por cirurgia no `source` de uma regex já montada. A primeira versão disto
 * fazia `re.source.replace(...)` e a substituição falhava em silêncio por causa do
 * `\]` dentro da classe de caracteres: as duas listas ficavam idênticas e o
 * segmentador nunca via um cabeçalho achatado.
 */
const SEM_FRONTEIRA = FRASES.map(({ weight, alt }) => ({
  weight,
  re: new RegExp(`\\b(?:${alt})\\b`, "gi"),
}));

/**
 * A MESMA lista, sem a exigência de fronteira à esquerda.
 *
 * Necessária porque `stripHtml` apaga a estrutura: no acervo real o cabeçalho
 * chega grudado na frase anterior — *"…Azure OpenAI Anthropic Preferred
 * Qualifications 3+ years…"*. Não há ponto, não há quebra, e a versão com
 * fronteira classificava as três menções da 10x Advisory como `Responsibilities`,
 * inclusive a que está declaradamente sob *Preferred*.
 *
 * O que sobrevive ao achatamento é a CAPITALIZAÇÃO: um `<h3>` vira Title Case ou
 * CAIXA ALTA no meio da frase, e prosa corrida não faz isso. É por isso que estes
 * padrões só valem via `pareceCabecalho`.
 */

/**
 * O trecho casado parece um cabeçalho achatado, e não prosa?
 *
 * Exige Title Case (toda palavra de 3+ letras começando maiúscula) ou CAIXA ALTA.
 * `"Preferred Qualifications"` passa; `"we have preferred qualifications"` não.
 * Palavras curtas — "de", "e", "of", "to" — são ignoradas, porque cabeçalho real
 * não capitaliza preposição.
 *
 * Deliberadamente conservador: perder um cabeçalho devolve o trecho ao
 * comportamento de janela, que é o de antes. Inventar um cabeçalho reclassifica
 * texto que ninguém marcou — o erro caro.
 */
function pareceCabecalho(trecho: string): boolean {
  const palavras = trecho.trim().split(/\s+/).filter((p) => p.replace(/[^\p{L}]/gu, "").length >= 3);
  if (!palavras.length) return false;
  return palavras.every((p) => {
    const limpa = p.replace(/[^\p{L}]/gu, "");
    return limpa.length > 0 && limpa[0] === limpa[0]!.toLocaleUpperCase("pt-BR");
  });
}

/**
 * Divide o JD em seções. Sempre devolve pelo menos uma — o texto inteiro como
 * `neutral` quando nenhum cabeçalho é reconhecido.
 */
export function segmentJd(text: string): JdSection[] {
  const marcos: Array<{ at: number; weight: SectionWeight; heading: string }> = [];
  for (const { weight, re } of COM_FRONTEIRA) {
    for (const m of text.matchAll(re)) {
      const titulo = m[1]!;
      // O índice do TÍTULO, não o do prefixo de fronteira: a seção começa onde o
      // cabeçalho começa, e o que vem antes pertence à seção anterior.
      marcos.push({ at: m.index + m[0].indexOf(titulo), weight, heading: titulo });
    }
  }
  for (const { weight, re } of SEM_FRONTEIRA) {
    for (const m of text.matchAll(re)) {
      if (!pareceCabecalho(m[0])) continue;
      marcos.push({ at: m.index, weight, heading: m[0] });
    }
  }
  // Posição crescente e, no empate, o cabeçalho MAIS LONGO primeiro: os dois
  // varredores acham o mesmo título, e "Requisitos obrigatórios" tem que vencer
  // "Requisitos" em vez de depender da ordem em que a lista foi escrita.
  marcos.sort((a, b) => a.at - b.at || b.heading.length - a.heading.length);

  // Dois cabeçalhos no mesmo ponto (ex.: "Preferred Qualifications" casando como
  // fraco e "Qualifications" como obrigatório dentro dele): o mais à esquerda e
  // mais longo vence, e o que estiver contido nele desaparece.
  const limpos: typeof marcos = [];
  for (const m of marcos) {
    const anterior = limpos[limpos.length - 1];
    if (anterior && m.at < anterior.at + anterior.heading.length) continue;
    limpos.push(m);
  }

  if (!limpos.length) return [{ weight: "neutral", heading: null, start: 0, end: text.length }];

  const secoes: JdSection[] = [];
  if (limpos[0]!.at > 0) {
    secoes.push({ weight: "neutral", heading: null, start: 0, end: limpos[0]!.at });
  }
  for (let i = 0; i < limpos.length; i++) {
    secoes.push({
      weight: limpos[i]!.weight,
      heading: limpos[i]!.heading,
      start: limpos[i]!.at,
      end: i + 1 < limpos.length ? limpos[i + 1]!.at : text.length,
    });
  }
  return secoes;
}

/** Em que seção cai este índice. */
export function sectionAt(secoes: JdSection[], index: number): JdSection {
  for (const s of secoes) if (index >= s.start && index < s.end) return s;
  return secoes[secoes.length - 1]!;
}

export interface ScopedMatch {
  /** O trecho que casou. */
  text: string;
  index: number;
  section: JdSection;
}

/**
 * Ocorrências de um padrão, cada uma já com a seção em que caiu.
 *
 * É este o ponto de reuso entre os dois consumidores: tecnologia bloqueante e
 * anos exigidos chamam a mesma função, com regexes diferentes, e recebem a mesma
 * noção de "onde isto está escrito".
 */
export function matchesInSections(text: string, re: RegExp): ScopedMatch[] {
  const secoes = segmentJd(text);
  const global = re.global ? re : new RegExp(re.source, re.flags + "g");
  return [...text.matchAll(global)].map((m) => ({
    text: m[0],
    index: m.index,
    section: sectionAt(secoes, m.index),
  }));
}
