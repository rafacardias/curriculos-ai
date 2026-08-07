/**
 * Escrita de feedback — UM caminho, dois chamadores.
 *
 * Antes disto, `src/cli/feedback.ts` e `src/server/index.ts` calculavam as chaves
 * de preferência e faziam o upsert cada um por conta própria, com o mesmo código
 * copiado. É a mesma armadilha que o `hardFilterReason` já tinha caído: dois
 * caminhos que precisam concordar acabam divergindo no dia em que um deles muda.
 * Aqui o dia chegou — a regra de classe de motivo teria que ser escrita duas vezes.
 */
import { ulid } from "ulid";
import { getDb, nowIso, transaction } from "../client.js";
import { loadConfig } from "../../core/config.js";
import { termsPresent } from "../../core/keywords.js";
import { decideLearning, type FeedbackVerdict, type ReasonClass, type LearningDecision } from "../../core/feedback.js";
import { setJobStatus, type JobRow } from "./jobs.js";

/**
 * As chaves que este feedback tocaria: empresa, fonte, senioridade e até 8
 * keywords da trilha presentes no anúncio.
 *
 * Exportada porque o reparo de 2026-08-07 precisa reconstruir EXATAMENTE as mesmas
 * chaves que a escrita original produziu — se ele recalculasse por outro caminho,
 * o estorno erraria o alvo.
 */
export function preferenceKeysFor(job: JobRow): string[] {
  const db = getDb();
  // `source:*` NÃO entra. Item 3 do BUG-007: a fonte é canal de coleta, não
  // preferência. Rejeitar uma vaga do LinkedIn pelo tema dela não diz nada sobre
  // o LinkedIn — 11 das 16 vagas da fila vêm de lá, e punir o mensageiro pelo
  // conteúdo da mensagem foi como `source:gupy` (a única fonte 100% brasileira,
  // para quem configurou `location: Brazil`) chegou a −5,65 enquanto
  // `source:remoteok` — o board que devolveu bombeiro de aeroporto em Mangaluru
  // — virou o maior peso positivo do banco.
  //
  // Removido da POPULAÇÃO, não zerado com peso: chave que não é escrita nem lida
  // não volta por descuido. Ver `PREFERENCE_KINDS`.
  const keys = [`company:${job.company_name.toLowerCase()}`];
  if (job.seniority) keys.push(`seniority:${job.seniority}`);
  const tracks = db.prepare("SELECT keywords FROM profile_tracks").all() as unknown as Array<{ keywords: string }>;
  const lexicon = tracks.flatMap((t) => JSON.parse(t.keywords) as string[]);
  for (const kw of termsPresent(`${job.title} ${job.description ?? ""}`, lexicon).slice(0, 8)) {
    keys.push(`kw:${kw.toLowerCase()}`);
  }
  return keys;
}

/** Move os pesos. Isolada para que o reparo possa chamá-la com o delta invertido. */
export function bumpPreferenceWeights(keys: string[], delta: number): void {
  const cap = loadConfig().preferences.max_weight;
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO preference_weights (key, weight, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       weight = MAX(${-cap}, MIN(${cap}, preference_weights.weight + excluded.weight)),
       updated_at = excluded.updated_at`
  );
  const at = nowIso();
  for (const key of keys) upsert.run(key, delta, at);
}

/**
 * Este veredito já moveu peso para esta vaga alguma vez?
 *
 * Dois formatos de evento convivem. Os novos trazem `learned` explícito. Os
 * antigos, anteriores à taxonomia, não têm o campo — e naquele comportamento
 * TODO feedback movia peso, então um evento antigo com `keys` conta como
 * aprendizado ocorrido. Ler o legado como "não aprendeu" faria o primeiro clique
 * pós-correção somar em cima do que já estava lá.
 */
export function hasLearnedFrom(jobId: string, verdict: FeedbackVerdict): boolean {
  const tipo = verdict === "aprovar" ? "feedback_approve" : "feedback_reject";
  const rows = getDb()
    .prepare("SELECT payload FROM events WHERE entity_id = ? AND type = ?")
    .all(jobId, tipo) as Array<{ payload: string | null }>;
  return rows.some((r) => {
    let p: { learned?: boolean; keys?: unknown };
    try {
      p = JSON.parse(r.payload ?? "{}");
    } catch {
      return false;
    }
    if (typeof p.learned === "boolean") return p.learned;
    return Array.isArray(p.keys) && p.keys.length > 0; // legado
  });
}

export interface FeedbackResult {
  decision: LearningDecision;
  keys: string[];
}

/**
 * Registra o feedback e move os pesos SE a decisão autorizar.
 *
 * O evento é gravado sempre, com a classe e com `learned` — é o que torna a tabela
 * auditável quanto à classe de motivo que gerou cada peso, o segundo requisito
 * para religar `scoring.preference`.
 */
export function applyFeedback(opts: {
  job: JobRow;
  verdict: FeedbackVerdict;
  reasonClass?: ReasonClass | null;
  reason?: string | null;
  via: string;
}): FeedbackResult {
  const { job, verdict, reasonClass = null, reason = null, via } = opts;
  const decision = decideLearning({
    verdict,
    reasonClass,
    alreadyLearned: hasLearnedFrom(job.id, verdict),
  });
  const keys = decision.learn ? preferenceKeysFor(job) : [];

  transaction(() => {
    if (decision.learn) bumpPreferenceWeights(keys, decision.delta);
    getDb()
      .prepare("INSERT INTO events (id, entity, entity_id, type, payload, created_at) VALUES (?, 'job', ?, ?, ?, ?)")
      .run(
        ulid(),
        job.id,
        verdict === "aprovar" ? "feedback_approve" : "feedback_reject",
        JSON.stringify({
          reason,
          reason_class: reasonClass,
          learned: decision.learn,
          why: decision.why,
          keys,
          via,
        }),
        nowIso()
      );
    if (verdict === "rejeitar") setJobStatus(job.id, "rejected");
  });

  return { decision, keys };
}
