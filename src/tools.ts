import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { config } from "./config.js";
import open from "open";

export function registerTools(server: McpServer, ibClient: IBClient, gatewayManager?: IBGatewayManager) {
  // Helper function to check for authentication errors
  function isAuthenticationError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    const errorStatus = error.response?.status;
    const responseData = error.response?.data;
    
    return (
      errorStatus === 401 ||
      errorStatus === 403 ||
      errorStatus === 500 ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("not authenticated") ||
      errorMessage.includes("login") ||
      responseData?.error === "not authenticated"
    );
  }

  function getAuthenticationErrorMessage(): string {
    const port = gatewayManager ? gatewayManager.getCurrentPort() : config.IB_GATEWAY_PORT;
    const authUrl = `https://${config.IB_GATEWAY_HOST}:${port}`;
    return `Authentication required. Please use the 'authenticate' tool to open the Interactive Brokers web interface at ${authUrl} and complete the authentication process.`;
  }

  // Add authenticate tool
  server.tool(
    "authenticate",
    "Open Interactive Brokers authentication web interface",
    {
      random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
    },
    async ({ random_string }) => {
      const port = gatewayManager ? gatewayManager.getCurrentPort() : config.IB_GATEWAY_PORT;
      const authUrl = `https://${config.IB_GATEWAY_HOST}:${port}`;
      
      try {
        await open(authUrl);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Interactive Brokers authentication interface opened in your browser",
                authUrl: authUrl,
                instructions: [
                  "1. The authentication page has been opened in your default browser",
                  "2. Accept any SSL certificate warnings (this is normal for localhost)",
                  "3. Complete the authentication process in the IB Gateway web interface",
                  "4. Log in with your Interactive Brokers credentials",
                  "5. Once authenticated, you can use other trading tools"
                ],
                browserOpened: true,
                note: "IB Gateway is running locally - your credentials stay secure on your machine"
              }, null, 2),
            },
          ],
        };
      } catch (browserError) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Opening Interactive Brokers authentication interface...",
                authUrl: authUrl,
                instructions: [
                  "1. Open the authentication URL below in your browser:",
                  `   ${authUrl}`,
                  "2. Accept any SSL certificate warnings (this is normal for localhost)",
                  "3. Complete the authentication process",
                  "4. Log in with your Interactive Brokers credentials",
                  "5. Once authenticated, you can use other trading tools"
                ],
                browserOpened: false,
                note: "Please open the URL manually. IB Gateway is running locally."
              }, null, 2),
            },
          ],
        };
      }
    }
  );

  // Add get_account_info tool
  server.tool(
    "get_account_info",
    "Get account information and balances",
    {
      random_string: z.string().describe("Dummy parameter for no-parameter tools"),
    },
    async ({ random_string }) => {
      try {
        const result = await ibClient.getAccountInfo();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (isAuthenticationError(error)) {
          return {
            content: [
              {
                type: "text",
                text: getAuthenticationErrorMessage(),
              },
            ],
          };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Add get_positions tool
  server.tool(
    "get_positions",
    "Get current positions for an account",
    {
      accountId: z.string().optional().describe("Account ID (optional, uses default if not provided)"),
    },
    async ({ accountId }) => {
      try {
        const result = await ibClient.getPositions(accountId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (isAuthenticationError(error)) {
          return {
            content: [
              {
                type: "text",
                text: getAuthenticationErrorMessage(),
              },
            ],
          };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Add get_market_data tool
  server.tool(
    "get_market_data",
    "Get real-time market data for a symbol",
    {
      symbol: z.string().describe("Trading symbol (e.g., AAPL, TSLA)"),
      exchange: z.string().optional().describe("Exchange (optional)"),
    },
    async ({ symbol, exchange }) => {
      try {
        const result = await ibClient.getMarketData(symbol, exchange);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (isAuthenticationError(error)) {
          return {
            content: [
              {
                type: "text",
                text: getAuthenticationErrorMessage(),
              },
            ],
          };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Add place_order tool
  server.tool(
    "place_order",
    "Place a trading order",
    {
      accountId: z.string().describe("Account ID"),
      symbol: z.string().describe("Trading symbol"),
      action: z.enum(["BUY", "SELL"]).describe("Order action"),
      orderType: z.enum(["MKT", "LMT", "STP"]).describe("Order type"),
      quantity: z.number().describe("Number of shares"),
      price: z.number().optional().describe("Limit price (required for LMT orders)"),
      stopPrice: z.number().optional().describe("Stop price (required for STP orders)"),
    },
    async ({ accountId, symbol, action, orderType, quantity, price, stopPrice }) => {
      try {
        const result = await ibClient.placeOrder({
          accountId,
          symbol,
          action,
          orderType,
          quantity,
          price,
          stopPrice,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (isAuthenticationError(error)) {
          return {
            content: [
              {
                type: "text",
                text: getAuthenticationErrorMessage(),
              },
            ],
          };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );

  // Add get_order_status tool
  server.tool(
    "get_order_status",
    "Get the status of a specific order",
    {
      orderId: z.string().describe("Order ID"),
    },
    async ({ orderId }) => {
      try {
        const result = await ibClient.getOrderStatus(orderId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        if (isAuthenticationError(error)) {
          return {
            content: [
              {
                type: "text",
                text: getAuthenticationErrorMessage(),
              },
            ],
          };
        }
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    }
  );
}
