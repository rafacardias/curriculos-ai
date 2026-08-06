# Suíte de testes

Zero dependências novas: `node:test` + `node:assert` nativos, rodados com `tsx` como loader.

```bash
npm test              # suíte inteira
npm run test:watch    # modo watch
npm run onda0         # typecheck + precheck de Chrome + suíte  (o portão)
./scripts/gate-onda0.sh   # o portão completo, incluindo a prova de que o banco real não foi tocado
```

## A regra que não se quebra

**Nenhum teste pode encostar em `db/curriculos.db`, `config/config.yaml` ou `profile/*.yaml` reais.**

O isolamento vem de uma única variável: `CURRICULOS_ROOT`, lida em `src/db/client.ts`. Ela move
a raiz de *todos* os caminhos de dado (`db/`, `config/`, `profile/`, `output/`) para
`.test-sandbox/`, recriada do zero pelo `pretest` a cada execução. As migrations continuam
sendo lidas do repositório, nunca da sandbox.

`tests/helpers/sandbox.ts` roda `assertSandboxed()` **no import** — aborta se a variável não
estiver setada, se a raiz for o repositório, ou se o caminho não terminar em `.test-sandbox`.
Por isso **todo arquivo de teste importa esse helper**, mesmo os que não tocam o banco.

## Rede

`tests/helpers/net.ts` substitui `globalThis.fetch` por um stub com **kill-switch**: URL sem
fixture registrada **falha o teste** em vez de ir à internet em silêncio. As rotas das 5 fontes
estão em `tests/helpers/routes.ts`.

O stub deixa todo o código real rodar — `AbortSignal.timeout`, os schemas zod, `stripHtml`,
`parseRssItems`, os regex do LinkedIn. Injetar `fetchJson` pularia justamente a camada frágil.

## Layout

```
tests/
  helpers/     sandbox (trava + resetDb + runCli) · net (stub) · routes (fixtures HTTP)
  fixtures/
    sandbox-root/   copiado para .test-sandbox/ pelo pretest (config + perfil "Ana Teste")
    http/           payloads congelados das 5 fontes
    kit/            currículos sintéticos: válido, citação falsa, bullet sem citação
  unit/        dedup · truthcheck · keywords-coverage · scoring · policy · field-resolver
               pipeline · adapters-parsing · adapters-remote-only
  e2e/         smoke-pipeline (buscar→score→gerar→truthcheck→PDF) · truthcheck-exit2
```

## Testes que congelam bugs

Vários testes asseram o comportamento **atual e defeituoso** de propósito — estão marcados com
`BUG-00N CONGELADO` e explicam a aritmética ou o mecanismo. Ver `KNOWN-BUGS.md`.

**Quando um desses testes falhar, provavelmente não é regressão: é a correção chegando.**
Confira o bug no `KNOWN-BUGS.md` e inverta o teste junto com o código.

## Concorrência

`--test-concurrency=1`. A sandbox é um único arquivo SQLite compartilhado entre os arquivos de
teste; serializar torna determinísticos o cap semanal do `decidePolicy`, o round-robin do
`assignVariant` e o `resetDb()`.
