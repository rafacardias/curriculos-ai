/**
 * Taxonomia de motivo — a condição que o BUG-007 exigia para o aprendizado voltar
 * a fazer sentido.
 *
 * O QUE ACONTECEU. `preference_weights` aprendia −1 em até 11 chaves a cada
 * rejeição, sem nunca olhar POR QUE a vaga foi rejeitada. Medido em 2026-08-07:
 * cinco rejeições cujo motivo o operador digitou como "Hibridas em outras cidades"
 * ensinaram ao sistema que ele não gosta de `agentes de ia` (−1), `vector database`
 * (−1), `openai` (−0,9), `orquestração` (−3) e `linkedin` (−3,5) — sendo que
 * LinkedIn é a fonte de 11 das 16 vagas da fila dele. O motivo estava gravado no
 * evento e era ignorado no aprendizado.
 *
 * O CONSERTO NÃO É CLASSIFICAR TEXTO. Adivinhar a classe a partir do motivo livre
 * seria a CLASSE-01 forma B outra vez: uma frase não declara a própria natureza.
 * Quem declara é o operador, num campo fechado, no momento em que rejeita. O texto
 * livre continua existindo — como nota, não como sinal.
 *
 * REGRA DO SILÊNCIO. Classe ausente **não aprende**. Um chamador antigo que não
 * mande a classe não ganha permissão por omissão: ausência de declaração não é
 * declaração de que é temático. É a mesma regra do `modality`.
 */

export type FeedbackVerdict = "aprovar" | "rejeitar";

/**
 * Por que a vaga foi rejeitada. Vocabulário fechado, e é isso que o torna útil:
 * lista aberta viraria texto livre com outro nome.
 */
export type ReasonClass =
  /** Não posso me candidatar: modalidade, localidade, tecnologia que não tenho,
   *  anos exigidos, idioma, senioridade. Diz respeito a MIM, não ao tema. */
  | "elegibilidade"
  /** Não quero esse tipo de trabalho — área, produto, formato da função. */
  | "tema"
  /** Qualquer outra coisa. Não ensina, por precaução. */
  | "outro";

export const REASON_CLASSES: ReadonlyArray<{ id: ReasonClass; label: string; learns: boolean }> = [
  { id: "elegibilidade", label: "não posso (modalidade, local, tecnologia, anos, idioma)", learns: false },
  { id: "tema", label: "não quero esse tipo de trabalho", learns: true },
  { id: "outro", label: "outro motivo", learns: false },
];

export function parseReasonClass(raw: string | null | undefined): ReasonClass | null {
  const v = (raw ?? "").trim().toLowerCase();
  return REASON_CLASSES.some((c) => c.id === v) ? (v as ReasonClass) : null;
}

export interface LearningDecision {
  /** Se os pesos devem se mover. */
  learn: boolean;
  /** Quanto, quando `learn`. */
  delta: -1 | 0 | 1;
  /** Frase curta para log e para a UI. O operador tem que saber o que NÃO aconteceu. */
  why: string;
}

export interface LearningInput {
  verdict: FeedbackVerdict;
  /** Só faz sentido em rejeição. Ignorado na aprovação. */
  reasonClass?: ReasonClass | null;
  /**
   * Já houve aprendizado deste mesmo veredito para esta vaga?
   *
   * Existe por causa do retry: uma vaga cuja geração falhou volta à fila, e o
   * operador clica Aplicar de novo. Sete cliques na mesma vaga não são sete
   * aprovações — a idempotência é por vaga, não por clique.
   */
  alreadyLearned: boolean;
}

export function decideLearning({ verdict, reasonClass, alreadyLearned }: LearningInput): LearningDecision {
  if (alreadyLearned) {
    return { learn: false, delta: 0, why: "já houve aprendizado desta vaga — idempotente por job_id" };
  }
  if (verdict === "aprovar") {
    return { learn: true, delta: 1, why: "aprovação: sinal temático positivo" };
  }
  if (!reasonClass) {
    return { learn: false, delta: 0, why: "motivo sem classe declarada — silêncio não autoriza aprendizado" };
  }
  if (reasonClass === "tema") {
    return { learn: true, delta: -1, why: "rejeição temática: o tema não interessa" };
  }
  return {
    learn: false,
    delta: 0,
    why:
      reasonClass === "elegibilidade"
        ? "rejeição por elegibilidade não ensina tema (BUG-007)"
        : "classe 'outro' não move peso por precaução",
  };
}
