-- 006_score_confirmation.sql
--
-- ADITIVA (regra E4): apenas ADD COLUMN. Nenhum DROP, rename ou mudança de tipo.
--
-- POR QUE EXISTE. "ignorar: score X < Y" (policy.ts) nunca foi um gate de código —
-- é só o texto que o policy engine grava em `policy_action`. Nada em `kit.ts prepare`
-- olhava para ele; o "bloqueio" que o operador sentia era a skill do agente parando
-- ali por convenção, não o sistema recusando. Sem gate real, não existe como o
-- operador dizer "eu sei que é baixo, quero mesmo assim" — só dava pra editar
-- `generate_min_score` no config inteiro, ou nada.
--
-- Mesmo desenho de `003_modality_confirmation.sql`: coluna separada do dado que ela
-- confirma (aqui não há um campo "original" a preservar como `remote_type`, mas o
-- padrão nota+timestamp é o mesmo, para o mesmo motivo — registrar que foi decisão
-- humana, não default do sistema).

ALTER TABLE jobs ADD COLUMN score_confirmed_at TEXT;   -- ISO-8601 UTC
ALTER TABLE jobs ADD COLUMN score_confirmed_note TEXT; -- por que o operador quer mesmo assim
