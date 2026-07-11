import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Title, useNotify } from "react-admin";
import { hubRequest } from "../api";

type HubStats = {
  totalRepos?: number;
  eligibleRepos?: number;
  totalIssues?: number;
  pendingIssues?: number;
  queueSize?: number;
  claimedIssues?: number;
  doneIssues?: number;
  failedIssues?: number;
  totalPrsOpened?: number;
  activeRunners?: number;
  dispatchMatchingLatencySampleCount?: number;
  dispatchMatchingLatencyMs?: number | null;
  averageDispatchMatchingLatencyMs?: number | null;
  p95DispatchMatchingLatencyMs?: number | null;
};

type HealthState =
  | { state: "loading" }
  | { state: "up"; status: string }
  | { state: "unavailable"; message: string };

type IngestionRunStatus =
  | "STARTED"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "RATE_LIMITED";

type IngestionRun = {
  id: string;
  status?: IngestionRunStatus;
  discoveredRepos?: number;
  seededRepos?: number;
  recrawledRepos?: number;
  createdIssues?: number;
  skippedPullRequests?: number;
  failedRepositories?: number;
  details?: Record<string, unknown>;
  errorMessage?: string | null;
  startedAt?: string;
  finishedAt?: string | null;
};

type BusyAction = "seed-repo" | "seed-default" | "discover" | null;

const statFields: Array<{ key: keyof HubStats; label: string }> = [
  { key: "totalRepos", label: "Repositories" },
  { key: "eligibleRepos", label: "Eligible repos" },
  { key: "totalIssues", label: "Issues" },
  { key: "pendingIssues", label: "Pending" },
  { key: "claimedIssues", label: "Claimed" },
  { key: "doneIssues", label: "Done" },
  { key: "failedIssues", label: "Failed" },
  { key: "totalPrsOpened", label: "PRs opened" },
  { key: "activeRunners", label: "Active runners" },
  { key: "queueSize", label: "Queue size" },
  { key: "p95DispatchMatchingLatencyMs", label: "P95 match ms" },
];

/** Coordinates hub health, stats, ingestion commands and run diagnostics. */
export function OperationsPage() {
  const notify = useNotify();
  const [health, setHealth] = useState<HealthState>({ state: "loading" });
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [runsError, setRunsError] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [repoSlug, setRepoSlug] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  /** Loads process health as an operational signal without treating failure as logout. */
  const loadHealth = useCallback(async () => {
    setHealth({ state: "loading" });
    try {
      const response = await hubRequest("/actuator/health");
      const status =
        typeof response.json?.status === "string" ? response.json.status : "UP";
      setHealth({ state: "up", status });
    } catch (error) {
      setHealth({
        state: "unavailable",
        message: errorMessage(error, "Health check failed"),
      });
    }
  }, []);

  /** Refreshes public platform counters shown in the operations overview. */
  const loadStats = useCallback(async () => {
    setStatsError(false);
    try {
      const response = await hubRequest("/stats");
      setStats((response.json ?? {}) as HubStats);
    } catch {
      setStats(null);
      setStatsError(true);
    }
  }, []);

  /** Fetches recent ingestion runs and keeps the latest diagnostics visible. */
  const loadIngestionRuns = useCallback(async () => {
    setRunsError(false);
    try {
      const response = await hubRequest("/seed/ingestion-runs?limit=20");
      setRuns(Array.isArray(response.json) ? response.json : []);
    } catch {
      setRunsError(true);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  /** Refreshes all operation panels from their source endpoints. */
  const refreshOperations = useCallback(() => {
    void loadHealth();
    void loadStats();
    void loadIngestionRuns();
  }, [loadHealth, loadIngestionRuns, loadStats]);

  useEffect(() => {
    refreshOperations();
  }, [refreshOperations]);

  const hasStartedRun = useMemo(
    () => runs.some((run) => run.status === "STARTED"),
    [runs],
  );

  useEffect(() => {
    if (!hasStartedRun) return undefined;
    const intervalId = window.setInterval(() => {
      void loadIngestionRuns();
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [hasStartedRun, loadIngestionRuns]);

  /** Seeds one explicit GitHub repository after validating the owner/name slug. */
  async function seedRepository() {
    const parsed = parseRepoSlug(repoSlug);
    if (!parsed) {
      notify("Use the owner/name format", { type: "warning" });
      return;
    }

    setBusyAction("seed-repo");
    try {
      const query = new URLSearchParams(parsed);
      await hubRequest(`/seed/repo?${query.toString()}`, { method: "POST" });
      notify(`Seed started for ${parsed.owner}/${parsed.name}`, {
        type: "info",
      });
      setRepoSlug("");
      refreshOperations();
    } catch (error) {
      notify(errorMessage(error, "Repository seed failed"), { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  /** Seeds the curated demo repositories only after an explicit confirmation. */
  async function seedDefaultRepositories() {
    if (!window.confirm("Seed the default GitHub repositories?")) return;

    setBusyAction("seed-default");
    try {
      await hubRequest("/seed/default", { method: "POST" });
      notify("Default repositories seeded", { type: "info" });
      refreshOperations();
    } catch (error) {
      notify(errorMessage(error, "Default seed failed"), { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  /** Starts background GitHub discovery and relies on polling for run progress. */
  async function discoverRepositories() {
    if (!window.confirm("Start GitHub repository discovery?")) return;

    setBusyAction("discover");
    try {
      const response = await hubRequest("/seed/discover", { method: "POST" });
      const runId =
        typeof response.json?.runId === "string" ? response.json.runId : null;
      notify(runId ? `Discovery started: ${runId}` : "Discovery started", {
        type: "info",
      });
      await loadIngestionRuns();
    } catch (error) {
      notify(errorMessage(error, "Discovery failed"), { type: "error" });
    } finally {
      setBusyAction(null);
    }
  }

  const disabled = busyAction !== null;

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <Title title="Operations" />
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { xs: "stretch", sm: "center" } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">Operations</Typography>
          </Box>
          <Button
            startIcon={<RefreshOutlinedIcon />}
            variant="outlined"
            onClick={refreshOperations}
          >
            Refresh
          </Button>
        </Stack>

        <Box component="section">
          <Typography sx={sectionLabelSx}>Hub status</Typography>
          <Box sx={panelSx}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
            >
              <HealthChip health={health} />
              {health.state === "unavailable" ? (
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  {health.message}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        </Box>

        <Box component="section">
          <Typography sx={sectionLabelSx}>Platform counters</Typography>
          {statsError ? (
            <Alert severity="error">Stats unavailable</Alert>
          ) : (
            <Box sx={statsGridSx}>
              {statFields.map((field) => (
                <Box key={field.key} sx={statCellSx}>
                  <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                    {field.label}
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 24, fontWeight: 750 }}>
                    {formatNumber(stats?.[field.key])}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box component="section">
          <Typography sx={sectionLabelSx}>GitHub ingestion</Typography>
          <Box sx={panelSx}>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1.5}
                sx={{ alignItems: { xs: "stretch", md: "center" } }}
              >
                <TextField
                  label="Repository"
                  placeholder="owner/name"
                  size="small"
                  value={repoSlug}
                  onChange={(event) => setRepoSlug(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !disabled) {
                      void seedRepository();
                    }
                  }}
                  sx={{ maxWidth: { md: 320 } }}
                />
                <Button
                  startIcon={
                    busyAction === "seed-repo" ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : (
                      <PlayArrowOutlinedIcon />
                    )
                  }
                  disabled={disabled}
                  variant="contained"
                  onClick={() => void seedRepository()}
                >
                  Seed repo
                </Button>
                <Button
                  startIcon={
                    busyAction === "seed-default" ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : (
                      <PlayArrowOutlinedIcon />
                    )
                  }
                  disabled={disabled}
                  variant="outlined"
                  onClick={() => void seedDefaultRepositories()}
                >
                  Seed default
                </Button>
                <Button
                  startIcon={
                    busyAction === "discover" ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : (
                      <SearchOutlinedIcon />
                    )
                  }
                  disabled={disabled}
                  color="secondary"
                  variant="contained"
                  onClick={() => void discoverRepositories()}
                >
                  Discover
                </Button>
              </Stack>

              <IngestionRunsTable
                expandedRunId={expandedRunId}
                loading={loadingRuns}
                runs={runs}
                runsError={runsError}
                onToggleRun={(runId) =>
                  setExpandedRunId((current) =>
                    current === runId ? null : runId,
                  )
                }
              />
            </Stack>
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}

/** Renders health as a compact status chip that can represent network failure. */
function HealthChip({ health }: { health: HealthState }) {
  if (health.state === "loading") {
    return (
      <Chip
        icon={<CircularProgress color="inherit" size={14} />}
        label="Checking"
        variant="outlined"
      />
    );
  }

  return (
    <Chip
      color={health.state === "up" ? "success" : "error"}
      label={health.state === "up" ? health.status : "Unavailable"}
      variant={health.state === "up" ? "filled" : "outlined"}
    />
  );
}

/** Displays recent ingestion diagnostics with expandable raw details. */
function IngestionRunsTable({
  expandedRunId,
  loading,
  runs,
  runsError,
  onToggleRun,
}: {
  expandedRunId: string | null;
  loading: boolean;
  runs: IngestionRun[];
  runsError: boolean;
  onToggleRun: (runId: string) => void;
}) {
  if (loading) {
    return (
      <Box sx={{ display: "grid", minHeight: 180, placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (runsError) {
    return <Alert severity="error">Ingestion runs unavailable</Alert>;
  }

  if (runs.length === 0) {
    return <Alert severity="info">No ingestion runs found</Alert>;
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Started</TableCell>
            <TableCell align="right">Discovered</TableCell>
            <TableCell align="right">Seeded</TableCell>
            <TableCell align="right">Issues</TableCell>
            <TableCell align="right">Failed</TableCell>
            <TableCell>Error</TableCell>
            <TableCell align="center">Details</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => (
            <IngestionRunRows
              key={run.id}
              expanded={expandedRunId === run.id}
              run={run}
              onToggle={() => onToggleRun(run.id)}
            />
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Keeps the normal run row and its optional JSON detail row in sync. */
function IngestionRunRows({
  expanded,
  run,
  onToggle,
}: {
  expanded: boolean;
  run: IngestionRun;
  onToggle: () => void;
}) {
  const details = JSON.stringify(run.details ?? {}, null, 2);

  return (
    <>
      <TableRow hover>
        <TableCell>
          <Chip
            size="small"
            color={statusColor(run.status)}
            label={run.status ?? "UNKNOWN"}
            variant={run.status === "SUCCESS" ? "filled" : "outlined"}
          />
        </TableCell>
        <TableCell>{formatDate(run.startedAt)}</TableCell>
        <TableCell align="right">{formatNumber(run.discoveredRepos)}</TableCell>
        <TableCell align="right">{formatNumber(run.seededRepos)}</TableCell>
        <TableCell align="right">{formatNumber(run.createdIssues)}</TableCell>
        <TableCell align="right">
          {formatNumber(run.failedRepositories)}
        </TableCell>
        <TableCell sx={{ maxWidth: 280 }}>
          <Typography
            sx={{
              color: run.errorMessage ? "error.main" : "text.secondary",
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {run.errorMessage ?? "None"}
          </Typography>
        </TableCell>
        <TableCell align="center">
          <Tooltip title={expanded ? "Hide details" : "Show details"}>
            <IconButton size="small" onClick={onToggle}>
              <SearchOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ py: 0 }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box
              component="pre"
              sx={{
                m: 0,
                py: 1.5,
                color: "text.secondary",
                fontFamily: "monospace",
                fontSize: 12,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {details}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

/** Accepts GitHub repository slugs in the operator-facing owner/name form. */
function parseRepoSlug(value: string): { owner: string; name: string } | null {
  const match = value.trim().match(/^([A-Za-z0-9.-]+)\/([A-Za-z0-9._-]+)$/);
  return match ? { owner: match[1], name: match[2] } : null;
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString() : "-";
}

/** Maps ingestion states to MUI chip colors while preserving unknown values. */
function statusColor(
  status: IngestionRunStatus | undefined,
): "default" | "success" | "warning" | "error" | "info" {
  if (status === "SUCCESS") return "success";
  if (status === "STARTED") return "info";
  if (status === "PARTIAL_SUCCESS") return "warning";
  if (status === "FAILED" || status === "RATE_LIMITED") return "error";
  return "default";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
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
