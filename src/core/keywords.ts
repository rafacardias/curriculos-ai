import { normalize } from "./dedup.js";

const STOPWORDS = new Set(
  (
    "a o e de da do das dos em no na nos nas para por com sem sob sobre um uma uns umas que se ao aos as os ou nem mais menos muito pouco como quando onde qual quais isso este esta esse essa aquele aquela seu sua seus suas nosso nossa vaga empresa trabalho oportunidade requisitos atividades responsabilidades beneficios salario " +
    "the a an and or of to in on at for with without from by as is are was were be been being this that these those it its we you they he she will shall may can could would should must have has had do does did not no yes our your their job company work opportunity requirements responsibilities benefits salary about more less very"
  ).split(/\s+/)
);

/** Tokens normalizados sem stopwords. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Extrai keywords ranqueadas do JD: unigramas e bigramas por frequência.
 * Determinístico — o refinamento semântico é papel do Claude no /gerar.
 *
 * Bigramas são formados de 2 em 2 (stride 2), não de 1 em 1 — se fossem de 1 em
 * 1, um termo composto de N tokens gera N-1 bigramas encadeados que se
 * SOBREPÕEM (cada token do meio entra em dois bigramas vizinhos, além do
 * próprio unigrama). "Model Context Protocols (MCPs)" → [model, context,
 * protocols, mcps] contava `context` em "model context" E em "context
 * protocols" — o mesmo token duas vezes como bigrama, mais uma vez como
 * unigrama, inflando o denominador de cobertura por fragmento, não por termo
 * (KNOWN-BUGS.md REQ-002). Com stride 2, cada token entra em no máximo um
 * bigrama: "model context" e "protocols mcps", sem o par do meio que só
 * duplicava sinal já contado. Unigrama + bigrama continuam coexistindo de
 * propósito (ver teste "bigrama pesa 2× o unigrama") — o que muda é só a
 * sobreposição entre bigramas vizinhos, não a coexistência de escalas.
 */
export function extractKeywords(text: string, top = 40): Array<{ term: string; count: number }> {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    counts.set(tokens[i]!, (counts.get(tokens[i]!) ?? 0) + 1);
  }
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const bi = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(bi, (counts.get(bi) ?? 0) + 2); // bigramas valem mais
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

/** Quais termos de `terms` aparecem no texto (match por token normalizado). */
export function termsPresent(text: string, terms: string[]): string[] {
  const haystack = ` ${normalize(text)} `;
  return terms.filter((t) => haystack.includes(` ${normalize(t)} `));
}
