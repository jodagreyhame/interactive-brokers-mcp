import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { ToolHandlers, ToolHandlerContext } from "./tool-handlers.js";
import { toolDefinitions } from "./tool-definitions.js";

export function registerTools(
  server: Server, 
  ibClient: IBClient, 
  gatewayManager?: IBGatewayManager, 
  userConfig?: any
) {
  // Create handler context
  const context: ToolHandlerContext = {
    ibClient,
    gatewayManager,
    config: userConfig,
  };

  // Create handlers instance
  const handlers = new ToolHandlers(context);

  // Get available tools based on configuration
  const availableTools = toolDefinitions.filter(toolDef => {
    // Skip authenticate tool if in headless mode
    if (toolDef.name === "authenticate" && userConfig?.IB_HEADLESS_MODE) {
      return false;
    }
    return true;
  });

  // Register ListTools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: availableTools.map(toolDef => ({
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
      })),
    };
  });

  // Register CallTool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "authenticate":
          return await handlers.authenticate(args as any || {});
        case "get_account_info":
          return await handlers.getAccountInfo(args as any || {});
        case "get_positions":
          return await handlers.getPositions(args as any || {});
        case "get_market_data":
          return await handlers.getMarketData(args as any || {});
        case "place_order":
          return await handlers.placeOrder(args as any || {});
        case "get_order_status":
          return await handlers.getOrderStatus(args as any || {});
        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
          };
      }
    } catch (error) {
      // This is a fallback error handler in case the individual handlers don't catch something
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Tool error in ${name}: ${errorMessage}. Please check your Interactive Brokers connection and authentication status.`,
          },
        ],
      };
    }
  });
}
