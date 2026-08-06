-- 002_rescore_provenance.sql
--
-- ADITIVA (regra E4): apenas ADD COLUMN. Nenhum DROP, rename ou mudança de tipo.
-- Um banco no schema 001 abre, migra e segue respondendo às queries existentes.
--
-- Por que existe: a partir da Onda 1.2 o scorer muda, e `rescore` repontua o
-- acervo já coletado. Sem guardar o score anterior, a repontuação DESTRÓI a
-- baseline contra a qual o ganho seria medido — o delta viraria planilha manual.
--
-- score_previous é o score ORIGINAL (do momento do insert) e é escrito UMA única
-- vez, na primeira repontuação de cada vaga. Repontuações posteriores não o
-- sobrescrevem: ele é o marco zero, não o "valor da rodada anterior". É isso que
-- torna `rescore` idempotente do ponto de vista da proveniência.

ALTER TABLE jobs ADD COLUMN score_previous REAL;
ALTER TABLE jobs ADD COLUMN score_rescored_at TEXT;
