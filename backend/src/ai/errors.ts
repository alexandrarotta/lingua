export class AiHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, opts: { status: number; code?: string }) {
    super(message);
    this.name = "AiHttpError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

export function isErrnoLike(err: unknown): err is { code?: unknown } {
  return !!err && typeof err === "object" && "code" in err;
}

