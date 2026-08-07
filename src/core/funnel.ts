/**
 * Contagem do funil — UMA definição, um lugar.
 *
 * O QUE ACONTECEU. "Aplicada" tinha quatro definições simultâneas na tela, e duas
 * delas estavam olhando para a mesma linha:
 *
 *   card do topo      applications WHERE status NOT IN ('kit_ready','submitting')  → 1
 *   coluna do kanban  status = 'applied'                                           → 0
 *   painel "Aplicadas" status = 'applied'                                          → 0
 *   painel "Por fonte" toda linha de applications                                  → 1
 *
 * O "1" era a Freedom24, RETIRADA por exigir russo nativo. Contar `withdrawn`
 * como aplicada é pior que contar zero: transforma uma desistência em progresso.
 *
 * "Na fila" tinha duas: o card contava `jobs.status='queued'` cru (20) e a lista
 * excluía as que já viraram kit (11). Em `jobs` a vaga continua `queued` enquanto
 * o funil vive em `applications`, então as 9 apareciam nos dois lugares.
 *
 * É a CLASSE-01 na camada de leitura — não ausência de sinal, ausência de
 * definição única. A cura é a mesma que a do `hardFilterReason`: uma função,
 * dois (aqui, quatro) chamadores.
 */
import { getDb } from "../db/client.js";

export interface FunnelCounts {
  /** Vagas esperando decisão: `queued` E ainda sem linha em `applications`. */
  queued: number;
  /** Kits gerados e não enviados. */
  kitReady: number;
  /** Envios de fato feitos — e só eles. `withdrawn` NÃO conta. */
  applied: number;
  /** Teve alguma resposta da empresa. */
  responded: number;
  interviews: number;
  offers: number;
  /** Desistências e recusas. Contadas à parte para não sumirem nem inflarem nada. */
  withdrawn: number;
  rejected: number;
  ghosted: number;
}

/**
 * `applied` é cumulativo: quem chegou a `screening` passou por `applied`, e um
 * funil onde a etapa seguinte esvazia a anterior mede errado a taxa de resposta.
 */
export const APLICADAS = ["applied", "screening", "interview", "offer", "rejected", "ghosted"];
export const RESPONDERAM = ["screening", "interview", "offer"];

export function funnelCounts(): FunnelCounts {
  const db = getDb();
  const n = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...(args as never[])) as { n: number }).n;
  const porStatus = (lista: string[]) =>
    n(`SELECT COUNT(*) AS n FROM applications WHERE status IN (${lista.map(() => "?").join(",")})`, ...lista);

  return {
    queued: n(
      `SELECT COUNT(*) AS n FROM jobs
        WHERE status = 'queued'
          AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id)`
    ),
    kitReady: porStatus(["kit_ready"]),
    applied: porStatus(APLICADAS),
    responded: porStatus(RESPONDERAM),
    interviews: porStatus(["interview", "offer"]),
    offers: porStatus(["offer"]),
    withdrawn: porStatus(["withdrawn"]),
    rejected: porStatus(["rejected"]),
    ghosted: porStatus(["ghosted"]),
  };
}
