export type ListQuery = {
  sort?: string;
  range?: string;
  filter?: string;
};

export type ListParams = {
  start: number;
  limit: number;
  field: string;
  descending: boolean;
  filter: Record<string, unknown>;
};

export type AdminListResponse<RecordType> = {
  data: RecordType[];
  total: number;
};

/** Parses untrusted React-admin query JSON and clamps ranges to a bounded page size. */
export function parseListParams(
  query: ListQuery,
  defaultSort: string,
): ListParams {
  const sort = parseTuple(query.sort);
  const range = parseTuple(query.range);
  const parsedFilter = parseJson(query.filter);
  const start = nonNegativeInteger(range?.[0], 0);
  const requestedEnd = nonNegativeInteger(range?.[1], start + 24);
  const end = Math.max(start, requestedEnd);

  return {
    start,
    limit: Math.min(end - start + 1, 100),
    field: typeof sort?.[0] === "string" ? sort[0] : defaultSort,
    descending: String(sort?.[1] ?? "DESC").toUpperCase() === "DESC",
    filter:
      typeof parsedFilter === "object" &&
      parsedFilter !== null &&
      !Array.isArray(parsedFilter)
        ? (parsedFilter as Record<string, unknown>)
        : {},
  };
}

export function stringFilter(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function booleanFilter(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Parses a JSON query parameter without allowing malformed input to fail the request. */
function parseJson(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseTuple(value: string | undefined): unknown[] | undefined {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}
