CREATE TABLE IF NOT EXISTS repos (
    id VARCHAR(36) PRIMARY KEY,
    github_url VARCHAR(255) NOT NULL UNIQUE,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    language VARCHAR(100),
    ecosystems JSONB NOT NULL DEFAULT '[]'::jsonb,
    license VARCHAR(100),
    ci_detected BOOLEAN NOT NULL DEFAULT FALSE,
    tests_detected BOOLEAN NOT NULL DEFAULT FALSE,
    last_pushed_at TIMESTAMP,
    score INT NOT NULL DEFAULT 0,
    stars INT NOT NULL DEFAULT 0,
    eligible BOOLEAN NOT NULL DEFAULT FALSE,
    last_crawled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(36) PRIMARY KEY,
    repo_id VARCHAR(36) NOT NULL REFERENCES repos(id),
    github_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    github_url VARCHAR(255) NOT NULL,
    labels VARCHAR(255),
    score INT NOT NULL DEFAULT 0,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
    estimated_minutes INT NOT NULL DEFAULT 90,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    claimed_by VARCHAR(36),
    claimed_at TIMESTAMP,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runners (
    id VARCHAR(36) PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    contributor_name VARCHAR(255) NOT NULL,
    quota_remaining_today BIGINT NOT NULL DEFAULT 0,
    last_seen_at TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contributions (
    id VARCHAR(36) PRIMARY KEY,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id),
    runner_id VARCHAR(36) NOT NULL REFERENCES runners(id),
    pr_url VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    tokens_used BIGINT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(50) NOT NULL DEFAULT 'STARTED',
    discovered_repos INT NOT NULL DEFAULT 0,
    seeded_repos INT NOT NULL DEFAULT 0,
    recrawled_repos INT NOT NULL DEFAULT 0,
    created_issues INT NOT NULL DEFAULT 0,
    skipped_pull_requests INT NOT NULL DEFAULT 0,
    failed_repositories INT NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

ALTER TABLE ingestion_runs
    ADD COLUMN IF NOT EXISTS failed_repositories INT NOT NULL DEFAULT 0;

ALTER TABLE ingestion_runs
    ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS ecosystems JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS license VARCHAR(100);

ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS ci_detected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS tests_detected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE repos
    ADD COLUMN IF NOT EXISTS last_pushed_at TIMESTAMP;

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'medium';

ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS estimated_minutes INT NOT NULL DEFAULT 90;

ALTER TABLE runners
    ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_score ON issues(score);
CREATE INDEX IF NOT EXISTS idx_runners_token ON runners(token);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs(started_at);
