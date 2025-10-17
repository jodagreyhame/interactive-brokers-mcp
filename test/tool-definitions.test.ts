// test/tool-definitions.test.ts
import { describe, it, expect } from 'vitest';
import {
  PlaceOrderZodSchema,
  GetPositionsZodSchema,
  GetMarketDataZodSchema,
  GetLiveOrdersZodSchema,
  GetOrderStatusZodSchema,
  ConfirmOrderZodSchema,
} from '../src/tool-definitions.js';

describe('Tool Definitions - Zod Schemas', () => {
  describe('PlaceOrderZodSchema', () => {
    it('should accept valid market order', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: 10,
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it('should accept fractional quantities as numbers', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: 1.5,
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(1.5);
      }
    });

    it('should accept fractional quantities as strings', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: '2.75',
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(2.75);
      }
    });

    it('should accept integer quantities as strings', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: '100',
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(100);
      }
    });

    it('should reject negative quantities', () => {
      const invalidOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: -10,
      };
      
      const result = PlaceOrderZodSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should reject zero quantity', () => {
      const invalidOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: 0,
      };
      
      const result = PlaceOrderZodSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should require price for LMT orders', () => {
      const invalidOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'LMT' as const,
        quantity: 10,
      };
      
      const result = PlaceOrderZodSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should accept valid LMT order with price', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'LMT' as const,
        quantity: 10,
        price: 150.50,
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it('should require stopPrice for STP orders', () => {
      const invalidOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'SELL' as const,
        orderType: 'STP' as const,
        quantity: 10,
      };
      
      const result = PlaceOrderZodSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should accept valid STP order with stopPrice', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'SELL' as const,
        orderType: 'STP' as const,
        quantity: 10,
        stopPrice: 140.00,
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it('should accept suppressConfirmations flag', () => {
      const validOrder = {
        accountId: 'U12345',
        symbol: 'AAPL',
        action: 'BUY' as const,
        orderType: 'MKT' as const,
        quantity: 10,
        suppressConfirmations: true,
      };
      
      const result = PlaceOrderZodSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });
  });

  describe('GetPositionsZodSchema', () => {
    it('should accept accountId', () => {
      const result = GetPositionsZodSchema.safeParse({ accountId: 'U12345' });
      expect(result.success).toBe(true);
    });

    it('should require accountId', () => {
      const result = GetPositionsZodSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('GetMarketDataZodSchema', () => {
    it('should require symbol', () => {
      const result = GetMarketDataZodSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept symbol only', () => {
      const result = GetMarketDataZodSchema.safeParse({ symbol: 'AAPL' });
      expect(result.success).toBe(true);
    });

    it('should accept symbol with exchange', () => {
      const result = GetMarketDataZodSchema.safeParse({ 
        symbol: 'AAPL', 
        exchange: 'NASDAQ' 
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GetLiveOrdersZodSchema', () => {
    it('should accept empty object', () => {
      const result = GetLiveOrdersZodSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept accountId', () => {
      const result = GetLiveOrdersZodSchema.safeParse({ accountId: 'U12345' });
      expect(result.success).toBe(true);
    });
  });

  describe('GetOrderStatusZodSchema', () => {
    it('should require orderId', () => {
      const result = GetOrderStatusZodSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid orderId', () => {
      const result = GetOrderStatusZodSchema.safeParse({ orderId: '12345' });
      expect(result.success).toBe(true);
    });
  });

  describe('ConfirmOrderZodSchema', () => {
    it('should require replyId and messageIds', () => {
      const result = ConfirmOrderZodSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid confirmation data', () => {
      const result = ConfirmOrderZodSchema.safeParse({
        replyId: 'reply-123',
        messageIds: ['msg1', 'msg2'],
      });
      expect(result.success).toBe(true);
    });

    it('should require messageIds to be an array', () => {
      const result = ConfirmOrderZodSchema.safeParse({
        replyId: 'reply-123',
        messageIds: 'msg1',
      });
      expect(result.success).toBe(false);
    });
  });
});

