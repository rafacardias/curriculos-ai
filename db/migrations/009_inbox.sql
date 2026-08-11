-- 009_inbox.sql
--
-- ADITIVA (regra E4): duas tabelas novas, zero coluna nova em `applications`.
-- `inbox-watch` (docs/roadmap.md → Onda 3): Gmail como canal de SINAL sobre
-- `applications` já existentes, não fonte de vaga nova — não herda
-- `AdapterCapabilities`.
--
-- `inbox_messages` guarda todo e-mail relevante lido do Gmail (escopo
-- gmail.readonly), casado ou não com uma candidatura. `application_id`
-- NULL = não casado ainda (fica na aba "Inbox não casado" da UI, quando ela
-- existir — não nesta migration). `applied_transition` é sempre 0 nesta
-- fase: a Fase A só detecta e classifica, nunca move card.
--
-- `inbox_state` é chave/valor — hoje só guarda o `historyId` do Gmail, pra
-- poll incremental idempotente via `history.list` (mesmo padrão de
-- `_migrations`: tabela pequena e genérica em vez de uma coluna solta em
-- outro lugar).

CREATE TABLE inbox_messages (
  id                 TEXT PRIMARY KEY,
  gmail_message_id   TEXT NOT NULL UNIQUE,
  gmail_thread_id    TEXT NOT NULL,
  from_address       TEXT NOT NULL,
  from_domain        TEXT NOT NULL,
  subject            TEXT NOT NULL,
  snippet            TEXT,
  received_at        TEXT NOT NULL,
  application_id     TEXT REFERENCES applications(id),
  match_method       TEXT,    -- 'thread' | 'domain' | 'similarity' | 'manual' | NULL (não casado)
  match_confidence   REAL,
  classified_as      TEXT,    -- 'interview' | 'screening' | 'offer' | 'rejected' | 'noise' | 'unknown' | NULL
  classifier         TEXT,    -- 'lexical' | 'claude' | 'manual' | NULL
  applied_transition INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL
);
CREATE INDEX idx_inbox_messages_thread ON inbox_messages(gmail_thread_id);
CREATE INDEX idx_inbox_messages_application ON inbox_messages(application_id);
CREATE INDEX idx_inbox_messages_domain ON inbox_messages(from_domain);

CREATE TABLE inbox_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
