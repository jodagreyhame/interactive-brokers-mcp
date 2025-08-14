import { z } from "zod";
import { IBClient } from "./ib-client.js";
import { config } from "./config.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import open from "open";

// Tool schemas
const GetAccountInfoSchema = z.object({
  random_string: z.string().optional(), // For compatibility with MCP interface
});

const GetPositionsSchema = z.object({
  accountId: z.string().optional(),
});

const GetMarketDataSchema = z.object({
  symbol: z.string(),
  exchange: z.string().optional(),
});

const PlaceOrderSchema = z.object({
  accountId: z.string(),
  symbol: z.string(),
  action: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MKT", "LMT", "STP"]),
  quantity: z.number(),
  price: z.number().optional(),
  stopPrice: z.number().optional(),
});

const GetOrderStatusSchema = z.object({
  orderId: z.string(),
});

const AuthenticateSchema = z.object({
  random_string: z.string().optional(), // For compatibility with MCP interface
});

export class IBTools {
  private ibClient: IBClient;

  constructor() {
    this.ibClient = new IBClient({
      host: config.IB_GATEWAY_HOST,
      port: config.IB_GATEWAY_PORT,
    });
  }

  getToolDefinitions(): Tool[] {
    return [
      {
        name: "get_account_info",
        description: "Get account information and balances",
        inputSchema: {
          type: "object",
          properties: {
            random_string: {
              type: "string",
              description: "Dummy parameter for no-parameter tools",
            },
          },
          required: ["random_string"],
        },
      },
      {
        name: "get_positions",
        description: "Get current positions for an account",
        inputSchema: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "Account ID (optional, uses default if not provided)",
            },
          },
        },
      },
      {
        name: "get_market_data",
        description: "Get real-time market data for a symbol",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Trading symbol (e.g., AAPL, TSLA)",
            },
            exchange: {
              type: "string",
              description: "Exchange (optional)",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "place_order",
        description: "Place a trading order",
        inputSchema: {
          type: "object",
          properties: {
            accountId: {
              type: "string",
              description: "Account ID",
            },
            symbol: {
              type: "string",
              description: "Trading symbol",
            },
            action: {
              type: "string",
              enum: ["BUY", "SELL"],
              description: "Order action",
            },
            orderType: {
              type: "string",
              enum: ["MKT", "LMT", "STP"],
              description: "Order type",
            },
            quantity: {
              type: "number",
              description: "Number of shares",
            },
            price: {
              type: "number",
              description: "Limit price (required for LMT orders)",
            },
            stopPrice: {
              type: "number",
              description: "Stop price (required for STP orders)",
            },
          },
          required: ["accountId", "symbol", "action", "orderType", "quantity"],
        },
      },
      {
        name: "get_order_status",
        description: "Get the status of a specific order",
        inputSchema: {
          type: "object",
          properties: {
            orderId: {
              type: "string",
              description: "Order ID",
            },
          },
          required: ["orderId"],
        },
      },
      {
        name: "authenticate",
        description: "Open Interactive Brokers authentication web interface",
        inputSchema: {
          type: "object",
          properties: {
            random_string: {
              type: "string",
              description: "Dummy parameter for no-parameter tools",
            },
          },
          required: ["random_string"],
        },
      },
    ];
  }

  private isAuthenticationError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    const errorStatus = error.response?.status;
    const responseData = error.response?.data;
    
    // Check if error was explicitly marked as auth error
    if ((error as any).isAuthError) return true;
    
    // Check for common authentication error patterns
    return (
      errorStatus === 401 ||
      errorStatus === 403 ||
      errorStatus === 500 ||  // IB Gateway sometimes returns 500 for auth issues
      errorMessage.includes("authentication") ||
      errorMessage.includes("authenticate") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("not authenticated") ||
      errorMessage.includes("login") ||
      errorMessage.includes("Authentication required") ||
      responseData?.error?.message?.includes("not authenticated") ||
      responseData?.error?.message?.includes("authentication") ||
      // IB Gateway specific patterns
      responseData?.error === "not authenticated" ||
      (errorStatus === 500 && responseData?.error?.includes("authentication"))
    );
  }

  private getAuthenticationErrorMessage(): string {
    const authUrl = `https://${config.IB_GATEWAY_HOST}:${config.IB_GATEWAY_PORT}`;
    return `Authentication required. Please use the 'authenticate' tool to open the Interactive Brokers web interface at ${authUrl} and complete the authentication process. You may need to accept SSL certificate warnings in your browser.`;
  }

  async handleToolCall(name: string, args: any): Promise<any> {
    const requestId = Math.random().toString(36).substr(2, 9);
    
    console.log(`[TOOLS-${requestId}] Executing tool: ${name}`, {
      arguments: args,
      timestamp: new Date().toISOString()
    });

    try {
      switch (name) {
        case "authenticate": {
          console.log(`[TOOLS-${requestId}] Executing authenticate...`);
          AuthenticateSchema.parse(args); // Validate schema
          
          const authUrl = `https://${config.IB_GATEWAY_HOST}:${config.IB_GATEWAY_PORT}`;
          
          try {
            // Automatically open the browser in local environment
            console.log(`[TOOLS-${requestId}] Opening browser to ${authUrl}`);
            await open(authUrl);
            
            const result = {
              message: "Interactive Brokers authentication interface opened in your browser",
              authUrl: authUrl,
              instructions: [
                "1. The authentication page has been opened in your default browser",
                "2. Accept any SSL certificate warnings in your browser (this is normal for localhost)",
                "3. Complete the authentication process in the IB Gateway web interface",
                "4. Log in with your Interactive Brokers credentials",
                "5. Once authenticated, you can use other trading tools"
              ],
              url: authUrl,
              browserOpened: true,
              note: "IB Gateway is running locally - your credentials stay secure on your machine"
            };
            
            console.log(`[TOOLS-${requestId}] authenticate completed successfully - browser opened`);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (browserError) {
            const errorMessage = browserError instanceof Error ? browserError.message : String(browserError);
            console.warn(`[TOOLS-${requestId}] Cannot open browser automatically:`, errorMessage);
            
            // Provide manual instructions when browser opening fails
            const result = {
              message: "Opening Interactive Brokers authentication interface...",
              authUrl: authUrl,
              instructions: [
                "1. Open the authentication URL below in your browser:",
                `   ${authUrl}`,
                "2. Accept any SSL certificate warnings in your browser (this is normal for localhost)",
                "3. Complete the authentication process in the IB Gateway web interface",
                "4. Log in with your Interactive Brokers credentials", 
                "5. Once authenticated, you can use other trading tools"
              ],
              url: authUrl,
              browserOpened: false,
              note: "Please open the URL manually. IB Gateway is running locally - your credentials stay secure on your machine",
              error: `Browser auto-open failed: ${errorMessage}`
            };
            
            console.log(`[TOOLS-${requestId}] authenticate completed with manual instructions`);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
        }

        case "get_account_info": {
          console.log(`[TOOLS-${requestId}] Executing get_account_info...`);
          GetAccountInfoSchema.parse(args);
          const result = await this.ibClient.getAccountInfo();
          console.log(`[TOOLS-${requestId}] get_account_info completed successfully, result size: ${JSON.stringify(result).length} chars`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_positions": {
          console.log(`[TOOLS-${requestId}] Executing get_positions...`);
          const parsed = GetPositionsSchema.parse(args);
          const result = await this.ibClient.getPositions(parsed.accountId);
          console.log(`[TOOLS-${requestId}] get_positions completed successfully`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_market_data": {
          console.log(`[TOOLS-${requestId}] Executing get_market_data...`);
          const parsed = GetMarketDataSchema.parse(args);
          const result = await this.ibClient.getMarketData(
            parsed.symbol,
            parsed.exchange
          );
          console.log(`[TOOLS-${requestId}] get_market_data completed successfully`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "place_order": {
          console.log(`[TOOLS-${requestId}] Executing place_order...`);
          const parsed = PlaceOrderSchema.parse(args);
          const result = await this.ibClient.placeOrder(parsed);
          console.log(`[TOOLS-${requestId}] place_order completed successfully`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "get_order_status": {
          console.log(`[TOOLS-${requestId}] Executing get_order_status...`);
          const parsed = GetOrderStatusSchema.parse(args);
          const result = await this.ibClient.getOrderStatus(parsed.orderId);
          console.log(`[TOOLS-${requestId}] get_order_status completed successfully`);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[TOOLS-${requestId}] Tool call failed for ${name}:`, error);
      
      // Check if this is an authentication error
      if (this.isAuthenticationError(error)) {
        console.log(`[TOOLS-${requestId}] Detected authentication error, suggesting authentication`);
        return {
          content: [
            {
              type: "text",
              text: this.getAuthenticationErrorMessage(),
            },
          ],
          isError: true,
        };
      }
      
      // For other errors, return the original error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
}
