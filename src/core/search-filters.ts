/**
 * Filtro cliente ÚNICO — o que a fonte não resolve no servidor dela.
 *
 * Existe um só lugar que aplica isto (`runSearch`, logo depois de cada adapter
 * retornar e antes do insert). Os adapters continuam burros: nenhum deles chama
 * esta função. Filtro espalhado por adapter é como `remote_only` virou
 * configuração morta — cada fonte "resolvendo" à sua maneira, nenhuma resolvendo.
 */
import type { RawJob } from "./types.js";
import type { AdapterCapabilities, SearchParams } from "../adapters/types.js";

/** O que fazer com vaga sem modalidade declarada sob `remoteOnly`. */
export type UnknownRemotePolicy = "pass" | "drop";

export interface ClientFilterResult {
  kept: RawJob[];
  /** Critério pedido que este filtro NÃO aplicou, dito em voz alta. */
  ignored: string[];
}

export function applyClientSideFilters(
  jobs: RawJob[],
  params: SearchParams,
  caps: AdapterCapabilities,
  opts: { unknownRemoteType: UnknownRemotePolicy }
): ClientFilterResult {
  const ignored: string[] = [];
  let kept = jobs;

  // A fonte já resolveu (`caps.remoteOnly`) ou é remota por construção
  // (`caps.allRemote`) → filtrar aqui seria refazer trabalho feito.
  if (params.remoteOnly && !caps.remoteOnly && !caps.allRemote) {
    kept = kept.filter((j) => {
      if (j.remoteType === "remote") return true;
      if (j.remoteType === "onsite" || j.remoteType === "hybrid") return false;
      // Modalidade ausente é AUSÊNCIA DE DADO, não presencial. Quem decide é o
      // call-site, por escrito.
      return opts.unknownRemoteType === "pass";
    });
    const dropped = jobs.length - kept.length;
    if (dropped > 0) {
      ignored.push(
        `remoteOnly aplicado no cliente: ${dropped} de ${jobs.length} vagas descartadas ` +
          `(onsite/hybrid); modalidade ausente = "${opts.unknownRemoteType}"`
      );
    }
  }

  if (params.location && !caps.location) {
    // Filtrar geografia por texto livre num board remoto internacional mata
    // vaga boa ("Anywhere", "EMEA", "LATAM" não casam com "Brazil"). Melhor
    // dizer que não filtrou do que fingir que filtrou.
    ignored.push(
      `location "${params.location}" NÃO foi aplicada: a fonte não resolve localização ` +
        `e casar texto livre descartaria vaga remota elegível`
    );
  }

  return { kept, ignored };
}
