import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { [key: string]: z.ZodType<any> };
}

// Tool input schemas (as raw shapes for MCP server)
export const AuthenticateSchema = {};

export const GetAccountInfoSchema = {};

export const GetPositionsSchema = {
  accountId: z.string().optional().describe("Account ID (optional, uses default if not provided)"),
};

export const GetMarketDataSchema = {
  symbol: z.string().describe("Trading symbol (e.g., AAPL, TSLA)"),
  exchange: z.string().optional().describe("Exchange (optional)"),
};

export const PlaceOrderSchema = {
  accountId: z.string().describe("Account ID"),
  symbol: z.string().describe("Trading symbol"),
  action: z.enum(["BUY", "SELL"]).describe("Order action"),
  orderType: z.enum(["MKT", "LMT", "STP"]).describe("Order type"),
  quantity: z.number().describe("Number of shares"),
  price: z.number().optional().describe("Limit price (required for LMT orders)"),
  stopPrice: z.number().optional().describe("Stop price (required for STP orders)"),
};

export const GetOrderStatusSchema = {
  orderId: z.string().describe("Order ID"),
};

// Tool definitions
export const toolDefinitions: ToolDefinition[] = [
  {
    name: "authenticate",
    description: "Authenticate with Interactive Brokers (uses headless mode if enabled in config)",
    inputSchema: AuthenticateSchema,
  },
  {
    name: "get_account_info",
    description: "Get account information and balances",
    inputSchema: GetAccountInfoSchema,
  },
  {
    name: "get_positions",
    description: "Get current positions for an account",
    inputSchema: GetPositionsSchema,
  },
  {
    name: "get_market_data",
    description: "Get real-time market data for a symbol",
    inputSchema: GetMarketDataSchema,
  },
  {
    name: "place_order",
    description: "Place a trading order",
    inputSchema: PlaceOrderSchema,
  },
  {
    name: "get_order_status",
    description: "Get the status of a specific order",
    inputSchema: GetOrderStatusSchema,
  },
];

// Export Zod object schemas for type inference
export const AuthenticateZodSchema = z.object(AuthenticateSchema);
export const GetAccountInfoZodSchema = z.object(GetAccountInfoSchema);
export const GetPositionsZodSchema = z.object(GetPositionsSchema);
export const GetMarketDataZodSchema = z.object(GetMarketDataSchema);
export const PlaceOrderZodSchema = z.object(PlaceOrderSchema);
export const GetOrderStatusZodSchema = z.object(GetOrderStatusSchema);

// Export individual schemas for type inference
export type AuthenticateInput = z.infer<typeof AuthenticateZodSchema>;
export type GetAccountInfoInput = z.infer<typeof GetAccountInfoZodSchema>;
export type GetPositionsInput = z.infer<typeof GetPositionsZodSchema>;
export type GetMarketDataInput = z.infer<typeof GetMarketDataZodSchema>;
export type PlaceOrderInput = z.infer<typeof PlaceOrderZodSchema>;
export type GetOrderStatusInput = z.infer<typeof GetOrderStatusZodSchema>;
