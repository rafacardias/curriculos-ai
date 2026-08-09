-- 007_watch_dedup.sql
--
-- ADITIVA (regra E4): índice novo, nenhum DROP/RENAME/mudança de tipo. Colunas
-- `source`/`source_job_id` já existem desde 001_init.sql — só o dedup por elas
-- é novo.
--
-- POR QUE EXISTE. `jobFingerprint` (companyName+title+location normalizados)
-- foi desenhado pra dedup CROSS-SOURCE (a mesma vaga na Gupy e no LinkedIn tem
-- que colidir) — não é estável pra dedup TEMPORAL (a mesma vaga, re-vista em
-- polls diferentes da vigilância por empresa). Um anúncio Gupy que muda de
-- "Analista de Dados" para "Analista de Dados Pleno" entre dois polls de 4-6h
-- gera fingerprint diferente e duplicaria — mesma vaga, nova linha em `jobs`.
--
-- A Gupy já devolve um `id` estável por vaga (gravado em `source_job_id` desde
-- sempre, nunca usado pra dedup). `(source, source_job_id)` sobrevive a edição
-- de texto porque não depende do texto. Índice PARCIAL (`WHERE source_job_id
-- IS NOT NULL`) porque fontes sem id nativo (ex. manual-url) continuam usando
-- só o fingerprint — não force um id que a fonte não tem.

CREATE UNIQUE INDEX idx_jobs_source_job_id
  ON jobs(source, source_job_id)
  WHERE source_job_id IS NOT NULL;
