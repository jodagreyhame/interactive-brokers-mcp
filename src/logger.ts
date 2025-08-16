import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// File-based logging utility that never interferes with MCP protocol
export class Logger {
  private static logDir = process.env.IB_MCP_LOG_DIR || join(homedir(), '.ib-mcp');
  private static logFile = join(Logger.logDir, 'ib-mcp.log');
  private static enableLogging = process.env.IB_MCP_DISABLE_LOGGING !== 'true';
  private static enableConsoleLogging = process.env.IB_MCP_CONSOLE_LOGGING === 'true' || 
                                       process.argv.includes('--console-logging') ||
                                       process.argv.includes('--log-console');

  private static ensureLogDir() {
    if (Logger.enableLogging && !existsSync(Logger.logDir)) {
      try {
        mkdirSync(Logger.logDir, { recursive: true });
      } catch (error) {
        // If we can't create log dir, disable logging
        Logger.enableLogging = false;
      }
    }
  }

  private static writeToFile(level: string, message: string, ...args: any[]) {
    if (!Logger.enableLogging) return;
    
    try {
      Logger.ensureLogDir();
      const timestamp = new Date().toISOString();
      const argsStr = args.length > 0 ? ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ') : '';
      const logLine = `${timestamp} [${level}] ${message}${argsStr}\n`;
      appendFileSync(Logger.logFile, logLine, 'utf8');
    } catch (error) {
      // Silently fail to avoid recursive logging issues
    }
  }

  private static writeToConsole(level: string, message: string, ...args: any[]) {
    if (!Logger.enableConsoleLogging) return;
    
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    const logLine = `${timestamp} [${level}] ${message}${argsStr}`;
    
    // Use stderr to avoid interfering with MCP JSON-RPC on stdout
    console.error(logLine);
  }

  private static writeLog(level: string, message: string, ...args: any[]) {
    Logger.writeToFile(level, message, ...args);
    Logger.writeToConsole(level, message, ...args);
  }

  static log(message: string, ...args: any[]) {
    Logger.writeLog('LOG', message, ...args);
  }

  static error(message: string, ...args: any[]) {
    Logger.writeLog('ERROR', message, ...args);
  }

  static info(message: string, ...args: any[]) {
    Logger.writeLog('INFO', message, ...args);
  }

  static debug(message: string, ...args: any[]) {
    if (process.env.DEBUG) {
      Logger.writeLog('DEBUG', message, ...args);
    }
  }

  static critical(message: string, ...args: any[]) {
    Logger.writeLog('CRITICAL', message, ...args);
  }

  static warn(message: string, ...args: any[]) {
    Logger.writeLog('WARN', message, ...args);
  }

  // Get the current log file path (useful for debugging)
  static getLogFile(): string | null {
    return Logger.enableLogging ? Logger.logFile : null;
  }

  // Log a startup message with log file location
  static logStartup() {
    if (Logger.enableLogging || Logger.enableConsoleLogging) {
      const logDestinations = [];
      if (Logger.enableLogging) logDestinations.push(`file: ${Logger.logFile}`);
      if (Logger.enableConsoleLogging) logDestinations.push('console');
      Logger.info(`IB MCP Server started - logging to: ${logDestinations.join(', ')}`);
    }
  }

  // Check if console logging is enabled
  static isConsoleLoggingEnabled(): boolean {
    return Logger.enableConsoleLogging;
  }
}
