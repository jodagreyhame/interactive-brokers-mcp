#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { IBClient } from "./ib-client.js";
import { config } from "./config.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

// Tool schemas
const GetAccountInfoSchema = z.object({});

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

class IBMCPServer {
  private server: Server;
  private ibClient: IBClient;
  private requestCount = 0;
  private lastMemoryCheck = Date.now();

  constructor() {
    // Monitor memory usage
    this.startMemoryMonitoring();
    this.server = new Server(
      {
        name: "interactive-brokers-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.ibClient = new IBClient({
      host: config.IB_GATEWAY_HOST,
      port: config.IB_GATEWAY_PORT,
    });

    this.setupHandlers();
  }

  private startMemoryMonitoring() {
    console.log("[MEMORY] Starting memory monitoring...");
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const now = Date.now();
      const timeDiff = now - this.lastMemoryCheck;
      
      console.log(`[MEMORY] Memory usage - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB, External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);
      console.log(`[MEMORY] Request count: ${this.requestCount}, Requests/sec: ${(this.requestCount / (timeDiff / 1000)).toFixed(2)}`);
      
      // Force garbage collection if available
      if (global.gc) {
        console.log("[MEMORY] Running garbage collection...");
        global.gc();
      }
      
      // Reset request count periodically
      if (timeDiff > 60000) { // Reset every minute
        this.requestCount = 0;
        this.lastMemoryCheck = now;
      }
    }, 5000); // Check every 5 seconds
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_account_info",
            description: "Get account information and balances",
            inputSchema: {
              type: "object",
              properties: {},
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
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const requestId = Math.random().toString(36).substr(2, 9);
      this.requestCount++;
      
      console.log(`[MCP-${requestId}] Received tool call: ${name} (total requests: ${this.requestCount})`, {
        arguments: args,
        timestamp: new Date().toISOString()
      });

      try {
        switch (name) {
          case "get_account_info": {
            console.log(`[MCP-${requestId}] Executing get_account_info...`);
            const result = await this.ibClient.getAccountInfo();
            console.log(`[MCP-${requestId}] get_account_info completed successfully, result size: ${JSON.stringify(result).length} chars`);
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
            const parsed = GetPositionsSchema.parse(args);
            const result = await this.ibClient.getPositions(parsed.accountId);
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
            const parsed = GetMarketDataSchema.parse(args);
            const result = await this.ibClient.getMarketData(
              parsed.symbol,
              parsed.exchange
            );
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
            const parsed = PlaceOrderSchema.parse(args);
            const result = await this.ibClient.placeOrder(parsed);
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
            const parsed = GetOrderStatusSchema.parse(args);
            const result = await this.ibClient.getOrderStatus(parsed.orderId);
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
        console.error(`[MCP-${requestId}] Tool call failed for ${name}:`, error);
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
    });
  }

  async run() {
    // Check if we should run HTTP server (for Cursor/development) or stdio (for production)
    const useHttp = process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http');
    
    if (useHttp) {
      await this.runHttpServer();
    } else {
      await this.runStdioServer();
    }
  }

  private async runStdioServer() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Interactive Brokers MCP server running on stdio");
  }

  private async runHttpServer() {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const app = express();
    
    app.use(express.json());
    app.use(cors({
      origin: '*',
      exposedHeaders: ["Mcp-Session-Id"]
    }));

    // Map to store transports by session ID
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    // MCP POST endpoint
    const mcpPostHandler = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      
      try {
        let transport: StreamableHTTPServerTransport;
        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          transport = transports[sessionId];
        } else if (!sessionId || req.body?.method === 'initialize') {
          // New initialization request
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
              console.log(`Session initialized with ID: ${sessionId}`);
              transports[sessionId] = transport;
            }
          });

          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.log(`Transport closed for session ${sid}`);
              delete transports[sid];
            }
          };

          // Connect the transport to the MCP server
          await this.server.connect(transport);
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        // Handle the request
        await transport.handleRequest(req as any, res as any, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    };

    // Handle GET requests for SSE streams
    const mcpGetHandler = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = transports[sessionId];
      await transport.handleRequest(req as any, res as any);
    };

    // Handle DELETE requests for session termination
    const mcpDeleteHandler = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      try {
        const transport = transports[sessionId];
        await transport.handleRequest(req as any, res as any);
      } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    };

    // Set up routes
    app.post('/mcp', mcpPostHandler);
    app.get('/mcp', mcpGetHandler);
    app.delete('/mcp', mcpDeleteHandler);

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'Interactive Brokers MCP Server' });
    });

    app.listen(port, () => {
      console.error(`Interactive Brokers MCP server running on HTTP port ${port}`);
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down HTTP server...');
      for (const sessionId in transports) {
        try {
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      process.exit(0);
    });
  }
}

const server = new IBMCPServer();
server.run().catch(console.error);
