-- ADR-0003 DDL — copy-pasted verbatim
-- Source: /docs/adr/0003-sqlite-vec-memory-backend.md lines 199-246

CREATE TABLE entries (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  tier            TEXT NOT NULL CHECK (tier IN
                    ('short','mid','long','frequent','forgettable')),
  kind            TEXT NOT NULL CHECK (kind IN
                    ('working','episodic','semantic','procedural')),
  body            TEXT NOT NULL,
  description     TEXT NOT NULL,
  tags            TEXT NOT NULL,
  links           TEXT NOT NULL,
  importance      INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
  created         TEXT NOT NULL,
  updated         TEXT NOT NULL,
  last_accessed   TEXT NOT NULL,
  access_count    INTEGER NOT NULL DEFAULT 0,
  embed_model_id  TEXT NOT NULL,
  embed_model_ver TEXT NOT NULL
);
CREATE INDEX entries_tier_idx ON entries (tier, last_accessed);

CREATE VIRTUAL TABLE entries_vec USING vec0 (
  id INTEGER PRIMARY KEY,
  embedding float[384]
);

CREATE VIRTUAL TABLE entries_fts USING fts5 (
  name, description, body, tags,
  content='entries', content_rowid='id',
  tokenize='porter unicode61 remove_diacritics 2'
);

CREATE TRIGGER entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;
CREATE TRIGGER entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
END;
CREATE TRIGGER entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, name, description, body, tags)
    VALUES ('delete', old.id, old.name, old.description, old.body, old.tags);
  INSERT INTO entries_fts(rowid, name, description, body, tags)
    VALUES (new.id, new.name, new.description, new.body, new.tags);
END;
