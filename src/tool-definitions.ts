// tool-definitions.ts
import { z } from "zod";

// ── Zod Schemas ──────────────────────────────────────────────────────────────
// Helper for tolerant number (allows "1", "1.5", or actual number for fractional shares)
const IntegerOrStringIntegerZod = z.union([
  z.number().positive(),
  z.string().regex(/^[0-9]+(\.[0-9]+)?$/).transform(val => parseFloat(val))
]);

// Zod Raw Shapes (for server.tool() method)
export const AuthenticateZodShape = {
  confirm: z.literal(true)
};

export const GetAccountInfoZodShape = {
  confirm: z.literal(true)
};

export const GetPositionsZodShape = {
  accountId: z.string()
};

export const GetMarketDataZodShape = {
  symbol: z.string(),
  exchange: z.string().optional()
};

export const PlaceOrderZodShape = {
  accountId: z.string(),
  symbol: z.string(),
  action: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MKT", "LMT", "STP"]),
  quantity: IntegerOrStringIntegerZod,
  price: z.number().optional(),
  stopPrice: z.number().optional(),
  suppressConfirmations: z.boolean().optional()
};

export const GetOrderStatusZodShape = {
  orderId: z.string()
};

export const ConfirmOrderZodShape = {
  replyId: z.string(),
  messageIds: z.array(z.string())
};

// Full Zod Schemas (for validation if needed)
export const AuthenticateZodSchema = z.object(AuthenticateZodShape);

export const GetAccountInfoZodSchema = z.object(GetAccountInfoZodShape);

export const GetPositionsZodSchema = z.object(GetPositionsZodShape);

export const GetMarketDataZodSchema = z.object(GetMarketDataZodShape);

export const PlaceOrderZodSchema = z.object(PlaceOrderZodShape).refine(
  (data) => {
    if (data.orderType === "LMT" && data.price === undefined) {
      return false;
    }
    if (data.orderType === "STP" && data.stopPrice === undefined) {
      return false;
    }
    return true;
  },
  {
    message: "LMT orders require price, STP orders require stopPrice",
    path: ["price", "stopPrice"]
  }
);

export const GetOrderStatusZodSchema = z.object(GetOrderStatusZodShape);

export const ConfirmOrderZodSchema = z.object(ConfirmOrderZodShape);

// ── TypeScript types (inferred from Zod schemas) ────────────────────────────
export type AuthenticateInput = z.infer<typeof AuthenticateZodSchema>;
export type GetAccountInfoInput = z.infer<typeof GetAccountInfoZodSchema>;
export type GetPositionsInput = z.infer<typeof GetPositionsZodSchema>;
export type GetMarketDataInput = z.infer<typeof GetMarketDataZodSchema>;
export type PlaceOrderInput = z.infer<typeof PlaceOrderZodSchema>;
export type GetOrderStatusInput = z.infer<typeof GetOrderStatusZodSchema>;
export type ConfirmOrderInput = z.infer<typeof ConfirmOrderZodSchema>;
