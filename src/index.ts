import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { config } from "./config.js";
import { registerTools } from "./tools.js";
import { Logger } from "./logger.js";

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

// Initialize and start IB Gateway
async function initializeGateway(ibClient?: IBClient) {
  if (!gatewayManager) {
    gatewayManager = new IBGatewayManager();
    
    try {
      Logger.info('🚀 Starting Interactive Brokers Gateway...');
      await gatewayManager.startGateway();
      Logger.info('✅ IB Gateway started successfully');
      
      // Update client port if provided
      if (ibClient) {
        ibClient.updatePort(gatewayManager.getCurrentPort());
      }
    } catch (error) {
      Logger.error('❌ Failed to start IB Gateway:', error);
      throw error;
    }
  }
  return gatewayManager;
}

// Cleanup function for gateway
async function cleanupGateway() {
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

// Set up shutdown handlers
process.on('SIGINT', cleanupGateway);
process.on('SIGTERM', cleanupGateway);
process.on('exit', () => {
  Logger.info('🛑 Process exiting...');
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

  // Create MCP server
  const server = new McpServer({
    name: "interactive-brokers-mcp",
    version: "1.0.0",
    capabilities: {
      logging: {},
    }
  });

  // Register all tools with merged config
  registerTools(server, ibClient, gatewayManager || undefined, mergedConfig);

  return server.server;
}

if (isMainModule) {
  // Suppress known problematic outputs that might interfere with JSON-RPC
  process.env.SUPPRESS_LOAD_MESSAGE = '1';
  process.env.NO_UPDATE_NOTIFIER = '1';
  
  // Log startup information
  Logger.logStartup();
  
  const stdioTransport = new StdioServerTransport();
  const server = IBMCP({config: {}})
  server.connect(stdioTransport);
}

export default IBMCP;

