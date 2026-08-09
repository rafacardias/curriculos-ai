-- 005_track_enabled.sql
--
-- ADITIVA (regra E4): apenas ADD COLUMN. Nenhum DROP, rename ou mudança de tipo.
-- (004 está reservada para `generation_runs`, ver KNOWN-BUGS.md "Prioridade movida".)
--
-- POR QUE EXISTE. O CRUD de trilhas (Fase 2) precisa poder desativar uma trilha sem
-- apagá-la: `applications.track_id` é FK para `profile_tracks(id)`, então DELETE numa
-- trilha com candidatura associada quebraria a constraint. `enabled` é a única forma
-- segura de "remover" uma trilha do CRUD sem órfãar histórico.
--
-- `id` nunca é editável pelo CRUD (aplicado em código, não em schema): `jobs.track_hint`
-- é TEXT solto, não FK — grava o id literal congelado no momento do score. Renomear o
-- id de uma trilha existente orfanaria esse histórico silenciosamente.

ALTER TABLE profile_tracks ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
