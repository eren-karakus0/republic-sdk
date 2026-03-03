export class RepublicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepublicError';
  }
}

export class RpcError extends RepublicError {
  constructor(
    message: string,
    public readonly code: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export class RestError extends RepublicError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'RestError';
  }
}

export class BroadcastError extends RepublicError {
  constructor(
    message: string,
    public readonly code: number,
    public readonly log: string,
    public readonly hash?: string,
  ) {
    super(message);
    this.name = 'BroadcastError';
  }
}

export class TimeoutError extends RepublicError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends RepublicError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AccountNotFoundError extends RepublicError {
  constructor(public readonly address: string) {
    super(`Account not found: ${address}`);
    this.name = 'AccountNotFoundError';
  }
}
