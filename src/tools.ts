import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { IBClient } from "./ib-client.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { config } from "./config.js";
import { HeadlessAuthenticator, HeadlessAuthConfig } from "./headless-auth.js";
import open from "open";

export function registerTools(server: McpServer, ibClient: IBClient, gatewayManager?: IBGatewayManager, userConfig?: any) {
  // Use merged config or fall back to default config
  const effectiveConfig = userConfig || config;
  
  // Authentication management
  async function ensureAuth(): Promise<void> {
    // Check if already authenticated
    const isAuthenticated = await ibClient.checkAuthenticationStatus();
    if (isAuthenticated) {
      return; // Already authenticated
    }

    // If in headless mode, start automatic headless authentication
    if (effectiveConfig.IB_HEADLESS_MODE) {
      const port = gatewayManager ? gatewayManager.getCurrentPort() : effectiveConfig.IB_GATEWAY_PORT;
      const authUrl = `https://${effectiveConfig.IB_GATEWAY_HOST}:${port}`;
      
      // Validate that we have credentials for headless mode
      if (!effectiveConfig.IB_USERNAME || !effectiveConfig.IB_PASSWORD_AUTH) {
        throw new Error("Headless mode enabled but authentication credentials missing. Please set IB_USERNAME and IB_PASSWORD_AUTH environment variables.");
      }

      const authConfig: HeadlessAuthConfig = {
        url: authUrl,
        username: effectiveConfig.IB_USERNAME,
        password: effectiveConfig.IB_PASSWORD_AUTH,
        timeout: effectiveConfig.IB_AUTH_TIMEOUT,
        ibClient: ibClient, // Pass the IB client for authentication checking
      };

      const authenticator = new HeadlessAuthenticator();
      const result = await authenticator.authenticate(authConfig);

      if (!result.success) {
        throw new Error(`Authentication failed: ${result.message}`);
      }
    } else {
      // In non-headless mode, throw an error asking user to authenticate manually
      const port = gatewayManager ? gatewayManager.getCurrentPort() : effectiveConfig.IB_GATEWAY_PORT;
      const authUrl = `https://${effectiveConfig.IB_GATEWAY_HOST}:${port}`;
      throw new Error(`Authentication required. Please use the 'authenticate' tool to complete the authentication process at ${authUrl}.`);
    }
  }

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
    const port = gatewayManager ? gatewayManager.getCurrentPort() : effectiveConfig.IB_GATEWAY_PORT;
    const authUrl = `https://${effectiveConfig.IB_GATEWAY_HOST}:${port}`;
    const mode = effectiveConfig.IB_HEADLESS_MODE ? "headless mode" : "browser mode";
    return `Authentication required. Please use the 'authenticate' tool to complete the authentication process (configured for ${mode}) at ${authUrl}.`;
  }

  // Add authenticate tool only if not in headless mode
  if (!effectiveConfig.IB_HEADLESS_MODE) {
    server.tool(
      "authenticate",
      "Authenticate with Interactive Brokers (uses headless mode if enabled in config)",
      {
        random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
      },
      async ({ random_string }) => {
      const port = gatewayManager ? gatewayManager.getCurrentPort() : effectiveConfig.IB_GATEWAY_PORT;
      const authUrl = `https://${effectiveConfig.IB_GATEWAY_HOST}:${port}`;
      
      // Check if headless mode is enabled in config
      if (effectiveConfig.IB_HEADLESS_MODE) {
        try {
          // Use headless authentication
          const authConfig: HeadlessAuthConfig = {
            url: authUrl,
            username: effectiveConfig.IB_USERNAME,
            password: effectiveConfig.IB_PASSWORD_AUTH,
            timeout: effectiveConfig.IB_AUTH_TIMEOUT,
          };

          // Validate that we have credentials for headless mode
          if (!authConfig.username || !authConfig.password) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    message: "Headless mode enabled but authentication credentials missing",
                    error: "Please set IB_USERNAME and IB_PASSWORD_AUTH environment variables for headless authentication",
                    authUrl: authUrl,
                    instructions: [
                      "Set environment variables: IB_USERNAME and IB_PASSWORD_AUTH",
                      "Or disable headless mode by setting IB_HEADLESS_MODE=false",
                      "Then try authentication again"
                    ]
                  }, null, 2),
                },
              ],
            };
          }

          const authenticator = new HeadlessAuthenticator();
          const result = await authenticator.authenticate(authConfig);

          // Authentication completed (success or failure) - no separate 2FA handling needed
          await authenticator.close();
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ...result,
                  authUrl: authUrl,
                  mode: "headless",
                  note: "Headless authentication completed automatically"
                }, null, 2),
              },
            ],
          };

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  message: "Headless authentication failed, falling back to manual browser authentication",
                  error: errorMessage,
                  authUrl: authUrl,
                  mode: "fallback_to_manual",
                  note: "Opening browser for manual authentication..."
                }, null, 2),
              },
            ],
          };
        }
      }
      
      // Original browser-based authentication (when headless mode is disabled or as fallback)
      try {
        await open(authUrl);
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: "Interactive Brokers authentication interface opened in your browser",
                authUrl: authUrl,
                mode: "browser",
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
                mode: "manual",
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
  }
  
  // Add get_account_info tool
  server.tool(
    "get_account_info",
    "Get account information and balances",
    {
      random_string: z.string().optional().describe("Dummy parameter for no-parameter tools"),
    },
    async ({}) => {
      try {
        // Ensure authentication in headless mode
        if (effectiveConfig.IB_HEADLESS_MODE) {
          await ensureAuth();
        }
        
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
        // Ensure authentication in headless mode
        if (effectiveConfig.IB_HEADLESS_MODE) {
          await ensureAuth();
        }
        
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
      exchange: z.string().optional().describe("Exchange (optional), but required for prices"),
    },
    async ({ symbol, exchange }) => {
      try {
        // Ensure authentication in headless mode
        if (effectiveConfig.IB_HEADLESS_MODE) {
          await ensureAuth();
        }
        
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
        // Ensure authentication in headless mode
        if (effectiveConfig.IB_HEADLESS_MODE) {
          await ensureAuth();
        }
        
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
        // Ensure authentication in headless mode
        if (effectiveConfig.IB_HEADLESS_MODE) {
          await ensureAuth();
        }
        
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
