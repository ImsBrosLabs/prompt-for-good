DROP TABLE IF EXISTS pg_temp.pfg_duplicate_issues;

CREATE TEMP TABLE pfg_duplicate_issues ON COMMIT DROP AS
SELECT
    id,
    FIRST_VALUE(id) OVER issue_precedence AS keep_id,
    ROW_NUMBER() OVER issue_precedence AS duplicate_rank
FROM issues
WINDOW issue_precedence AS (
    PARTITION BY github_id
    ORDER BY
        CASE status
            WHEN 'DONE' THEN 1
            WHEN 'CLAIMED' THEN 2
            WHEN 'PENDING' THEN 3
            WHEN 'FAILED' THEN 4
            ELSE 5
        END,
        updated_at DESC,
        created_at DESC,
        id DESC
);

UPDATE contributions
SET issue_id = pfg_duplicate_issues.keep_id
FROM pfg_duplicate_issues
WHERE contributions.issue_id = pfg_duplicate_issues.id
    AND pfg_duplicate_issues.duplicate_rank > 1;

DELETE FROM issues
USING pfg_duplicate_issues
WHERE issues.id = pfg_duplicate_issues.id
    AND pfg_duplicate_issues.duplicate_rank > 1;

DROP TABLE pfg_duplicate_issues;

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id_unique
    ON issues(github_id);
