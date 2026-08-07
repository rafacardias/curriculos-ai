# Fronteira de dados — o que sai da máquina e o que nunca sai

Escrito em 2026-08-07 porque um teste que declarava uma garantia foi derrubado, e garantia
derrubada precisa de substituta explícita — não de um comentário no código que a removeu.

**O que caiu.** `tests/e2e/smoke-pipeline.test.ts` assertava: *"o bundle vai para o Claude com as
CHAVES dos candidate_facts, nunca com os valores"*. Caiu porque a fronteira não protegia o que
dizia proteger — o bundle já levava o perfil inteiro, com nome, e-mail e telefone — e porque
custava caro: o redator via o nome do dado sem o dado e ia buscá-lo no disco, 7 dos 38 turnos de
uma geração (CLASSE-01, instância 7).

**O que entra no lugar** é este documento. A pergunta certa nunca foi *"quais campos escondemos
do modelo?"* — é **"o que sai desta máquina, e para quem"**.

---

## O que sai: exatamente o `bundle.json`, nada mais

O `PROMPT.md` é `REGRAS` (texto fixo, sem dado pessoal) + o `bundle.json` inteiro. Não há outro
canal: `buildPortablePrompt` lê **um** arquivo (`src/core/portable-prompt.ts:127-130`), não
consulta o banco e não toca em mais nada do disco.

| bloco | conteúdo | dado pessoal? |
|---|---|---|
| `profile.identity` | nome, e-mail, telefone, cidade, LinkedIn, GitHub, idiomas | **sim, direto** |
| `profile.experiences[]` | empregadores, cargos, datas, e os `facts` com `id`/`text`/`skills` | **sim** — é o histórico profissional real |
| `profile.education[]`, `.certifications[]`, `.skills` | formação e habilidades | sim |
| `candidate_facts[]` | `key` + `language` + **`value`** — pretensão salarial, aviso prévio, autorização de trabalho, anos por tecnologia | **sim** — desde 2026-08-07 |
| `tracks[]` | trilhas e keywords | derivado, não identificável |
| `known_screening_answers[]` | respostas de triagem já usadas | sim (hoje vazio: `answer_bank` sem registros) |
| `job`, `jd_keywords` | a vaga e o JD públicos | não |
| `variant`, `kit_dir`, `expected_files` | controle | não |

**Por que os `candidate_facts` podem sair.** Eles são exatamente os valores que vão ser
**digitados no formulário do empregador** — pretensão, disponibilidade, autorização de trabalho.
Escondê-los do redator não impedia que fossem enviados; só impedia que fossem escritos
corretamente. A fronteira real é entre *o que o empregador vai receber de qualquer jeito* e *o
histórico do sistema*.

## O que NUNCA sai

Nada disto entra em bundle, prompt ou payload. Não é "não sai por enquanto": não existe caminho
de código que os leia para dentro do prompt.

| nunca sai | onde vive | por quê |
|---|---|---|
| **o banco inteiro** | `db/curriculos.db` | funil, candidaturas, status, empresas, histórico |
| **feedback e `preference_weights`** | `db` | o que você rejeitou e por quê é seu, não da vaga |
| **eventos e `submissions`** | `db` | onde você se candidatou e quando |
| **memória de empresa** | `db` | notas suas sobre empregadores |
| **PDFs de origem do perfil** | `profile/sources/` | os currículos originais, com tudo |
| **kits de OUTRAS vagas** | `output/<outro_slug>/` | o bundle atual não referencia nenhum outro |
| **logs de execução** | `logs/` | contêm o prompt inteiro de gerações passadas |

O corte de "kits de outras vagas" ficou mais forte em 2026-08-07: a instrução de reaproveitar um
kit doador saiu da skill `/gerar`. Antes disso o redator lia `resume.md` de outra vaga, ou seja,
misturava kits.

---

## O destino importa tanto quanto o conteúdo

Este é o ponto que a via externa cria e que não existia antes. **O mesmo bundle, mandado para
lugares diferentes, é uma decisão diferente.**

| destino | o que rege | quando |
|---|---|---|
| **Anthropic, sob a sua assinatura** | os termos que você já aceitou para usar o Claude Code | `--via=cli`, e todo o caminho agêntico de hoje |
| **LLM de terceiro** (Perplexity, myhub, outro) | os termos **daquele** provedor, que você não revisou aqui | `--via=external`, `--via=api` |

Duas coisas que valem dizer sem rodeio:

1. **`kit prompt` só escreve um arquivo no seu disco. Ele não envia nada.** O envio é você
   colando, ou você configurando uma chave de API. Nenhum comando deste repositório manda o
   bundle para um terceiro por conta própria.
2. **Quem cola, decide.** O `PROMPT.md` carrega seu nome, e-mail, telefone e histórico completo.
   Colar num chat de terceiro é publicar isso lá, sujeito à política de retenção e treinamento
   daquele provedor. Não é pior nem melhor que mandar para a Anthropic — é **outra** decisão, e
   precisa ser tomada de propósito.

### Regra para a via externa (vale a partir da M3)

- O `kit prompt` **avisa no stdout** o que o arquivo contém antes de você copiar. Um aviso que só
  aparece na documentação não é aviso.
- A proveniência registra **quem redigiu** (`external:<nome>`), para que a comparação de
  qualidade entre vias exista e para que se saiba, depois, para onde aquele bundle foi.
- Um modo "sem identidade" (bundle com `identity` redigida) é **possível e não está construído**.
  Ele degradaria o currículo, que precisa do cabeçalho — o caminho seria redigir só o corpo e
  montar o cabeçalho localmente. Fica anotado como opção, não como promessa.

---

## O que continua valendo, e é a regra mais dura do projeto

**Nada disto pode entrar no repositório.** `profile/`, `output/`, `db/` e `logs/` são
gitignored, e desde 2026-08-07 `profile/` **nega por padrão** — a lista nomeada arquivo a arquivo
deixou passar `profile/linkedin-posts/`, criado por uma skill nova, num repositório público.

Vale inclusive, e principalmente, para "só como fixture de teste": `tests/` é tão público quanto
o resto. Quando um artefato real for prova de um defeito, **ele prova no `KNOWN-BUGS.md` e uma
fixture sintética equivalente é quem entra no teste** — é por isso que a sandbox usa a Ana Teste.
