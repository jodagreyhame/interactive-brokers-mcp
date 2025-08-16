import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: { [key: string]: any };
    required?: string[];
  };
}

// Tool input schemas (as JSON Schema objects for MCP protocol)
export const AuthenticateSchema = {
  type: "object" as const,
  properties: {},
  required: [],
};

export const GetAccountInfoSchema = {
  type: "object" as const,
  properties: {},
  required: [],
};

export const GetPositionsSchema = {
  type: "object" as const,
  properties: {
    accountId: {
      type: "string",
      description: "Account ID (optional, uses default if not provided)",
    },
  },
  required: [],
};

export const GetMarketDataSchema = {
  type: "object" as const,
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
};

export const PlaceOrderSchema = {
  type: "object" as const,
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
};

export const GetOrderStatusSchema = {
  type: "object" as const,
  properties: {
    orderId: {
      type: "string",
      description: "Order ID",
    },
  },
  required: ["orderId"],
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

// Export TypeScript types for type inference
export type AuthenticateInput = {};
export type GetAccountInfoInput = {};
export type GetPositionsInput = {
  accountId?: string;
};
export type GetMarketDataInput = {
  symbol: string;
  exchange?: string;
};
export type PlaceOrderInput = {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  orderType: "MKT" | "LMT" | "STP";
  quantity: number;
  price?: number;
  stopPrice?: number;
};
export type GetOrderStatusInput = {
  orderId: string;
};
