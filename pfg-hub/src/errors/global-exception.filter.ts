import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  InternalServerErrorException,
} from "@nestjs/common";
import { DomainError } from "./domain-error";

type HttpReply = {
  status: (statusCode: number) => {
    send: (body: unknown) => unknown;
  };
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<HttpReply>();
    const httpException = this.toHttpException(exception);
    const status = httpException.getStatus();
    const body = httpException.getResponse();

    if (typeof body === "string") {
      return response.status(status).send({ error: body });
    }

    const payload = body as Record<string, unknown>;
    return response.status(status).send({
      error: payload.message ?? payload.error ?? "An unexpected error occurred",
    });
  }

  private toHttpException(exception: unknown): HttpException {
    if (exception instanceof HttpException) return exception;
    if (exception instanceof DomainError)
      return new HttpException(exception.message, exception.statusCode);
    if (exception instanceof Error)
      return new InternalServerErrorException(exception.message);
    return new InternalServerErrorException("An unexpected error occurred");
  }
}
