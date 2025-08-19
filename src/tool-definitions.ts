export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// ── Base helpers ──────────────────────────────────────────────────────────────
const V = "https://json-schema.org/draft/2020-12/schema";

// Accept either integer or stringified integer (tolerant); tighten if you prefer.
const IntegerOrStringInteger = {
  oneOf: [
    { type: "integer", minimum: 1 },
    { type: "string", pattern: "^[0-9]+$" }
  ],
  description: "Positive whole number (e.g., 1, 2, 10)."
};

// ── Schemas ───────────────────────────────────────────────────────────────────
export const AuthenticateSchema = {
  $schema: V,
  type: "object",
  properties: {},
  additionalProperties: false
};

export const GetAccountInfoSchema = {
  $schema: V,
  type: "object",
  properties: {},
  additionalProperties: false
};

export const GetPositionsSchema = {
  $schema: V,
  type: "object",
  properties: {
    accountId: {
      type: "string",
      description: "Account ID (optional, uses default if omitted)"
    }
  },
  additionalProperties: false
};

export const GetMarketDataSchema = {
  $schema: V,
  type: "object",
  properties: {
    symbol: {
      type: "string",
      description: "Trading symbol (e.g., AAPL, TSLA)"
    },
    exchange: {
      type: "string",
      description: "Exchange (optional)"
    }
  },
  required: ["symbol"],
  additionalProperties: false
};

export const PlaceOrderSchema = {
  $schema: V,
  type: "object",
  properties: {
    accountId: { type: "string", description: "Account ID" },
    symbol:    { type: "string", description: "Trading symbol" },
    action:    { type: "string", enum: ["BUY", "SELL"], description: "Order action" },
    orderType: { type: "string", enum: ["MKT", "LMT", "STP"], description: "Order type" },
    quantity:  IntegerOrStringInteger,
    price:     { type: "number", description: "Limit price (required for LMT)" },
    stopPrice: { type: "number", description: "Stop price (required for STP)" }
  },
  required: ["accountId", "symbol", "action", "orderType", "quantity"],
  additionalProperties: false,

  // Conditional requirements
  allOf: [
    {
      if: { properties: { orderType: { const: "LMT" } }, required: ["orderType"] },
      then: { required: ["price"] }
    },
    {
      if: { properties: { orderType: { const: "STP" } }, required: ["orderType"] },
      then: { required: ["stopPrice"] }
    }
  ]
};

export const GetOrderStatusSchema = {
  $schema: V,
  type: "object",
  properties: {
    orderId: { type: "string", description: "Order ID" }
  },
  required: ["orderId"],
  additionalProperties: false
};

// ── Tool definitions (strengthened descriptions to guide the agent) ───────────
export const toolDefinitions: ToolDefinition[] = [
  {
    name: "authenticate",
    description:
      "Authenticate with Interactive Brokers. Usage: `{}` (no parameters). Never pass null/empty string.",
    inputSchema: AuthenticateSchema
  },
  {
    name: "get_account_info",
    description:
      "Get account information and balances. Usage: `{}` (no parameters).",
    inputSchema: GetAccountInfoSchema
  },
  {
    name: "get_positions",
    description:
      "Get current positions. Usage: `{}` or `{ \"accountId\": \"<id>\" }`.",
    inputSchema: GetPositionsSchema
  },
  {
    name: "get_market_data",
    description:
      "Get real-time market data. Usage: `{ \"symbol\": \"AAPL\" }` or `{ \"symbol\": \"AAPL\", \"exchange\": \"NASDAQ\" }`.",
    inputSchema: GetMarketDataSchema
  },
  {
    name: "place_order",
    description:
      "Place an order. Usage examples:\n" +
      "- Market buy: `{ \"accountId\":\"abc\", \"symbol\":\"AAPL\", \"action\":\"BUY\", \"orderType\":\"MKT\", \"quantity\":1 }`\n" +
      "- Limit sell: `{ \"accountId\":\"abc\", \"symbol\":\"AAPL\", \"action\":\"SELL\", \"orderType\":\"LMT\", \"quantity\":1, \"price\":185.5 }`\n" +
      "- Stop sell: `{ \"accountId\":\"abc\", \"symbol\":\"AAPL\", \"action\":\"SELL\", \"orderType\":\"STP\", \"quantity\":1, \"stopPrice\":180 }`",
    inputSchema: PlaceOrderSchema
  },
  {
    name: "get_order_status",
    description:
      "Get status for an order. Usage: `{ \"orderId\": \"12345\" }`.",
    inputSchema: GetOrderStatusSchema
  }
];

// ── TS types (unchanged, but consider aligning quantity to number | string) ───
export type AuthenticateInput = {};
export type GetAccountInfoInput = {};
export type GetPositionsInput = { accountId?: string };
export type GetMarketDataInput = { symbol: string; exchange?: string };
export type PlaceOrderInput = {
  accountId: string;
  symbol: string;
  action: "BUY" | "SELL";
  orderType: "MKT" | "LMT" | "STP";
  quantity: number | string;   // if you keep tolerant schema above
  price?: number;
  stopPrice?: number;
};
export type GetOrderStatusInput = { orderId: string };
