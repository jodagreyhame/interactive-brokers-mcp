import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { ToolHandlers, ToolHandlerContext } from "./tool-handlers.js";
import { toolDefinitions } from "./tool-definitions.js";

export function registerTools(
  server: McpServer, 
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

  // Register tools based on configuration
  for (const toolDef of toolDefinitions) {
    // Skip authenticate tool if in headless mode
    if (toolDef.name === "authenticate" && userConfig?.IB_HEADLESS_MODE) {
      continue;
    }

    server.tool(
      toolDef.name,
      toolDef.description,
      toolDef.inputSchema,
      async (input: any) => {
        try {
          switch (toolDef.name) {
            case "authenticate":
              return await handlers.authenticate(input);
            case "get_account_info":
              return await handlers.getAccountInfo(input);
            case "get_positions":
              return await handlers.getPositions(input);
            case "get_market_data":
              return await handlers.getMarketData(input);
            case "place_order":
              return await handlers.placeOrder(input);
            case "get_order_status":
              return await handlers.getOrderStatus(input);
            default:
              return {
                content: [
                  {
                    type: "text",
                    text: `Unknown tool: ${toolDef.name}`,
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
                text: `Tool error in ${toolDef.name}: ${errorMessage}. Please check your Interactive Brokers connection and authentication status.`,
              },
            ],
          };
        }
      }
    );
  }
}
