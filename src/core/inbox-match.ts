/**
 * Cascata de casamento e-mail↔candidatura (docs/roadmap.md → Onda 3, `inbox-watch`).
 * Só os 2 estágios "prontos" do plano: (1) thread já casado antes, (2) domínio do
 * remetente == domínio da empresa. Estágio 3 (similaridade via ATS-sender) não existe
 * de propósito — a medição do Bloco C decide se ele precisa nascer.
 *
 * Pura e determinística: sem I/O, sem `Date.now()`. Testável sem banco nem rede.
 */

export interface InboxMessageForMatch {
  id: string;
  gmailThreadId: string;
  fromDomain: string;
  receivedAt: string; // ISO — ordena a cascata, thread só herda de mensagem ANTERIOR
}

export interface ApplicationForMatch {
  applicationId: string;
  /** domínio normalizado (minúsculo, sem "www."), ou null se a empresa não tem domínio conhecido. */
  companyDomain: string | null;
}

export type MatchMethod = "thread" | "domain";

export interface MatchResult {
  messageId: string;
  applicationId: string | null;
  method: MatchMethod | null;
  /** por que ficou sem match — só presente quando applicationId é null. */
  reason?: "no-domain-hit" | "domain-ambiguous";
}

/**
 * Roda a cascata sobre TODAS as mensagens de uma vez, em ordem cronológica.
 * Estágio 1 só existe porque o Estágio 2 (ou um match manual futuro) alimentou o
 * mapa thread→application de uma mensagem ANTERIOR no mesmo thread — "frio" na
 * primeira mensagem de cada thread, exatamente como o plano registra.
 *
 * Domínio compartilhado por mais de uma candidatura (duas aplicações na mesma
 * empresa) fica AMBÍGUO de propósito — não escolhe a mais recente por adivinhação,
 * é exatamente o tipo de falso positivo que o plano pede pra vigiar.
 */
export function runMatchCascade(
  messages: readonly InboxMessageForMatch[],
  applications: readonly ApplicationForMatch[]
): MatchResult[] {
  const byDomain = new Map<string, string[]>();
  for (const app of applications) {
    if (!app.companyDomain) continue;
    const list = byDomain.get(app.companyDomain) ?? [];
    list.push(app.applicationId);
    byDomain.set(app.companyDomain, list);
  }

  const threadToApplication = new Map<string, string>();
  const sorted = [...messages].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const results: MatchResult[] = [];

  for (const msg of sorted) {
    const viaThread = threadToApplication.get(msg.gmailThreadId);
    if (viaThread) {
      results.push({ messageId: msg.id, applicationId: viaThread, method: "thread" });
      continue;
    }

    const candidates = byDomain.get(msg.fromDomain);
    if (candidates && candidates.length === 1) {
      const applicationId = candidates[0]!;
      threadToApplication.set(msg.gmailThreadId, applicationId);
      results.push({ messageId: msg.id, applicationId, method: "domain" });
      continue;
    }

    results.push({
      messageId: msg.id,
      applicationId: null,
      method: null,
      reason: candidates && candidates.length > 1 ? "domain-ambiguous" : "no-domain-hit",
    });
  }

  return results;
}

/** Normaliza um domínio de e-mail (minúsculo, sem "www."). Mesma normalização em captura e comparação. */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}
