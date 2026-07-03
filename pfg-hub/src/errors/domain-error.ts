export class DomainError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
  ) {
    super(message);
  }
}
