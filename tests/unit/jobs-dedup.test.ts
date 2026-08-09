/**
 * `insertJob` — dedup por `(source, source_job_id)`, além do `jobFingerprint`
 * textual (007_watch_dedup.sql). Existe porque a vigilância por empresa relê o
 * mesmo board a cada poll, e um anúncio Gupy que muda uma vírgula no título
 * entre polls gera fingerprint diferente — sem a chave por id, duplicaria.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDb } from "../helpers/sandbox.js";
import { insertJob } from "../../src/db/repo/jobs.js";
import type { RawJob } from "../../src/core/types.js";

beforeEach(() => resetDb());

const base: RawJob = {
  source: "gupy-watch",
  sourceJobId: "99001",
  url: "https://ficticia.gupy.io/job/99001",
  title: "Especialista em Automação",
  companyName: "Fictícia Holding",
  location: "Belo Horizonte, MG",
  language: "pt",
};

describe("insertJob — dedup por (source, source_job_id)", () => {
  it("primeira vez insere normalmente", () => {
    const row = insertJob(base);
    assert.ok(row);
    assert.equal(row!.source_job_id, "99001");
  });

  it("mesmo source_job_id de novo, título e location IDÊNTICOS: dedup pelo fingerprint mesmo (comportamento antigo preservado)", () => {
    insertJob(base);
    assert.equal(insertJob(base), null);
  });

  it("mesmo source_job_id, TÍTULO EDITADO entre polls: ainda dedupa — é o caso que o fingerprint sozinho perderia", () => {
    insertJob(base);
    const editado: RawJob = { ...base, title: "Especialista em Automação de Processos" };
    assert.equal(insertJob(editado), null, "source_job_id igual barra antes do fingerprint divergir");
  });

  it("mesmo source_job_id, LOCATION REFORMATADA entre polls: ainda dedupa", () => {
    insertJob(base);
    const reformatado: RawJob = { ...base, location: "BH, MG" };
    assert.equal(insertJob(reformatado), null);
  });

  it("source_job_id DIFERENTE, mesmo título/empresa/location: dedup cross-source pelo fingerprint continua funcionando", () => {
    insertJob(base);
    const outraFonte: RawJob = { ...base, source: "gupy", sourceJobId: "diferente-999" };
    assert.equal(
      insertJob(outraFonte),
      null,
      "a mesma vaga achada por busca por termo e por vigilância não duplica"
    );
  });

  it("fontes sem source_job_id continuam usando só o fingerprint (índice é parcial)", () => {
    const semId: RawJob = { ...base, source: "manual", sourceJobId: undefined };
    const primeira = insertJob(semId);
    assert.ok(primeira);
    assert.equal(insertJob({ ...semId }), null, "fingerprint ainda dedupa sem source_job_id");
  });

  it("insertJob NÃO garante isolamento entre empresas sozinho — é responsabilidade de quem preenche sourceJobId", () => {
    // O id bruto da Gupy é único por EMPRESA, não globalmente, e `source` é o
    // mesmo literal ("gupy-watch") pra todas as empresas vigiadas — então
    // `insertJob` colide se receber o MESMO sourceJobId não-escopado de duas
    // empresas diferentes. Documentado aqui, corrigido na camada certa:
    // `fetchGupyCompanyJobs` (company-gupy.ts) prefixa com o handle
    // (`"<handle>:<id>"`) antes de chegar aqui — ver tests/unit/company-gupy.test.ts.
    // Este teste prova o contrato de insertJob como ele é, não o comportamento
    // fim-a-fim da vigilância.
    insertJob(base);
    const mesmoIdOutraEmpresa: RawJob = {
      ...base,
      companyName: "Outra Empresa",
      url: "https://outra.gupy.io/job/99001",
      location: "São Paulo, SP",
    };
    assert.equal(
      insertJob(mesmoIdOutraEmpresa),
      null,
      "insertJob confia no sourceJobId recebido — não deduplica por conta própria entre empresas"
    );
  });
});
