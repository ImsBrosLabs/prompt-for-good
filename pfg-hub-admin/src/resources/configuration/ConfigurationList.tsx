import RestoreOutlinedIcon from "@mui/icons-material/RestoreOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
  useDelete,
  useGetList,
  useNotify,
  useRefresh,
  useUpdate,
} from "react-admin";

type RuntimeConfigSource = "database" | "environment" | "default";
type RuntimeConfigValueType = "boolean" | "integer" | "string";

type RuntimeConfigRecord = {
  id: string;
  key: string;
  value: unknown;
  environmentValue: string | null;
  source: RuntimeConfigSource;
  hasDatabaseOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  metadata: {
    env: string;
    label: string;
    description: string;
    category: string;
    secret: boolean;
    valueType: RuntimeConfigValueType;
    defaultValue: unknown;
  };
};

type DraftValue = string | boolean;

const sourceLabels: Record<RuntimeConfigSource, string> = {
  database: "Database",
  environment: ".env",
  default: "Default",
};

/** Groups the runtime catalog by category while keeping server-provided ordering. */
export function ConfigurationList() {
  const { data, isLoading, error } = useGetList<RuntimeConfigRecord>(
    "configuration",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "key", order: "ASC" },
    },
  );

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, RuntimeConfigRecord[]>();
    for (const record of data ?? []) {
      const records = groups.get(record.metadata.category) ?? [];
      records.push(record);
      groups.set(record.metadata.category, records);
    }
    return [...groups.entries()];
  }, [data]);

  if (isLoading) {
    return (
      <Box sx={{ display: "grid", minHeight: 240, placeItems: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Configuration unavailable</Alert>;
  }

  return (
    <Box sx={{ maxWidth: 1120 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Configuration
      </Typography>
      <Stack spacing={3}>
        {groupedRecords.map(([category, records]) => (
          <Box key={category} component="section">
            <Typography
              sx={{
                mb: 1,
                color: "text.secondary",
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {category}
            </Typography>
            <Box
              sx={{
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              {records.map((record) => (
                <ConfigurationRow key={record.id} record={record} />
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/** Keeps one editable draft per config row and delegates validation to the API. */
function ConfigurationRow({ record }: { record: RuntimeConfigRecord }) {
  const notify = useNotify();
  const refresh = useRefresh();
  const [updateConfig, { isPending: updatePending }] = useUpdate();
  const [resetConfig, { isPending: resetPending }] = useDelete();
  const [draft, setDraft] = useState<DraftValue>(() => draftFromRecord(record));

  useEffect(() => {
    setDraft(draftFromRecord(record));
  }, [record]);

  const disabled = updatePending || resetPending;
  const secretWithoutDraft =
    record.metadata.secret &&
    record.metadata.valueType !== "boolean" &&
    draft === "";
  const emptyIntegerDraft =
    record.metadata.valueType === "integer" && String(draft).trim() === "";

  /** Sends only the typed value expected by the backend catalog schema. */
  function saveValue() {
    updateConfig(
      "configuration",
      {
        id: record.id,
        data: { value: valueFromDraft(record, draft) },
        previousData: record,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("Configuration updated", { type: "info" });
          refresh();
        },
        onError: () => {
          notify("Value rejected", { type: "error" });
        },
      },
    );
  }

  /** Deletes the database override so the effective value falls back automatically. */
  function resetValue() {
    resetConfig(
      "configuration",
      {
        id: record.id,
        previousData: record,
      },
      {
        mutationMode: "pessimistic",
        onSuccess: () => {
          notify("Override deleted", { type: "info" });
          refresh();
        },
        onError: () => {
          notify("Reset failed", { type: "error" });
        },
      },
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 1fr) 360px" },
        gap: { xs: 1.5, md: 3 },
        py: 2,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}
        >
          <Typography sx={{ fontWeight: 750 }}>
            {record.metadata.label}
          </Typography>
          <Chip
            size="small"
            label={sourceLabels[record.source]}
            color={record.source === "database" ? "primary" : "default"}
            variant={record.source === "database" ? "filled" : "outlined"}
          />
          {record.metadata.secret ? (
            <Chip
              size="small"
              icon={<VisibilityOffOutlinedIcon />}
              label="Secret"
              variant="outlined"
            />
          ) : null}
        </Stack>
        <Typography sx={{ mt: 0.75, color: "text.secondary", fontSize: 13 }}>
          {record.metadata.description}
        </Typography>
        <Typography sx={{ mt: 0.75, color: "text.secondary", fontSize: 12 }}>
          {record.metadata.env}
        </Typography>
        <Typography
          sx={{
            mt: 0.5,
            color: "text.secondary",
            fontFamily: "monospace",
            fontSize: 12,
            overflowWrap: "anywhere",
          }}
        >
          Env value: {environmentValueLabel(record)}
        </Typography>
      </Box>

      <Stack spacing={1.25}>
        {record.metadata.valueType === "boolean" ? (
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(draft)}
                disabled={disabled}
                slotProps={{
                  input: { "aria-label": record.metadata.label },
                }}
                onChange={(event) => setDraft(event.target.checked)}
              />
            }
            label={draft ? "Enabled" : "Disabled"}
          />
        ) : (
          <TextField
            size="small"
            type={
              record.metadata.secret
                ? "password"
                : record.metadata.valueType === "integer"
                  ? "number"
                  : "text"
            }
            value={String(draft)}
            disabled={disabled}
            placeholder={record.metadata.secret ? "Hidden value" : undefined}
            onChange={(event) => setDraft(event.target.value)}
            slotProps={{
              htmlInput: {
                "aria-label": record.metadata.label,
                ...(record.metadata.valueType === "integer" ? { step: 1 } : {}),
              },
            }}
          />
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="contained"
            startIcon={<SaveOutlinedIcon />}
            disabled={disabled || secretWithoutDraft || emptyIntegerDraft}
            onClick={saveValue}
          >
            Save
          </Button>
          <Button
            variant="outlined"
            startIcon={<RestoreOutlinedIcon />}
            disabled={disabled || !record.hasDatabaseOverride}
            onClick={resetValue}
          >
            Restore default
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** Formats environment fallback state while keeping secret entries opaque. */
function environmentValueLabel(record: RuntimeConfigRecord): string {
  if (record.metadata.secret) return "Hidden";
  return record.environmentValue ?? "Not set";
}

/** Derives display-safe draft state without rendering secret values. */
function draftFromRecord(record: RuntimeConfigRecord): DraftValue {
  if (record.metadata.secret && record.metadata.valueType !== "boolean") {
    return "";
  }
  if (record.metadata.valueType === "boolean") return Boolean(record.value);
  return String(record.value ?? "");
}

/** Converts form drafts back to the primitive JSON type declared by the catalog. */
function valueFromDraft(
  record: RuntimeConfigRecord,
  draft: DraftValue,
): string | number | boolean {
  if (record.metadata.valueType === "boolean") return Boolean(draft);
  if (record.metadata.valueType === "integer") return Number(draft);
  return String(draft);
}
