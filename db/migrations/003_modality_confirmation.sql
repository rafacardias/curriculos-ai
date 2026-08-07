-- 003_modality_confirmation.sql
--
-- ADITIVA (regra E4): apenas ADD COLUMN. Nenhum DROP, rename ou mudança de tipo.
--
-- POR QUE EXISTE. `jobs.remote_type` guarda o que o ADAPTER afirmou. Dois dos seis
-- adapters — o do LinkedIn e o `manual-url`, que é o fallback universal `/vaga` —
-- nunca preenchem esse campo: não é omissão eventual, é cegueira estrutural. No
-- acervo isso são 138 vagas com `remote_type` NULL, 14 delas na fila.
--
-- Tratar NULL como "presencial" filtraria vaga boa (é o BUG-006 pelo avesso:
-- ausência lida como evidência). Tratar NULL como "tudo bem" é pior, e é o erro
-- que o operador nomeou: candidatar-se a uma vaga presencial em São Paulo achando
-- que era remota. A saída não é adivinhar — é ter um TERCEIRO ESTADO explícito e
-- um lugar para o humano registrar a resposta quando ele for ler o anúncio.
--
-- Coluna SEPARADA de `remote_type` de propósito: sobrescrever o campo do adapter
-- com o julgamento do operador apagaria a proveniência, e depois não haveria como
-- distinguir "a fonte disse" de "o Rafael leu e disse". `resolveModality()` combina
-- as duas com precedência do operador; nenhuma das duas some.
--
-- NOTA DE NUMERAÇÃO: o plano da Onda 2 reservava o 003 para `generation_runs`
-- (Fase 3). Esta migration chegou antes; a da Fase 3 passa a ser a 004.

ALTER TABLE jobs ADD COLUMN modality_confirmed TEXT;      -- remote | hybrid | onsite
ALTER TABLE jobs ADD COLUMN modality_confirmed_at TEXT;   -- ISO-8601 UTC
ALTER TABLE jobs ADD COLUMN modality_note TEXT;           -- onde o operador leu isso
