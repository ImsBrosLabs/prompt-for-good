import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { Title } from "react-admin";
import { hubRequest } from "../api";

type ScoreSignal = {
  name: string;
  points: number;
  evidence: string;
};

type ScoreDiagnostic = {
  score: number;
  signals: ScoreSignal[];
};

type QueueHealth = {
  queueSize: number;
  dispatchMatchingLatencySampleCount: number;
  dispatchMatchingLatencyMs: number | null;
  averageDispatchMatchingLatencyMs: number | null;
  p95DispatchMatchingLatencyMs: number | null;
  databaseRankingRecommended: boolean;
  databaseRankingThresholds: {
    queueSize: number;
    p95MatchingLatencyMs: number;
  };
};

type ScoredRepository = {
  id: string;
  owner: string;
  name: string;
  language?: string | null;
  stars: number;
  eligible: boolean;
  score: number;
  scoreDiagnostic: ScoreDiagnostic;
  lastCrawledAt?: string | null;
};

type ScoredIssue = {
  id: string;
  repoOwner: string;
  repoName: string;
  title: string;
  status: string;
  difficulty: string;
  estimatedMinutes: number;
  score: number;
  scoreDiagnostic: ScoreDiagnostic;
  updatedAt?: string;
};

type ScoringOverview = {
  queueHealth: QueueHealth;
  recentRepositories: ScoredRepository[];
  recentIssues: ScoredIssue[];
};

type LoadState =
  | { state: "loading" }
  | { state: "loaded"; overview: ScoringOverview }
  | { state: "error"; message: string };

/** Loads and renders the scoring workbench as one coherent admin workflow. */
export function ScoringPage() {
  const [loadState, setLoadState] = useState<LoadState>({ state: "loading" });

  const loadScoring = useCallback(async () => {
    setLoadState({ state: "loading" });
    try {
      const response = await hubRequest("/admin/scoring");
      setLoadState({
        state: "loaded",
        overview: response.json as ScoringOverview,
      });
    } catch (error) {
      setLoadState({
        state: "error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "Scoring overview unavailable",
      });
    }
  }, []);

  useEffect(() => {
    void loadScoring();
  }, [loadScoring]);

  return (
    <Box sx={{ maxWidth: 1320 }}>
      <Title title="Scoring" />
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { xs: "stretch", sm: "center" } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">Scoring</Typography>
          </Box>
          <Button
            startIcon={<RefreshOutlinedIcon />}
            variant="outlined"
            onClick={() => void loadScoring()}
          >
            Refresh
          </Button>
        </Stack>

        {loadState.state === "loading" ? (
          <Box sx={{ display: "grid", minHeight: 220, placeItems: "center" }}>
            <CircularProgress size={30} />
          </Box>
        ) : null}

        {loadState.state === "error" ? (
          <Alert severity="error">{loadState.message}</Alert>
        ) : null}

        {loadState.state === "loaded" ? (
          <>
            <QueueHealthPanel queueHealth={loadState.overview.queueHealth} />
            <RepositoryDiagnosticsTable
              repositories={loadState.overview.recentRepositories}
            />
            <IssueDiagnosticsTable issues={loadState.overview.recentIssues} />
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

/** Shows whether in-memory dispatch remains inside the agreed operating envelope. */
function QueueHealthPanel({ queueHealth }: { queueHealth: QueueHealth }) {
  const fields = [
    { label: "Queue size", value: formatNumber(queueHealth.queueSize) },
    {
      label: "Last match",
      value: formatMs(queueHealth.dispatchMatchingLatencyMs),
    },
    {
      label: "Average match",
      value: formatMs(queueHealth.averageDispatchMatchingLatencyMs),
    },
    {
      label: "P95 match",
      value: formatMs(queueHealth.p95DispatchMatchingLatencyMs),
    },
    {
      label: "Samples",
      value: formatNumber(queueHealth.dispatchMatchingLatencySampleCount),
    },
  ];

  return (
    <Box component="section">
      <Typography sx={sectionLabelSx}>Queue health</Typography>
      <Box sx={panelSx}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
          >
            <Chip
              color={
                queueHealth.databaseRankingRecommended ? "warning" : "success"
              }
              label={
                queueHealth.databaseRankingRecommended
                  ? "DB ranking threshold reached"
                  : "In-memory ranking within threshold"
              }
              variant={
                queueHealth.databaseRankingRecommended ? "filled" : "outlined"
              }
            />
            <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
              Thresholds: {formatNumber(queueHealth.databaseRankingThresholds.queueSize)} pending,
              {` ${formatMs(queueHealth.databaseRankingThresholds.p95MatchingLatencyMs)} p95`}
            </Typography>
          </Stack>
          <Box sx={statsGridSx}>
            {fields.map((field) => (
              <Box key={field.label} sx={statCellSx}>
                <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                  {field.label}
                </Typography>
                <Typography sx={{ mt: 0.5, fontSize: 24, fontWeight: 750 }}>
                  {field.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

/** Lists recent repository scoring snapshots with their strongest score signals. */
function RepositoryDiagnosticsTable({
  repositories,
}: {
  repositories: ScoredRepository[];
}) {
  return (
    <Box component="section">
      <Typography sx={sectionLabelSx}>Repository diagnostics</Typography>
      <Box sx={panelSx}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Repository</TableCell>
                <TableCell>Language</TableCell>
                <TableCell align="right">Stars</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell>Eligibility</TableCell>
                <TableCell>Signals</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {repositories.map((repo) => (
                <TableRow hover key={repo.id}>
                  <TableCell>{`${repo.owner}/${repo.name}`}</TableCell>
                  <TableCell>{repo.language ?? "-"}</TableCell>
                  <TableCell align="right">{formatNumber(repo.stars)}</TableCell>
                  <TableCell align="right">{formatNumber(repo.score)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={repo.eligible ? "success" : "default"}
                      label={repo.eligible ? "Eligible" : "Not eligible"}
                      variant={repo.eligible ? "filled" : "outlined"}
                    />
                  </TableCell>
                  <TableCell>
                    <SignalList signals={repo.scoreDiagnostic.signals} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}

/** Lists recent issue scoring snapshots with solvability and scope signals. */
function IssueDiagnosticsTable({ issues }: { issues: ScoredIssue[] }) {
  return (
    <Box component="section">
      <Typography sx={sectionLabelSx}>Issue diagnostics</Typography>
      <Box sx={panelSx}>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Issue</TableCell>
                <TableCell>Repository</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Difficulty</TableCell>
                <TableCell align="right">Estimate</TableCell>
                <TableCell align="right">Score</TableCell>
                <TableCell>Signals</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {issues.map((issue) => (
                <TableRow hover key={issue.id}>
                  <TableCell sx={{ minWidth: 260 }}>{issue.title}</TableCell>
                  <TableCell>{`${issue.repoOwner}/${issue.repoName}`}</TableCell>
                  <TableCell>{issue.status}</TableCell>
                  <TableCell>{issue.difficulty}</TableCell>
                  <TableCell align="right">
                    {formatNumber(issue.estimatedMinutes)} min
                  </TableCell>
                  <TableCell align="right">{formatNumber(issue.score)}</TableCell>
                  <TableCell>
                    <SignalList signals={issue.scoreDiagnostic.signals} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>
    </Box>
  );
}

/** Renders signal chips with compact evidence text for audit scanning. */
function SignalList({ signals }: { signals: ScoreSignal[] }) {
  if (signals.length === 0) {
    return (
      <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
        No signals
      </Typography>
    );
  }

  return (
    <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
      {signals.map((signal) => (
        <Chip
          key={`${signal.name}-${signal.evidence}`}
          size="small"
          color={signal.points < 0 ? "warning" : "default"}
          label={`${signal.name} ${formatSigned(signal.points)}`}
          title={signal.evidence}
          variant={signal.points < 0 ? "filled" : "outlined"}
        />
      ))}
    </Stack>
  );
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" ? `${value.toLocaleString()} ms` : "-";
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

const sectionLabelSx = {
  mb: 1,
  color: "text.secondary",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
};

const panelSx = {
  borderTop: (theme: { palette: { divider: string } }) =>
    `1px solid ${theme.palette.divider}`,
  py: 2,
};

const statsGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    lg: "repeat(5, minmax(0, 1fr))",
  },
  borderTop: (theme: { palette: { divider: string } }) =>
    `1px solid ${theme.palette.divider}`,
  borderLeft: (theme: { palette: { divider: string } }) =>
    `1px solid ${theme.palette.divider}`,
};

const statCellSx = {
  minWidth: 0,
  p: 2,
  borderRight: (theme: { palette: { divider: string } }) =>
    `1px solid ${theme.palette.divider}`,
  borderBottom: (theme: { palette: { divider: string } }) =>
    `1px solid ${theme.palette.divider}`,
};
