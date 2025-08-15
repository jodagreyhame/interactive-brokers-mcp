import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { config } from "./config.js";
import { registerTools } from "./tools.js";

// Optional: Define configuration schema for session configuration
export const configSchema = z.object({
  
});

// Global gateway manager instance
let gatewayManager: IBGatewayManager | null = null;

// Initialize and start IB Gateway
async function initializeGateway() {
  if (!gatewayManager) {
    gatewayManager = new IBGatewayManager();
    
    
      try {
        console.error('🚀 Starting Interactive Brokers Gateway...');
        await gatewayManager.startGateway();
        console.error('✅ IB Gateway started successfully');
      } catch (error) {
        console.error('❌ Failed to start IB Gateway:', error);
        throw error;
      }
    
  }
  return gatewayManager;
}

// Cleanup function for gateway
async function cleanupGateway() {
  if (gatewayManager) {
    try {
      console.error('🛑 Shutting down IB Gateway...');
      await gatewayManager.stopGateway();
      console.error('✅ IB Gateway shutdown complete');
    } catch (error) {
      console.error('Error stopping gateway:', error);
    }
    gatewayManager = null;
  }
}

// Set up shutdown handlers
process.on('SIGINT', cleanupGateway);
process.on('SIGTERM', cleanupGateway);
process.on('exit', () => {
  console.error('🛑 Process exiting...');
});

// Check if this module is being run directly (for stdio compatibility)
// This handles direct execution, npx, and bin script execution
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith('index.js') ||
                     process.argv[1]?.endsWith('dist/index.js') ||
                     process.argv[1]?.endsWith('ib-mcp') ||
                     process.argv[1]?.includes('/.bin/ib-mcp');

function IBMCP({}: { config: z.infer<typeof configSchema> }) {
  // Create IB Client
  const ibClient = new IBClient({
    host: config.IB_GATEWAY_HOST,
    port: config.IB_GATEWAY_PORT,
  });

  // Initialize gateway on first server creation
  initializeGateway().catch(error => {
    console.error('Failed to initialize gateway:', error);
  });

  // Create MCP server
  const server = new McpServer({
    name: "interactive-brokers-mcp",
    version: "1.0.0",
  });

  // Register all tools
  registerTools(server, ibClient);

  return server.server;
}

if (isMainModule) {
  // Suppress known problematic outputs that might interfere with JSON-RPC
  process.env.SUPPRESS_LOAD_MESSAGE = '1';
  process.env.NO_UPDATE_NOTIFIER = '1';
  
  const stdioTransport = new StdioServerTransport();
  const server = IBMCP({config: {}})
  server.connect(stdioTransport);
}

export default IBMCP;

