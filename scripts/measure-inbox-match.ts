/**
 * measure-inbox-match — Bloco C da sessão de 2026-08-11 (inbox-watch, parada dura).
 *
 * Mede a taxa de match e-mail↔candidatura usando SÓ os 2 estágios prontos da
 * cascata (thread_id, from_domain — src/core/inbox-match.ts), contra as
 * `applications` REAIS e os `inbox_messages` já ingeridos. Read-only: não
 * grava nada, não toca `application_id` em `inbox_messages` (essa coluna só
 * seria escrita por um passo de produção que ainda não existe).
 *
 * Cuidado ACHADO-16 (KNOWN-BUGS.md): a "taxa de match" aqui é sobre o
 * MECANISMO de casamento (e-mail→application_id), não sobre acurácia de
 * status histórico — não compara contra `applications.status` gravado.
 *
 * `npx tsx scripts/measure-inbox-match.ts`
 */
import { listInboxMessages, type InboxMessageRow } from "../src/db/repo/inbox.js";
import { listApplicationsWithCompanyName } from "../src/db/repo/applications.js";
import { getCompanyByName } from "../src/db/repo/companies.js";
import { runMatchCascade, normalizeDomain, type ApplicationForMatch, type InboxMessageForMatch } from "../src/core/inbox-match.js";

const rawApplications = listApplicationsWithCompanyName();
const applications: ApplicationForMatch[] = rawApplications.map((a) => {
  const company = getCompanyByName(a.companyName);
  return {
    applicationId: a.applicationId,
    companyDomain: company?.domain ? normalizeDomain(company.domain) : null,
  };
});
const companyNameByApp = new Map(rawApplications.map((a) => [a.applicationId, a.companyName]));

const inboxRows = listInboxMessages();
const rowById = new Map(inboxRows.map((m) => [m.id, m]));
const messages: InboxMessageForMatch[] = inboxRows.map((m) => ({
  id: m.id,
  gmailThreadId: m.gmail_thread_id,
  fromDomain: m.from_domain,
  receivedAt: m.received_at,
}));

const results = runMatchCascade(messages, applications);

const matchedViaThread = new Set(results.filter((r) => r.method === "thread").map((r) => r.applicationId!));
const matchedViaDomain = new Set(results.filter((r) => r.method === "domain").map((r) => r.applicationId!));
const matchedCombined = new Set([...matchedViaThread, ...matchedViaDomain]);

const totalApps = applications.length;
const appsWithDomain = applications.filter((a) => a.companyDomain).length;
const appsWithoutDomain = applications.filter((a) => !a.companyDomain);

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`);

console.log("=".repeat(78));
console.log("inbox-watch — Bloco C: medição da cascata de match (Estágios 1+2)");
console.log("=".repeat(78));

console.log(`\nN candidaturas consideradas: ${totalApps}`);
console.log(`  com domínio de empresa conhecido: ${appsWithDomain}`);
console.log(`  sem domínio conhecido (nome de empresa não confiável ou não pesquisado): ${appsWithDomain < totalApps ? totalApps - appsWithDomain : 0}`);
console.log(`N e-mails ingeridos na janela: ${messages.length}`);

console.log(`\n--- Taxa de match por estágio (denominador: N candidaturas) ---`);
console.log(
  `Estágio 1 (thread_id, herda de match anterior): ${matchedViaThread.size}/${totalApps} = ${pct(matchedViaThread.size, totalApps)}`
);
console.log(
  `  aviso: sem seed manual pré-existente, todo match do Estágio 1 nasceu de um match do Estágio 2` +
    ` no mesmo thread — não há "match puro de estágio 1" nesta medição (frio na primeira vez, como o plano previu).`
);
console.log(
  `Estágio 2 (from_domain == domínio da empresa): ${matchedViaDomain.size}/${totalApps} = ${pct(matchedViaDomain.size, totalApps)}`
);
console.log(
  `Combinado (1+2, união): ${matchedCombined.size}/${totalApps} = ${pct(matchedCombined.size, totalApps)}`
);

console.log(`\n--- Critério de decisão (~60%) ---`);
const combinedRate = matchedCombined.size / totalApps;
console.log(
  combinedRate >= 0.6
    ? `PASSA — ${pct(matchedCombined.size, totalApps)} ≥ ~60%.`
    : `NÃO PASSA — ${pct(matchedCombined.size, totalApps)} < ~60%.`
);

console.log(`\n--- Estatística de mensagens (secundária, não é o critério) ---`);
const matchedMessages = results.filter((r) => r.applicationId).length;
console.log(`Mensagens casadas: ${matchedMessages}/${messages.length} = ${pct(matchedMessages, messages.length)}`);
console.log(`(a maioria das ${messages.length} mensagens é correspondência pessoal fora do escopo de candidatura — número baixo aqui é esperado, não é o sinal relevante.)`);

console.log(`\n--- Amostra pra inspeção manual de falso positivo — TODAS as mensagens casadas ---`);
for (const r of results.filter((r) => r.applicationId)) {
  const row = rowById.get(r.messageId)!;
  const company = companyNameByApp.get(r.applicationId!);
  console.log(`[${r.method}] "${row.subject}" de ${row.from_address} → candidatura: ${company}`);
}
if (matchedMessages === 0) console.log("(nenhuma)");

console.log(`\n--- Candidaturas SEM domínio conhecido (não entraram na comparação do Estágio 2) ---`);
for (const a of appsWithoutDomain) {
  console.log(`- ${companyNameByApp.get(a.applicationId)} (application_id ${a.applicationId})`);
}
if (!appsWithoutDomain.length) console.log("(nenhuma)");

console.log(`\n--- Candidaturas com domínio conhecido mas SEM match (razão provável) ---`);
for (const a of applications) {
  if (!a.companyDomain) continue;
  if (matchedCombined.has(a.applicationId)) continue;
  const anyFromDomain = messages.some((m) => m.fromDomain === a.companyDomain);
  console.log(
    `- ${companyNameByApp.get(a.applicationId)} (${a.companyDomain}): ` +
      (anyFromDomain
        ? "e-mail do domínio existe na janela mas não casou (checar cascata)"
        : "nenhum e-mail desse domínio chegou na janela — sem resposta ainda, ou resposta veio de endereço genérico/pessoal")
  );
}

console.log(`\n${"=".repeat(78)}`);
