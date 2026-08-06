/**
 * O mestre por trilha é o que substitui "o LLM redige o bullet a cada vaga" por
 * "o operador revisou uma vez". Estes testes congelam as checagens que tornam
 * essa substituição confiável — todas mecânicas, porque julgamento é o que a
 * revisão humana faz, não o código.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stringify } from "yaml";
import {
  parseMaster,
  validateMaster,
  profileFactsHash,
  type MasterResume,
} from "../../src/core/master-resume.js";
import { loadMasterProfile } from "../../src/core/profile.js";

const profile = loadMasterProfile(); // perfil sintético da sandbox (Ana Teste)

/** Mestre mínimo e VÁLIDO sobre a Ana Teste, para cada teste degradar um pedaço. */
function mestreValido(over: Partial<MasterResume> = {}): MasterResume {
  return {
    version: 1,
    track: "qa",
    reviewed_at: "2026-08-06T20:00:00Z",
    source_hash: profileFactsHash(profile),
    headline_variants: ["Analista de QA"],
    bullets: [
      {
        fact_id: "exp-acme-qa.f1",
        text: "Estruturei a suíte de regressão do checkout [exp:exp-acme-qa.f1]",
        synonyms: [],
      },
    ],
    ...over,
  };
}

describe("validateMaster — o que impede o mestre de virar outro BUG-008", () => {
  it("mestre bem formado não tem problema nenhum", () => {
    assert.deepEqual(validateMaster(mestreValido(), profile), []);
  });

  it("fact_id inexistente reprova", () => {
    const m = mestreValido({
      bullets: [{ fact_id: "nao-existe.f9", text: "algo [exp:nao-existe.f9]", synonyms: [] }],
    });
    const p = validateMaster(m, profile);
    assert.equal(p[0]?.kind, "fato_inexistente");
  });

  it("id de EXPERIÊNCIA não vale como lastro — tem de ser id de fato", () => {
    // `allFactIds()` aceita os dois, então `[exp:exp-acme-qa]` passa no truthcheck
    // sem apontar para fato nenhum. O mestre não herda esse buraco.
    const m = mestreValido({
      bullets: [{ fact_id: "exp-acme-qa", text: "algo [exp:exp-acme-qa]", synonyms: [] }],
    });
    assert.equal(validateMaster(m, profile)[0]?.kind, "fato_inexistente");
  });

  it("bullet sem a própria citação reprova", () => {
    const m = mestreValido({
      bullets: [{ fact_id: "exp-acme-qa.f1", text: "Estruturei a suíte", synonyms: [] }],
    });
    assert.equal(validateMaster(m, profile)[0]?.kind, "citacao_ausente");
  });

  it("sinônimo cuja origem NÃO está no fato reprova — é o BUG-008 pela outra porta", () => {
    const m = mestreValido({
      bullets: [
        {
          fact_id: "exp-acme-qa.f1",
          text: "Estruturei a suíte de regressão do checkout [exp:exp-acme-qa.f1]",
          synonyms: [{ term: "machine learning", from: "redes neurais" }],
        },
      ],
    });
    const p = validateMaster(m, profile);
    assert.equal(p[0]?.kind, "sinonimo_sem_lastro");
    assert.match(p[0]!.detail, /"machine learning".*"redes neurais".*não existe no fato/);
  });

  it("sinônimo com origem presente no fato passa, e a comparação ignora acento e caixa", () => {
    const fato = profile.experiences.flatMap((e) => e.facts).find((f) => f.id === "exp-acme-qa.f1")!;
    const palavra = fato.text.split(/\s+/).find((w) => w.length > 5)!;
    const m = mestreValido({
      bullets: [
        {
          fact_id: "exp-acme-qa.f1",
          text: "Estruturei a suíte de regressão do checkout [exp:exp-acme-qa.f1]",
          synonyms: [{ term: "regression testing", from: palavra.toUpperCase() }],
        },
      ],
    });
    assert.deepEqual(validateMaster(m, profile), []);
  });

  it("origem em skills[] também vale, não só em text", () => {
    const fato = profile.experiences.flatMap((e) => e.facts).find((f) => f.skills.length)!;
    const m = mestreValido({
      bullets: [
        {
          fact_id: fato.id,
          text: `Fiz coisa [exp:${fato.id}]`,
          synonyms: [{ term: "termo do JD", from: fato.skills[0]! }],
        },
      ],
    });
    assert.deepEqual(validateMaster(m, profile), []);
  });

  it("perfil alterado depois do mestre é detectado pelo hash", () => {
    const m = mestreValido({ source_hash: "0000000000000000" });
    assert.ok(validateMaster(m, profile).some((p) => p.kind === "perfil_mudou"));
  });

  it("reviewed_at nulo bloqueia o uso — a revisão humana é obrigatória", () => {
    const m = mestreValido({ reviewed_at: null });
    assert.ok(validateMaster(m, profile).some((p) => p.kind === "sem_revisao"));
  });

  it("reporta TODOS os problemas de uma vez, não o primeiro", () => {
    const m = mestreValido({
      reviewed_at: null,
      source_hash: "0000000000000000",
      bullets: [{ fact_id: "nao-existe.f1", text: "x", synonyms: [] }],
    });
    const kinds = validateMaster(m, profile).map((p) => p.kind);
    assert.ok(kinds.length >= 3, `esperava 3+ problemas, veio ${kinds.join(", ")}`);
  });
});

describe("profileFactsHash", () => {
  it("é estável entre chamadas", () => {
    assert.equal(profileFactsHash(profile), profileFactsHash(profile));
  });

  it("não depende da ordem das experiências no YAML", () => {
    const invertido = { ...profile, experiences: [...profile.experiences].reverse() };
    assert.equal(profileFactsHash(profile), profileFactsHash(invertido));
  });

  it("muda quando um fato muda", () => {
    const alterado = structuredClone(profile);
    alterado.experiences[0]!.facts[0]!.text += " (editado)";
    assert.notEqual(profileFactsHash(profile), profileFactsHash(alterado));
  });
});

describe("parseMaster — o schema recusa YAML malformado", () => {
  it("aceita o mestre válido serializado", () => {
    assert.equal(parseMaster(stringify(mestreValido())).track, "qa");
  });

  it("recusa mestre sem bullets", () => {
    assert.throws(() => parseMaster(stringify(mestreValido({ bullets: [] }))));
  });

  it("recusa mestre sem headline", () => {
    assert.throws(() => parseMaster(stringify(mestreValido({ headline_variants: [] }))));
  });

  it("recusa sinônimo sem `from` — a origem não é opcional", () => {
    const yaml = stringify({
      ...mestreValido(),
      bullets: [{ fact_id: "exp-acme-qa.f1", text: "x [exp:exp-acme-qa.f1]", synonyms: [{ term: "só o termo" }] }],
    });
    assert.throws(() => parseMaster(yaml));
  });
});
