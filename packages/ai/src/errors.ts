export type AiProviderErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'overloaded'
  | 'invalid_request'
  | 'refusal'
  | 'malformed_response'
  | 'api_error';

/**
 * Typed error thrown by every real AiProvider implementation instead of
 * silently returning empty data. Callers can branch on `.code` to decide
 * whether to retry (rate_limit/overloaded/api_error), surface a config
 * problem (auth), or treat it as a content outcome
 * (refusal/invalid_request/malformed_response).
 */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  override readonly cause?: unknown;

  constructor(message: string, code: AiProviderErrorCode, cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.cause = cause;
  }
}
