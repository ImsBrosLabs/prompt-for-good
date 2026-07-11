ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS score_diagnostic JSONB NOT NULL DEFAULT '{"score":0,"signals":[]}'::jsonb;

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS score_diagnostic JSONB NOT NULL DEFAULT '{"score":0,"signals":[]}'::jsonb;
