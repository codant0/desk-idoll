import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

class Logger {
  private logDir: string
  private logFile: string
  private minLevel: LogLevel = 'info'
  private stream: fs.WriteStream | null = null

  constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs')
    this.logFile = path.join(this.logDir, `desk-idoll-${this.getDateStr()}.log`)
  }

  init(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' })
      this.info('Logger initialized', { logFile: this.logFile })
    } catch {
      // Fallback: logging to file failed, console-only mode
    }
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data)
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  error(message: string, error?: unknown): void {
    this.log('error', message, error)
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return

    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`
    const line = data !== undefined
      ? `${prefix} ${message} ${this.serialize(data)}\n`
      : `${prefix} ${message}\n`

    // Console output
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    console[consoleMethod](line.trim())

    // File output
    if (this.stream) {
      this.stream.write(line)
    }
  }

  private serialize(data: unknown): string {
    if (data instanceof Error) {
      return `${data.message}\n${data.stack ?? ''}`
    }
    if (typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2)
      } catch {
        return String(data)
      }
    }
    return String(data)
  }

  private getDateStr(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  dispose(): void {
    if (this.stream) {
      this.stream.end()
      this.stream = null
    }
  }
}

export const logger = new Logger()
