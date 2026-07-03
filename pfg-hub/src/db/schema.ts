import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const issueStatuses = ["PENDING", "CLAIMED", "DONE", "FAILED"] as const;
export const contributionStatuses = ["SUCCESS", "FAILED"] as const;

export type IssueStatus = (typeof issueStatuses)[number];
export type ContributionStatus = (typeof contributionStatuses)[number];

export const repos = pgTable("repos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  githubUrl: varchar("github_url", { length: 255 }).notNull().unique(),
  owner: varchar("owner", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  language: varchar("language", { length: 100 }),
  score: integer("score").notNull().default(0),
  stars: integer("stars").notNull().default(0),
  eligible: boolean("eligible").notNull().default(false),
  lastCrawledAt: timestamp("last_crawled_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const issues = pgTable(
  "issues",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    repoId: varchar("repo_id", { length: 36 })
      .notNull()
      .references(() => repos.id),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    githubUrl: varchar("github_url", { length: 255 }).notNull(),
    labels: varchar("labels", { length: 255 }).default(""),
    score: integer("score").notNull().default(0),
    status: varchar("status", { length: 50 })
      .$type<IssueStatus>()
      .notNull()
      .default("PENDING"),
    claimedBy: varchar("claimed_by", { length: 36 }),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("idx_issues_status").on(table.status),
    scoreIdx: index("idx_issues_score").on(table.score),
  }),
);

export const runners = pgTable(
  "runners",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    contributorName: varchar("contributor_name", { length: 255 }).notNull(),
    quotaRemainingToday: bigint("quota_remaining_today", { mode: "number" })
      .notNull()
      .default(0),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: index("idx_runners_token").on(table.token),
  }),
);

export const contributions = pgTable("contributions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  issueId: varchar("issue_id", { length: 36 })
    .notNull()
    .references(() => issues.id),
  runnerId: varchar("runner_id", { length: 36 })
    .notNull()
    .references(() => runners.id),
  prUrl: varchar("pr_url", { length: 255 }),
  status: varchar("status", { length: 50 })
    .$type<ContributionStatus>()
    .notNull(),
  tokensUsed: bigint("tokens_used", { mode: "number" }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type Repo = typeof repos.$inferSelect;
export type NewRepo = typeof repos.$inferInsert;
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
export type Runner = typeof runners.$inferSelect;
export type NewRunner = typeof runners.$inferInsert;
export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
