/**
 * Logger estruturado para o módulo Google Places.
 * Nunca deve receber a API key, tokens ou secrets diretamente — como
 * proteção adicional, qualquer campo cujo nome combine com o padrão abaixo
 * é automaticamente substituído por "[REDACTED]" antes de logar.
 */

type LogLevel = "info" | "warn" | "error";
type LogData = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_KEY_PATTERN = /key|token|secret|authorization|password/i;

function redact(data?: LogData): LogData | undefined {
  if (!data) return undefined;
  const clean: LogData = {};
  for (const [field, value] of Object.entries(data)) {
    clean[field] = SENSITIVE_KEY_PATTERN.test(field) ? "[REDACTED]" : value;
  }
  return clean;
}

function write(level: LogLevel, scope: string, message: string, data?: LogData) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...redact(data),
  };
  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createScopedLogger(scope: string) {
  return {
    info: (message: string, data?: LogData) => write("info", scope, message, data),
    warn: (message: string, data?: LogData) => write("warn", scope, message, data),
    error: (message: string, data?: LogData) => write("error", scope, message, data),
  };
}

export const googlePlacesLogger = createScopedLogger("google.places");
