export type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

export function getHeader(request: RequestWithHeaders, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
