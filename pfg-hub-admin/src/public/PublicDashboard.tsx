import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import GitHubIcon from "@mui/icons-material/GitHub";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { adminApiUrl, adminRequest, hubApiUrl } from "../api";
import { ThemeModeButton } from "../ThemeModeButton";

const pageSize = 20;

type Stats = {
  totalRepos?: number;
  eligibleRepos?: number;
  queueSize?: number;
  totalPrsOpened?: number;
  activeRunners?: number;
};

type PublicRepo = {
  id: string;
  githubUrl: string;
  owner: string;
  name: string;
  language: string | null;
  ecosystems: string[];
  license: string | null;
  ciDetected: boolean;
  testsDetected: boolean;
  score: number;
  stars: number;
  eligible: boolean;
  lastCrawledAt: string | null;
};

type RepoListResponse = {
  data: PublicRepo[];
  total: number;
};

type TokenUsage = {
  totalTokensUsed: number;
  successfulContributions: number;
  failedContributions: number;
};

const emptyTokenUsage: TokenUsage = {
  totalTokensUsed: 0,
  successfulContributions: 0,
  failedContributions: 0,
};

const emptyRepoList: RepoListResponse = {
  data: [],
  total: 0,
};

type DashboardData = {
  stats: Stats;
  repos: RepoListResponse;
  tokenUsage: TokenUsage;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData }
  | { status: "error"; message: string };

/** Loads the public hub dashboard without requiring authenticated admin actions. */
export function PublicDashboard({ embedded = false }: { embedded?: boolean }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });

    void loadDashboardData({
      search,
      eligibleOnly,
      page,
      embedded,
      signal: controller.signal,
    })
      .then((data) => setLoadState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({ status: "error", message: errorMessage(error) });
      });

    return () => controller.abort();
  }, [eligibleOnly, embedded, page, refreshKey, search]);

  const summaryItems = useMemo(() => {
    const data = loadState.status === "ready" ? loadState.data : undefined;
    return [
      { label: "Repositories", value: data?.stats.totalRepos },
      { label: "Eligible", value: data?.stats.eligibleRepos },
      { label: "Queue", value: data?.stats.queueSize },
      { label: "Active runners", value: data?.stats.activeRunners },
      { label: "Pull requests", value: data?.stats.totalPrsOpened },
      { label: "Tokens used", value: data?.tokenUsage.totalTokensUsed },
    ];
  }, [loadState]);

  /** Applies repository search as an explicit page-resetting user action. */
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSearch(searchDraft.trim());
  }

  return (
    <Box
      sx={{
        minHeight: embedded ? "auto" : "100vh",
        color: (theme) => theme.palette.text.primary,
        backgroundColor: embedded
          ? "transparent"
          : (theme) => theme.palette.background.default,
      }}
    >
      {embedded ? null : <PublicHeader />}

      <Container
        maxWidth="xl"
        sx={{ px: embedded ? 0 : undefined, py: embedded ? 0 : { xs: 2, md: 3 } }}
      >
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "stretch", md: "flex-end" }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box>
              <Typography
                component="h1"
                sx={{ fontSize: { xs: 24, md: 32 }, fontWeight: 850 }}
              >
                Public hub dashboard
              </Typography>
              <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: 14 }}>
                Repositories, queue activity, contributors and token usage.
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<RefreshOutlinedIcon />}
              onClick={() => setRefreshKey((value) => value + 1)}
              sx={{ alignSelf: { xs: "flex-start", md: "auto" } }}
            >
              Refresh
            </Button>
          </Stack>

          {loadState.status === "error" ? (
            <Alert severity="error">{loadState.message}</Alert>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, minmax(0, 1fr))",
                md: "repeat(3, minmax(0, 1fr))",
                lg: "repeat(6, minmax(0, 1fr))",
              },
              gap: 1.25,
            }}
          >
            {summaryItems.map((item) => (
              <Paper
                key={item.label}
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 1 }}
              >
                <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                  {item.label}
                </Typography>
                <Typography sx={{ mt: 0.5, fontSize: 24, fontWeight: 850 }}>
                  {loadState.status === "loading"
                    ? "..."
                    : formatNumber(item.value)}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Paper variant="outlined" sx={{ borderRadius: 1, overflow: "hidden" }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                alignItems: { xs: "stretch", md: "center" },
                justifyContent: "space-between",
                gap: 1.5,
                p: 1.5,
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
                  Repositories
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                  {loadState.status === "ready"
                    ? `${formatNumber(loadState.data.repos.total)} matching repositories`
                    : "Loading repositories"}
                </Typography>
              </Box>
              <Stack
                component="form"
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                onSubmit={submitSearch}
              >
                <TextField
                  size="small"
                  value={searchDraft}
                  placeholder="Search owner, name or URL"
                  onChange={(event) => setSearchDraft(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlinedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ minWidth: { xs: "100%", sm: 280 } }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={eligibleOnly}
                      onChange={(event) => {
                        setPage(0);
                        setEligibleOnly(event.target.checked);
                      }}
                    />
                  }
                  label="Eligible only"
                  sx={{ m: 0, whiteSpace: "nowrap" }}
                />
                <Button type="submit" variant="outlined">
                  Search
                </Button>
              </Stack>
            </Box>

            <RepositoryTable
              loading={loadState.status === "loading"}
              repos={loadState.status === "ready" ? loadState.data.repos.data : []}
            />

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                px: 1.5,
                py: 1,
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography sx={{ color: "text.secondary", fontSize: 13 }}>
                Page {page + 1}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="Previous page">
                  <span>
                    <IconButton
                      size="small"
                      disabled={page === 0 || loadState.status === "loading"}
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                    >
                      <ChevronLeftIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Next page">
                  <span>
                    <IconButton
                      size="small"
                      disabled={
                        loadState.status !== "ready" ||
                        (page + 1) * pageSize >= loadState.data.repos.total
                      }
                      onClick={() => setPage((value) => value + 1)}
                    >
                      <ChevronRightIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

function PublicHeader() {
  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.92),
        backdropFilter: "blur(10px)",
      }}
    >
      <Container
        maxWidth="xl"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 64,
          gap: 2,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25}>
          <Box component="img" src="/pfg-logo.svg" alt="" sx={{ width: 32 }} />
          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
            Prompt for Good
          </Typography>
          <Chip
            size="small"
            label="Public hub"
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              borderRadius: 1,
              color: (theme) => theme.palette.primary.main,
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
              fontWeight: 750,
            }}
          />
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <ThemeModeButton />
          <Button
            href="/"
            variant="outlined"
            size="small"
            sx={{ borderRadius: 1, textTransform: "none", fontWeight: 750 }}
          >
            Admin
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}

/** Renders repository rows while keeping loading and empty states layout-stable. */
function RepositoryTable({
  loading,
  repos,
}: {
  loading: boolean;
  repos: PublicRepo[];
}) {
  if (loading) {
    return (
      <Box sx={{ display: "grid", minHeight: 280, placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (repos.length === 0) {
    return (
      <Box sx={{ display: "grid", minHeight: 220, placeItems: "center" }}>
        <Typography sx={{ color: "text.secondary" }}>No repositories found.</Typography>
      </Box>
    );
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" sx={{ minWidth: 980 }}>
        <TableHead>
          <TableRow>
            <TableCell>Repository</TableCell>
            <TableCell>Language</TableCell>
            <TableCell>Signals</TableCell>
            <TableCell align="right">Stars</TableCell>
            <TableCell align="right">Score</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Last crawl</TableCell>
            <TableCell align="right">GitHub</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {repos.map((repo) => (
            <TableRow key={repo.id} hover>
              <TableCell>
                <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                  {repo.owner}/{repo.name}
                </Typography>
                <Typography sx={{ color: "text.secondary", fontSize: 12 }}>
                  {repo.license ?? "No license recorded"}
                </Typography>
              </TableCell>
              <TableCell>{repo.language ?? "Unknown"}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                  {repo.ciDetected ? <SignalChip label="CI" /> : null}
                  {repo.testsDetected ? <SignalChip label="Tests" /> : null}
                  {repo.ecosystems.map((ecosystem) => (
                    <SignalChip key={ecosystem} label={ecosystem} />
                  ))}
                </Stack>
              </TableCell>
              <TableCell align="right">{formatNumber(repo.stars)}</TableCell>
              <TableCell align="right">{formatNumber(repo.score)}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  icon={repo.eligible ? <CheckCircleOutlineIcon /> : undefined}
                  label={repo.eligible ? "Eligible" : "Not eligible"}
                  sx={{
                    borderRadius: 1,
                    color: (theme) =>
                      repo.eligible
                        ? theme.palette.primary.main
                        : theme.palette.text.secondary,
                    backgroundColor: (theme) =>
                      repo.eligible
                        ? alpha(theme.palette.primary.main, 0.14)
                        : alpha(theme.palette.text.secondary, 0.12),
                    fontWeight: 750,
                  }}
                />
              </TableCell>
              <TableCell>{formatDate(repo.lastCrawledAt)}</TableCell>
              <TableCell align="right">
                <Tooltip title="Open repository">
                  <IconButton
                    href={repo.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                  >
                    <GitHubIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function SignalChip({ label }: { label: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 22,
        borderRadius: 1,
        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.1),
        fontSize: 12,
        fontWeight: 650,
      }}
    />
  );
}

type LoadDashboardOptions = {
  search: string;
  eligibleOnly: boolean;
  page: number;
  embedded: boolean;
  signal: AbortSignal;
};

/** Fetches all public dashboard resources against one pagination snapshot. */
async function loadDashboardData({
  search,
  eligibleOnly,
  page,
  embedded,
  signal,
}: LoadDashboardOptions): Promise<DashboardData> {
  const reposPath = publicReposPath({ search, eligibleOnly, page });
  const [stats, repos, tokenUsage] = await Promise.all([
    fetchPublicJson<Stats>("/stats", signal),
    fetchRepos({ path: reposPath, search, eligibleOnly, page, embedded, signal }),
    fetchOptionalTokenUsage(signal),
  ]);

  return { stats, repos, tokenUsage };
}

/** Uses public repositories first, then authenticated admin data inside the admin shell. */
async function fetchRepos({
  path,
  search,
  eligibleOnly,
  page,
  embedded,
  signal,
}: {
  path: string;
  search: string;
  eligibleOnly: boolean;
  page: number;
  embedded: boolean;
  signal: AbortSignal;
}): Promise<RepoListResponse> {
  try {
    return await fetchPublicJson<RepoListResponse>(path, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    if (!embedded && isPublicRequestStatus(error, 404)) return emptyRepoList;
    if (!embedded) throw error;
    return fetchAdminRepos({ search, eligibleOnly, page, signal });
  }
}

/** Adapts the existing React-admin repository endpoint for the embedded dashboard. */
async function fetchAdminRepos({
  search,
  eligibleOnly,
  page,
  signal,
}: {
  search: string;
  eligibleOnly: boolean;
  page: number;
  signal: AbortSignal;
}): Promise<RepoListResponse> {
  const filter: Record<string, unknown> = {};
  if (search) filter.q = search;
  if (eligibleOnly) filter.eligible = true;

  const query = new URLSearchParams({
    sort: JSON.stringify(["score", "DESC"]),
    range: JSON.stringify([page * pageSize, page * pageSize + pageSize - 1]),
    filter: JSON.stringify(filter),
  });
  const response = await adminRequest(`${adminApiUrl}/repositories?${query}`, {
    signal,
  });
  return response.json as RepoListResponse;
}

/** Detects optional public endpoints that can be absent on older hub processes. */
function isPublicRequestStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === status
  );
}

/** Keeps the dashboard usable while older hub processes are missing token usage. */
async function fetchOptionalTokenUsage(signal: AbortSignal): Promise<TokenUsage> {
  try {
    return await fetchPublicJson<TokenUsage>("/token-usage", signal);
  } catch (error) {
    if (signal.aborted) throw error;
    return emptyTokenUsage;
  }
}

/** Builds the repository query string while omitting empty optional filters. */
function publicReposPath({
  search,
  eligibleOnly,
  page,
}: Omit<LoadDashboardOptions, "embedded" | "signal">): string {
  const query = new URLSearchParams({
    limit: String(pageSize),
    offset: String(page * pageSize),
  });
  if (search) query.set("q", search);
  if (eligibleOnly) query.set("eligible", "true");
  return `/repos?${query.toString()}`;
}

/** Reads a JSON response and turns HTTP failures into user-visible errors. */
async function fetchPublicJson<ResponseType>(
  path: string,
  signal: AbortSignal,
): Promise<ResponseType> {
  const response = await fetch(`${hubApiUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const error = new Error(
      `${path} failed with status ${response.status}`,
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as ResponseType;
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "-";
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(value),
      )
    : "-";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The public hub API is unavailable";
}
