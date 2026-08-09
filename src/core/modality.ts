/**
 * Modalidade de trabalho — remoto, híbrido, presencial e o terceiro estado.
 *
 * O TERCEIRO ESTADO É O PONTO. `remote_type` tem quatro valores possíveis no
 * banco, e o quarto é NULL. Antes disto, NULL era lido como "não é remoto" por
 * quem olhasse a coluna e como "sem problema" por quem olhasse a fila — duas
 * leituras opostas do mesmo silêncio, e nenhuma delas era o que o dado dizia.
 *
 * Não é ruído de coleta: o adapter do LinkedIn e o `manual-url` (o fallback
 * universal `/vaga <url>`) não extraem modalidade em lugar nenhum do código. Para
 * essas fontes, NULL é o normal, não a exceção. 138 vagas no acervo.
 *
 * `unknown` é, portanto, um resultado legítimo e é assim que ele deve aparecer:
 * pendente e explícito, nunca implicitamente aprovado.
 *
 * O QUE ESTE MÓDULO NÃO FAZ. Ele não infere modalidade a partir do texto do
 * anúncio. `remoteHints()` devolve TRECHOS para um humano ler — evidência, nunca
 * veredito. Transformar "trabalho 100% remoto" solto num JD em estado do sistema
 * seria repetir a família de defeito que o `blockingTechnology` acabou de corrigir:
 * menção não é declaração. Quem promove trecho a estado é o operador, via
 * `modality set`, e a decisão fica gravada com data e origem.
 */

/** Estados possíveis. `unknown` = ninguém afirmou nada, nem a fonte nem o operador. */
export type ModalityState = "remote" | "hybrid" | "onsite" | "unknown";

/**
 * O que pode ser AFIRMADO. `unknown` não é afirmável — é o que sobra quando
 * ninguém afirmou. O tipo carrega essa distinção para que ninguém consiga gravar
 * "unknown" no banco como se fosse uma decisão tomada.
 */
export type AssertedModality = Exclude<ModalityState, "unknown">;

/** Quem afirmou. `null` só quando o estado é `unknown`. */
export type ModalitySource = "adapter" | "operator";

export interface Modality {
  state: ModalityState;
  source: ModalitySource | null;
  /** Quando o operador confirmou (ISO-8601), se foi ele. */
  confirmedAt: string | null;
  /** Onde o operador leu isso, se ele anotou. */
  note: string | null;
  /** O que o adapter tinha dito, preservado mesmo quando o operador sobrescreve. */
  adapterSaid: AssertedModality | null;
}

/** Só o que interessa de uma vaga aqui. Subtipo estrutural de `JobRow`. */
export interface ModalityInput {
  remote_type?: string | null;
  modality_confirmed?: string | null;
  modality_confirmed_at?: string | null;
  modality_note?: string | null;
}

const VALIDOS = new Set<string>(["remote", "hybrid", "onsite"]);

/** Normaliza um valor de coluna para estado afirmado, ou null se não for um dos três. */
export function parseModalityState(raw: string | null | undefined): AssertedModality | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return VALIDOS.has(v) ? (v as AssertedModality) : null;
}

/**
 * Estado efetivo de uma vaga.
 *
 * Precedência: operador > adapter. O operador leu o anúncio; o adapter, quando
 * muito, leu um campo estruturado. Mas o que o adapter disse continua acessível
 * em `adapterSaid` — se um dia os dois divergirem em massa, isso é medível.
 */
export function resolveModality(job: ModalityInput): Modality {
  const adapterSaid = parseModalityState(job.remote_type);
  const confirmado = parseModalityState(job.modality_confirmed);
  if (confirmado) {
    return {
      state: confirmado,
      source: "operator",
      confirmedAt: job.modality_confirmed_at ?? null,
      note: job.modality_note ?? null,
      adapterSaid,
    };
  }
  if (adapterSaid) {
    return { state: adapterSaid, source: "adapter", confirmedAt: null, note: null, adapterSaid };
  }
  return { state: "unknown", source: null, confirmedAt: null, note: null, adapterSaid: null };
}

/** Rótulo curto para tabela de CLI. */
export function modalityLabel(m: Modality): string {
  const nome = { remote: "remoto", hybrid: "híbrido", onsite: "presencial", unknown: "?" }[m.state];
  if (m.state === "unknown") return "? não informado";
  return `${nome} (${m.source === "operator" ? "confirmado" : "fonte"})`;
}

/**
 * A geração deve ser recusada por modalidade indefinida?
 *
 * POR QUE AQUI E NÃO NA FILA. Travar a fila inteira custaria ~11 resoluções por
 * rodada, para sempre. Mas só as vagas que passam de `policy.generate_min_score`
 * viram kit — hoje, UMA das 11 pendentes. O ponto certo de cobrança é onde a
 * informação importa: um kit custa ~$3 e ~4 min, resolver a modalidade custa ~1
 * min, e a pergunta "isso é remoto?" precisa de resposta ANTES de escrever uma
 * carta dizendo que ele topa o cargo.
 *
 * Só NÃO bloqueia na UF-base: em Belo Horizonte, presencial, híbrido e remoto
 * são todos aceitáveis, então a modalidade não muda a decisão e não vale a
 * interrupção.
 *
 * `unknown` sem localidade reconhecida (`loc.level === "unknown"`) TAMBÉM
 * bloqueia — não bloqueava antes ("não punir ausência com ausência"), mas essa
 * leitura tinha um buraco: é exatamente o par de sinais que uma vaga adicionada
 * por `/vaga <url>` produz (o adapter manual não extrai modalidade, e a string
 * de `location` às vezes não bate com nada em `config/locality.yaml`) — ou
 * seja, zero verificação em vez de "ausência aceitável". Zero sinal não é
 * menos arriscado que sinal-fora-de-casa; é o mesmo risco sem o alarme.
 */
export function blocksGeneration(
  job: ModalityInput & { location?: string | null },
  loc: { level: string; isHomeUf: boolean }
): string | null {
  if (resolveModality(job).state !== "unknown") return null;
  if (loc.isHomeUf) return null;
  const motivo =
    loc.level === "unknown" ? "e a localidade não foi reconhecida" : "e a vaga é fora da UF-base";
  return `modalidade não verificada ${motivo} (${job.location ?? "?"})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pistas — evidência para o humano, não estado do sistema.

export type HintKind = "remote" | "hybrid" | "onsite";

export interface ModalityHint {
  kind: HintKind;
  /** O termo que casou, como aparece no texto. */
  term: string;
  /** Trecho ao redor, para o operador julgar sem abrir o anúncio. */
  snippet: string;
}

const PADROES: Array<{ kind: HintKind; re: RegExp }> = [
  {
    kind: "remote",
    re: /\b(100%\s*remot\w*|totalmente\s+remot\w*|trabalho\s+remot\w*|remot[oa]s?|remote(?:ly)?|home\s*office|work\s+from\s+home|anywhere)\b/gi,
  },
  { kind: "hybrid", re: /\b(h[íi]brid[oa]s?|hybrid|(?:\d+\s*)?dias?\s+no\s+escrit[óo]rio)\b/gi },
  {
    kind: "onsite",
    re: /\b(presencia\w*|on[\s-]?site|in[\s-]?office|no\s+escrit[óo]rio|aloca[çc][ãa]o\s+no\s+cliente)\b/gi,
  },
];

/**
 * Trechos do anúncio que FALAM de modalidade, para o operador ler e decidir.
 *
 * Deliberadamente não pontua, não vota e não escolhe um vencedor quando o texto
 * diz "híbrido" num parágrafo e "remoto" em outro — essa ambiguidade é justamente
 * o que o humano precisa ver. Devolve na ordem em que aparecem no texto.
 */
export function remoteHints(
  text: string | null | undefined,
  opts: { max?: number; window?: number } = {}
): ModalityHint[] {
  if (!text?.trim()) return [];
  const max = opts.max ?? 6;
  const window = opts.window ?? 60;
  const achados: Array<ModalityHint & { at: number }> = [];
  const vistos = new Set<string>();

  for (const { kind, re } of PADROES) {
    for (const m of text.matchAll(re)) {
      const term = m[0];
      const chave = `${kind}:${term.toLowerCase()}`;
      if (vistos.has(chave)) continue; // mesma palavra 12 vezes não é 12 evidências
      vistos.add(chave);
      const ini = Math.max(0, m.index - window);
      const fim = Math.min(text.length, m.index + term.length + window);
      const snippet = (ini > 0 ? "…" : "") + text.slice(ini, fim).replace(/\s+/g, " ").trim() + (fim < text.length ? "…" : "");
      achados.push({ kind, term, snippet, at: m.index });
    }
  }

  return achados
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map(({ kind, term, snippet }) => ({ kind, term, snippet }));
}
