/**
 * Minimal structured logger. JSON lines in production (easy to ship to a log drain),
 * readable lines in development. Never log secrets: callers pass explicit fields only.
 */

type Level = "debug" | "info" | "warn" | "error"
type Fields = Record<string, unknown>

export interface Logger {
  debug(event: string, fields?: Fields): void
  info(event: string, fields?: Fields): void
  warn(event: string, fields?: Fields): void
  error(event: string, fields?: Fields): void
  child(scope: string): Logger
}

const isProduction = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true"

function write(level: Level, scope: string, event: string, fields: Fields = {}) {
  if (isTest || (level === "debug" && isProduction)) return
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info
  if (isProduction) {
    sink(JSON.stringify({ level, scope, event, time: new Date().toISOString(), ...fields }))
  } else {
    const extra = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ""
    sink(`[${level}] ${scope} ${event}${extra}`)
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (event, fields) => write("debug", scope, event, fields),
    info: (event, fields) => write("info", scope, event, fields),
    warn: (event, fields) => write("warn", scope, event, fields),
    error: (event, fields) => write("error", scope, event, fields),
    child: (child) => createLogger(`${scope}:${child}`),
  }
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silentLogger,
}
