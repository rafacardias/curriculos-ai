-- 008_answer_bank_dedup.sql
--
-- ADITIVA (regra E4): só índices novos, nenhum DROP/RENAME/mudança de tipo.
--
-- POR QUE EXISTE. `answers.ts:45` (comando `answers add`) faz UPDATE-or-INSERT
-- contra `(question_fingerprint, language, track_id, company_id)`, mas a tabela
-- nunca teve UNIQUE nessa tupla (só o índice não-único em
-- `question_fingerprint, language` de 001_init.sql:105) — duas linhas
-- duplicadas eram possíveis a nível de schema, mesma classe de falha que o
-- BUG-010 media (decisão dependente de ordem de leitura em vez de constraint).
-- Registrado em KNOWN-BUGS.md desde 2026-08-09, decisão de schema pendente
-- de execução.
--
-- POR QUE QUATRO ÍNDICES, NÃO UM. SQLite nunca trata `NULL IS NULL` como
-- colisão num índice único simples — `UNIQUE (question_fingerprint, language,
-- track_id, company_id)` ingênuo deixaria passar duplicatas exatas nas
-- combinações mais comuns (sem trilha, sem empresa), que é o caso mais
-- frequente do answer bank. A correção precisa de um índice único PARCIAL por
-- combinação de NULL/não-NULL de `track_id`/`company_id` — mesmo padrão que
-- 007_watch_dedup.sql já usou para `source_job_id`.

CREATE UNIQUE INDEX idx_answer_bank_dedup_no_track_no_company
  ON answer_bank(question_fingerprint, language)
  WHERE track_id IS NULL AND company_id IS NULL;

CREATE UNIQUE INDEX idx_answer_bank_dedup_track_no_company
  ON answer_bank(question_fingerprint, language, track_id)
  WHERE track_id IS NOT NULL AND company_id IS NULL;

CREATE UNIQUE INDEX idx_answer_bank_dedup_no_track_company
  ON answer_bank(question_fingerprint, language, company_id)
  WHERE track_id IS NULL AND company_id IS NOT NULL;

CREATE UNIQUE INDEX idx_answer_bank_dedup_track_company
  ON answer_bank(question_fingerprint, language, track_id, company_id)
  WHERE track_id IS NOT NULL AND company_id IS NOT NULL;
