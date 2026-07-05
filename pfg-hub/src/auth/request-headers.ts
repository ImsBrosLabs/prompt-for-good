export type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

/** Returns a normalized single header value from Nest/Fastify request headers. */
export function getHeader(request: RequestWithHeaders, name: string): string {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
