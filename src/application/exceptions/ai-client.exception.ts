export class AIClientException extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class InvalidRequestException extends AIClientException {
  constructor(message: string) {
    super(message, 400);
  }
}

export class AuthenticationException extends AIClientException {
  constructor(message: string, status = 401) {
    super(message, status);
  }
}

export class RateLimitException extends AIClientException {
  constructor(message: string) {
    super(message, 429);
  }
}

export class APIOverloadedException extends AIClientException {
  constructor(message: string) {
    super(message, 529);
  }
}

export class ServerException extends AIClientException {
  constructor(message: string, status = 500) {
    super(message, status);
  }
}
