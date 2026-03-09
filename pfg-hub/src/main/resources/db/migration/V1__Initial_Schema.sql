CREATE TABLE repos (
    id VARCHAR(36) PRIMARY KEY,
    github_url VARCHAR(255) NOT NULL UNIQUE,
    owner VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    language VARCHAR(100),
    score INT NOT NULL DEFAULT 0,
    stars INT NOT NULL DEFAULT 0,
    eligible BOOLEAN NOT NULL DEFAULT FALSE,
    last_crawled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issues (
    id VARCHAR(36) PRIMARY KEY,
    repo_id VARCHAR(36) NOT NULL REFERENCES repos(id),
    github_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    github_url VARCHAR(255) NOT NULL,
    labels VARCHAR(255),
    score INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    claimed_by VARCHAR(36),
    claimed_at TIMESTAMP,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE runners (
    id VARCHAR(36) PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    contributor_name VARCHAR(255) NOT NULL,
    quota_remaining_today BIGINT NOT NULL DEFAULT 0,
    last_seen_at TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contributions (
    id VARCHAR(36) PRIMARY KEY,
    issue_id VARCHAR(36) NOT NULL REFERENCES issues(id),
    runner_id VARCHAR(36) NOT NULL REFERENCES runners(id),
    pr_url VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    tokens_used BIGINT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_score ON issues(score);
CREATE INDEX idx_runners_token ON runners(token);
