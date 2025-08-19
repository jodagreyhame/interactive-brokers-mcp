// tools.ts

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    // JSON Schema object compatible with MCP
    [key: string]: any;
  };
}

// ── JSON Schema draft reference (optional but nice to include) ────────────────
const DRAFT = "https://json-schema.org/draft/2020-12/schema";

// Small helper for tolerant integer (allows "1" as string)
// If you want to be strict, replace with { type: "integer", minimum: 1 }
const IntegerOrStringInteger = {
  oneOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[0-9]+$" },
  ],
  description: "Positive whole number (e.g., 1, 2, 10).",
};

// ── Tool input schemas (JSON Schema objects for MCP protocol) ────────────────

// Fallback: require a dummy boolean so the agent cannot send null/"" instead of {}
export const AuthenticateSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    confirm: {
      const: true,
      description: "Set to true to proceed with authentication.",
    },
  },
  required: ["confirm"],
  additionalProperties: false,
};

export const GetAccountInfoSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    confirm: {
      const: true,
      description: "Set to true to fetch account info.",
    },
  },
  required: ["confirm"],
  additionalProperties: false,
};

export const GetPositionsSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    accountId: {
      type: "string",
      description: "Account ID (optional, uses default if omitted).",
    },
  },
  additionalProperties: false,
};

export const GetMarketDataSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    symbol: {
      type: "string",
      description: "Trading symbol (e.g., AAPL, TSLA).",
    },
    exchange: {
      type: "string",
      description: "Exchange (optional).",
    },
  },
  required: ["symbol"],
  additionalProperties: false,
};

export const PlaceOrderSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    accountId: {
      type: "string",
      description: "Account ID.",
    },
    symbol: {
      type: "string",
      description: "Trading symbol.",
    },
    action: {
      type: "string",
      enum: ["BUY", "SELL"],
      description: "Order action.",
    },
    orderType: {
      type: "string",
      enum: ["MKT", "LMT", "STP"],
      description: "Order type.",
    },
    quantity: IntegerOrStringInteger,
    price: {
      type: "number",
      description: "Limit price (required for LMT orders).",
    },
    stopPrice: {
      type: "number",
      description: "Stop price (required for STP orders).",
    },
  },
  required: ["accountId", "symbol", "action", "orderType", "quantity"],
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { orderType: { const: "LMT" } }, required: ["orderType"] },
      then: { required: ["price"] },
    },
    {
      if: { properties: { orderType: { const: "STP" } }, required: ["orderType"] },
      then: { required: ["stopPrice"] },
    },
  ],
};

export const GetOrderStatusSchema = {
  $schema: DRAFT,
  type: "object" as const,
  properties: {
    orderId: {
      type: "string",
      description: "Order ID.",
    },
  },
  required: ["orderId"],
  additionalProperties: false,
};

// ── Tool definitions ─────────────────────────────────────────────────────────
export const toolDefinitions: ToolDefinition[] = [
  {
    name: "authenticate",
    description:
      "Authenticate with Interactive Brokers. Usage: `{ \"confirm\": true }`.",
    inputSchema: AuthenticateSchema,
  },
  {
    name: "get_account_info",
    description:
      "Get account information and balances. Usage: `{ \"confirm\": true }`.",
    inputSchema: GetAccountInfoSchema,
  },
  {
    name: "get_positions",
    description:
      "Get current positions. Usage: `{}` or `{ \"accountId\": \"<id>\" }`.",
    inputSchema: GetPositionsSchema,
  },
  {
    name: "get_market_data",
    description:
      "Get real-time market data. Usage: `{ \"symbol\": \"AAPL\" }` or `{ \"symbol\": \"AAPL\", \"exchange\": \"NASDAQ\" }`.",
    inputSchema: GetMarketDataSchema,
  },
  {
    name: "place_order",
    description:
      "Place a trading order. Examples:\n" +
      "- Market buy: `{ \"accountId\":\"abc\",\"symbol\":\"AAPL\",\"action\":\"BUY\",\"orderType\":\"MKT\",\"quantity\":1 }`\n" +
      "- Limit sell: `{ \"accountId\":\"abc\",\"symbol\":\"AAPL\",\"action\":\"SELL\",\"orderType\":\"LMT\",\"quantity\":1,\"price\":185.5 }`\n" +
      "- Stop sell: `{ \"accountId\":\"abc\",\"symbol\":\"AAPL\",\"action\":\"SELL\",\"orderType\":\"STP\",\"quantity\":1,\"stopPrice\":180 }`",
    inputSchema: PlaceOrderSchema,
  },
  {
    name: "get_order_status",
    description:
      "Get the status of a specific order. Usage: `{ \"orderId\": \"12345\" }`.",
    inputSchema: GetOrderStatusSchema,
  },
];

// ── TypeScript types (align with tolerant quantity) ───────────────────────────
export type AuthenticateInput = { confirm: true };
export type GetAccountInfoInput = { confirm: true };
export type GetPositionsInput = { accountId?: string };
export type GetMarketDataInput = { symbol: string; exchange?: string };
export type PlaceOrderInput = {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  orderType: "MKT" | "LMT" | "STP";
  quantity: number | string; // keep |string if you want to tolerate "1"
  price?: number;
  stopPrice?: number;
};
export type GetOrderStatusInput = { orderId: string };
