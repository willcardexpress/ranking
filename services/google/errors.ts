export type PlacesErrorCode =
  | "MISSING_API_KEY"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_REQUEST"
  | "INTERNAL_RATE_LIMITED";

export class PlacesServiceError extends Error {
  code: PlacesErrorCode;

  constructor(code: PlacesErrorCode, message: string) {
    super(message);
    this.name = "PlacesServiceError";
    this.code = code;
  }
}
