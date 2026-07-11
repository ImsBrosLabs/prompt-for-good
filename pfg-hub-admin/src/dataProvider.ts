import {
  type CreateParams,
  type CreateResult,
  type DataProvider,
  type DeleteManyParams,
  type DeleteManyResult,
  type DeleteParams,
  type DeleteResult,
  type GetListParams,
  type GetListResult,
  type GetManyParams,
  type GetManyResult,
  type GetManyReferenceParams,
  type GetManyReferenceResult,
  type GetOneParams,
  type GetOneResult,
  type Identifier,
  type RaRecord,
  type UpdateManyParams,
  type UpdateManyResult,
  type UpdateParams,
  type UpdateResult,
} from "react-admin";
import { adminApiUrl, adminRequest } from "./api";


type JsonObject = Record<string, unknown>;
type ListPayload<RecordType extends RaRecord> =
  | RecordType[]
  | { data: RecordType[]; total?: number };

/** Builds a resource URL while preventing identifiers from changing path structure. */
function resourceUrl(resource: string, id?: Identifier): string {
  const baseUrl = `${adminApiUrl}/${encodeURIComponent(resource)}`;
  return id === undefined ? baseUrl : `${baseUrl}/${encodeURIComponent(String(id))}`;
}

/** Adds React-admin list controls using common REST query parameter conventions. */
function listQuery(params: GetListParams): string {
  const { page, perPage } = params.pagination ?? { page: 1, perPage: 10 };
  const sort = params.sort ?? { field: "id", order: "ASC" };
  const start = (page - 1) * perPage;
  const query = new URLSearchParams({
    sort: JSON.stringify([sort.field, sort.order]),
    range: JSON.stringify([start, start + perPage - 1]),
    filter: JSON.stringify(params.filter),
  });
  return query.toString();
}

/** Narrows an unknown JSON response to an object before reading an envelope. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts either a bare record or the conventional `{ data: record }` envelope. */
function recordFromPayload<RecordType extends RaRecord>(
  payload: unknown,
): RecordType {
  const value = isJsonObject(payload) && "data" in payload ? payload.data : payload;
  if (!isJsonObject(value) || !("id" in value)) {
    throw new Error("The admin API response did not contain a record with an id");
  }
  return value as RecordType;
}

/** Parses list responses from either an envelope or REST total-count headers. */
function listFromResponse<RecordType extends RaRecord>(
  payload: unknown,
  headers: Headers,
): { data: RecordType[]; total: number } {
  let parsedPayload: ListPayload<RecordType>;
  if (Array.isArray(payload)) {
    parsedPayload = payload as RecordType[];
  } else if (isJsonObject(payload) && Array.isArray(payload.data)) {
    parsedPayload = {
      data: payload.data as RecordType[],
      total: typeof payload.total === "number" ? payload.total : undefined,
    };
  } else {
    throw new Error("The admin API list response must be an array or a data envelope");
  }

  const records = Array.isArray(parsedPayload)
    ? parsedPayload
    : parsedPayload.data;
  const envelopeTotal = Array.isArray(parsedPayload)
    ? undefined
    : parsedPayload.total;
  const contentRange = headers.get("content-range");
  const rangeTotal = contentRange?.match(/\/(\d+|\*)$/)?.[1];
  const headerTotal = headers.get("x-total-count");
  const parsedHeaderTotal = Number(
    headerTotal ?? (rangeTotal === "*" ? undefined : rangeTotal),
  );

  return {
    data: records,
    total:
      envelopeTotal ??
      (Number.isFinite(parsedHeaderTotal) ? parsedHeaderTotal : records.length),
  };
}

/** Retrieves a paginated resource collection from its future admin endpoint. */
async function getList<RecordType extends RaRecord>(
  resource: string,
  params: GetListParams,
): Promise<GetListResult<RecordType>> {
  const response = await adminRequest(`${resourceUrl(resource)}?${listQuery(params)}`, {
    signal: params.signal,
  });
  return listFromResponse<RecordType>(response.json, response.headers);
}

async function getOne<RecordType extends RaRecord>(
  resource: string,
  params: GetOneParams<RecordType>,
): Promise<GetOneResult<RecordType>> {
  const response = await adminRequest(resourceUrl(resource, params.id), {
    signal: params.signal,
  });
  return { data: recordFromPayload<RecordType>(response.json) };
}

/** Retrieves records by id through the list endpoint to preserve REST portability. */
async function getMany<RecordType extends RaRecord>(
  resource: string,
  params: GetManyParams<RecordType>,
): Promise<GetManyResult<RecordType>> {
  const query = new URLSearchParams({
    filter: JSON.stringify({ id: params.ids }),
  });
  const response = await adminRequest(`${resourceUrl(resource)}?${query}`, {
    signal: params.signal,
  });
  return {
    data: listFromResponse<RecordType>(response.json, response.headers).data,
  };
}

/** Translates a reference lookup into the same pagination contract as a list. */
async function getManyReference<RecordType extends RaRecord>(
  resource: string,
  params: GetManyReferenceParams,
): Promise<GetManyReferenceResult<RecordType>> {
  const filter = { ...params.filter, [params.target]: params.id };
  return getList<RecordType>(resource, { ...params, filter });
}

async function create<
  RecordType extends Omit<RaRecord, "id">,
  ResultRecordType extends RaRecord = RecordType & { id: Identifier },
>(
  resource: string,
  params: CreateParams,
): Promise<CreateResult<ResultRecordType>> {
  const response = await adminRequest(resourceUrl(resource), {
    method: "POST",
    body: JSON.stringify(params.data),
  });
  return { data: recordFromPayload<ResultRecordType>(response.json) };
}

async function update<RecordType extends RaRecord>(
  resource: string,
  params: UpdateParams,
): Promise<UpdateResult<RecordType>> {
  const response = await adminRequest(resourceUrl(resource, params.id), {
    method: "PUT",
    body: JSON.stringify(params.data),
  });
  return { data: recordFromPayload<RecordType>(response.json) };
}

/** Applies bulk updates through individual REST requests until a bulk contract exists. */
async function updateMany<RecordType extends RaRecord>(
  resource: string,
  params: UpdateManyParams,
): Promise<UpdateManyResult<RecordType>> {
  await Promise.all(
    params.ids.map((id) =>
      adminRequest(resourceUrl(resource, id), {
        method: "PUT",
        body: JSON.stringify(params.data),
      }),
    ),
  );
  return { data: params.ids as RecordType["id"][] };
}

async function deleteOne<RecordType extends RaRecord>(
  resource: string,
  params: DeleteParams<RecordType>,
): Promise<DeleteResult<RecordType>> {
  const response = await adminRequest(resourceUrl(resource, params.id), {
    method: "DELETE",
  });
  return {
    data:
      response.status === 204
        ? (params.previousData ?? ({ id: params.id } as RecordType))
        : recordFromPayload<RecordType>(response.json),
  };
}

/** Applies bulk deletes through individual REST requests until a bulk contract exists. */
async function deleteMany<RecordType extends RaRecord>(
  resource: string,
  params: DeleteManyParams<RecordType>,
): Promise<DeleteManyResult<RecordType>> {
  await Promise.all(
    params.ids.map((id) =>
      adminRequest(resourceUrl(resource, id), { method: "DELETE" }),
    ),
  );
  return { data: params.ids };
}

export const dataProvider: DataProvider = {
  getList,
  getOne,
  getMany,
  getManyReference,
  create,
  update,
  updateMany,
  delete: deleteOne,
  deleteMany,
  supportAbortSignal: true,
};
