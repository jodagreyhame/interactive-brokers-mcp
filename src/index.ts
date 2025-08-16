import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { config } from "./config.js";
import { registerTools } from "./tools.js";
import { Logger } from "./logger.js";

// Parse command line arguments
function parseArgs(): z.infer<typeof configSchema> {
  const args: any = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = argv[i + 1];
      
      switch (key) {
        case 'ib-username':
          args.IB_USERNAME = nextArg;
          i++;
          break;
        case 'ib-password':
        case 'ib-password-auth':
          args.IB_PASSWORD_AUTH = nextArg;
          i++;
          break;
        case 'ib-auth-timeout':
          args.IB_AUTH_TIMEOUT = parseInt(nextArg);
          i++;
          break;
        case 'ib-headless-mode':
          // Support both --ib-headless-mode (boolean flag) and --ib-headless-mode=true/false
          if (nextArg && !nextArg.startsWith('--')) {
            args.IB_HEADLESS_MODE = nextArg.toLowerCase() === 'true';
            i++;
          } else {
            args.IB_HEADLESS_MODE = true;
          }
          break;
      }
    } else if (arg.includes('=')) {
      const [key, value] = arg.split('=', 2);
      const cleanKey = key.startsWith('--') ? key.slice(2) : key;
      
      switch (cleanKey) {
        case 'ib-username':
          args.IB_USERNAME = value;
          break;
        case 'ib-password':
        case 'ib-password-auth':
          args.IB_PASSWORD_AUTH = value;
          break;
        case 'ib-auth-timeout':
          args.IB_AUTH_TIMEOUT = parseInt(value);
          break;
        case 'ib-headless-mode':
          args.IB_HEADLESS_MODE = value.toLowerCase() === 'true';
          break;
      }
    }
  }
  
  return args;
}

// Optional: Define configuration schema for session configuration
export const configSchema = z.object({
  // Authentication configuration
  IB_USERNAME: z.string().optional(),
  IB_PASSWORD_AUTH: z.string().optional(),
  IB_AUTH_TIMEOUT: z.number().optional(),
  IB_HEADLESS_MODE: z.boolean().optional(),
});

// Global gateway manager instance
let gatewayManager: IBGatewayManager | null = null;

// Initialize and start IB Gateway (fast startup for MCP plugin compatibility)
async function initializeGateway(ibClient?: IBClient) {
  if (!gatewayManager) {
    gatewayManager = new IBGatewayManager();
    
    try {
      Logger.info('⚡ Quick Gateway initialization for MCP plugin...');
      await gatewayManager.quickStartGateway();
      Logger.info('✅ Gateway initialization completed (background startup if needed)');
      
      // Update client port if provided
      if (ibClient) {
        ibClient.updatePort(gatewayManager.getCurrentPort());
      }
    } catch (error) {
      Logger.error('❌ Failed to initialize Gateway:', error);
      // Don't throw error during quick startup - tools will handle it
      Logger.warn('⚠️ Gateway initialization failed, tools will attempt connection when called');
    }
  }
  return gatewayManager;
}

// Cleanup function for gateway
async function cleanupGateway(signal?: string) {
  if (signal) {
    Logger.info(`🛑 Received ${signal}, cleaning up...`);
  }
  
  if (gatewayManager) {
    try {
      Logger.info('🛑 Shutting down IB Gateway...');
      await gatewayManager.stopGateway();
      Logger.info('✅ IB Gateway shutdown complete');
    } catch (error) {
      Logger.error('Error stopping gateway:', error);
    }
    gatewayManager = null;
  }
}

// Set up shutdown handlers with better MCP plugin compatibility
let isShuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) {
    return; // Silent return to avoid log spam
  }
  isShuttingDown = true;
  
  // Don't use async/await here to avoid potential hanging
  cleanupGateway(signal).finally(() => {
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // MCP plugin uses SIGTERM
process.on('exit', (code) => {
  Logger.info(`🛑 Process exiting with code ${code}, ensuring cleanup...`);
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  Logger.error('🚨 Uncaught exception:', error);
  cleanupGateway('UNCAUGHT_EXCEPTION').finally(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('🚨 Unhandled rejection at:', promise, 'reason:', reason);
  cleanupGateway('UNHANDLED_REJECTION').finally(() => {
    process.exit(1);
  });
});

// Check if this module is being run directly (for stdio compatibility)
// This handles direct execution, npx, and bin script execution
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('index.js') ||
                     process.argv[1]?.endsWith('dist/index.js') ||
                     process.argv[1]?.endsWith('ib-mcp') ||
                     process.argv[1]?.includes('/.bin/ib-mcp');

function IBMCP({ config: userConfig }: { config: z.infer<typeof configSchema> }) {
  // Merge user config with environment config
  const mergedConfig = {
    ...config,
    ...userConfig
  };

  // Create IB Client with default port initially - this will be updated once gateway starts
  const ibClient = new IBClient({
    host: mergedConfig.IB_GATEWAY_HOST,
    port: mergedConfig.IB_GATEWAY_PORT,
  });

  // Initialize gateway on first server creation and update client port
  initializeGateway(ibClient).catch(error => {
    Logger.error('Failed to initialize gateway:', error);
  });

  Logger.info('Gateway starting...');

  // Create MCP server
  try {
    const server = new Server({
      name: "interactive-brokers-mcp",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {},
        logging: {},
      }
    });
  
    // Register all tools with merged config
    registerTools(server, ibClient, gatewayManager || undefined, mergedConfig);
  
    Logger.info('Tools registered');
  
    return server;
  } catch (error) {
    Logger.error('Failed to create server:', error);
  }

  
}

if (isMainModule) {
  // Suppress known problematic outputs that might interfere with JSON-RPC
  process.env.SUPPRESS_LOAD_MESSAGE = '1';
  process.env.NO_UPDATE_NOTIFIER = '1';
  
  // Log environment info for debugging MCP plugin issues
  Logger.info(`🔍 Environment: PWD=${process.cwd()}, NODE_ENV=${process.env.NODE_ENV || 'undefined'}`);
  Logger.info(`🔍 Process: npm_execpath=${process.env.npm_execpath || 'undefined'}, npm_command=${process.env.npm_command || 'undefined'}`);
  
  // Check if we're running in npx/MCP plugin context
  const isNpx = process.env.npm_execpath?.includes('npx') || process.cwd().includes('.npm');
  if (isNpx) {
    Logger.info('📦 Detected npx execution - likely running via MCP community plugin');
  }
  
  // Log startup information
  Logger.logStartup();
  
  // Parse command line arguments and merge with environment variables
  // Priority: args > env > defaults
  const argsConfig = parseArgs();
  const envConfig = {
    IB_USERNAME: process.env.IB_USERNAME,
    IB_PASSWORD_AUTH: process.env.IB_PASSWORD_AUTH || process.env.IB_PASSWORD,
    IB_AUTH_TIMEOUT: process.env.IB_AUTH_TIMEOUT ? parseInt(process.env.IB_AUTH_TIMEOUT) : undefined,
    IB_HEADLESS_MODE: process.env.IB_HEADLESS_MODE === 'true',
  };
  
  // Merge configs with priority: args > env > defaults
  const finalConfig = {
    ...envConfig,
    ...argsConfig,
  };
  
  // Remove undefined values
  Object.keys(finalConfig).forEach(key => {
    if (finalConfig[key as keyof typeof finalConfig] === undefined) {
      delete finalConfig[key as keyof typeof finalConfig];
    }
  });
  
  const stdioTransport = new StdioServerTransport();
  const server = IBMCP({config: finalConfig})
  server.connect(stdioTransport);
}

export default IBMCP;

