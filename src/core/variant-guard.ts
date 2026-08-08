/**
 * Guarda da variante do experimento — CLASSE-01 forma A, camada de experimento.
 *
 * O `prepare` atribui a variante e a grava no bundle; o `finalize` a copia do
 * bundle para `resume_versions.variant`; o `/painel` agrega conversão por
 * variante. Nada nesse caminho verifica que o **redator** conhecia a variante.
 *
 * O buraco, medido em 2026-08-07: as `REGRAS` do prompt portátil nunca
 * mencionavam `variant`. Um kit escrito pelo caminho novo teria sido registrado
 * como "variante B" tendo sido redigido sem disciplina de variante nenhuma — e
 * **nenhum número acusaria**. Não é regra perdida: é dado inválido injetado numa
 * série que o operador vai usar para decidir.
 *
 * Isso é pior que um kit ruim. Kit ruim aparece na cobertura; instrumento
 * corrompido não aparece em lugar nenhum, e contamina toda decisão futura
 * tomada a partir da série.
 *
 * Verificado no banco: as 19 versões existentes vieram todas do caminho
 * agêntico (o `--out` do `kit generate` nunca registra), então **nada
 * não-computável entrou**. O guarda existe para que continue assim.
 *
 * A regra é: **variante ausente NÃO vira default**. Se o experimento está
 * ligado e a variante não está declarada no bundle, a operação falha.
 */

export class VariantError extends Error {}

export interface BundleParcial {
  variant?: unknown;
}

/**
 * Falha se o experimento estiver ligado e o bundle não declarar variante.
 *
 * Quando `experimentsEnabled` é falso, `variant: null` é o estado correto e
 * esperado — a ausência é significativa e declarada, não omissão.
 */
export function assertVariantDeclarada(
  bundle: BundleParcial | null | undefined,
  experimentsEnabled: boolean,
  onde: string
): void {
  if (!experimentsEnabled) return;
  if (!bundle) {
    throw new VariantError(
      `${onde}: bundle.json ausente — sem ele não dá para saber qual variante o redator recebeu.`
    );
  }
  const v = bundle.variant as { id?: unknown } | null | undefined;
  if (v == null || typeof v !== "object" || typeof v.id !== "string" || !v.id.trim()) {
    throw new VariantError(
      `${onde}: experimento LIGADO e o bundle não declara \`variant\`.\n` +
        "Recusando em vez de assumir um default: um kit registrado com variante que o redator\n" +
        "não conhecia entra no warehouse do /painel como dado válido e corrompe a série de\n" +
        "conversão — sem que nenhuma métrica acuse.\n" +
        "Rode `kit prepare <job_id>` de novo, ou desligue `experiments.enabled` no config."
    );
  }
}
