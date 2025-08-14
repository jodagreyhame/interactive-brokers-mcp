#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { IBTools } from "./tools.js";
import { IBGatewayManager } from "./gateway-manager.js";
import { Logger } from "./logger.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";

class IBMCPServer {
  private server: Server;
  private tools: IBTools;
  private gatewayManager: IBGatewayManager;
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

    this.tools = new IBTools();
    this.gatewayManager = new IBGatewayManager();
    this.setupHandlers();
  }

  private startMemoryMonitoring() {
    Logger.debug("Starting memory monitoring...");
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
        tools: this.tools.getToolDefinitions(),
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

      return await this.tools.handleToolCall(name, args);
    });
  }

  async run() {
    // Set up shutdown handlers first
    this.setupShutdownHandlers();
    
    // Check if we should run HTTP server (for Cursor/development) or stdio (for production)
    const useHttp = process.env.MCP_HTTP_SERVER === 'true' || process.argv.includes('--http');
    
    // In STDIO mode, redirect all stdout to stderr to avoid interfering with MCP protocol
    if (!useHttp) {
      // Save original console.log
      const originalLog = console.log;
      console.log = (...args: any[]) => console.error(...args);
      
      // Restore console.log after startup for HTTP mode tools that might need it
      process.nextTick(() => {
        if (useHttp) {
          console.log = originalLog;
        }
      });
    }
    
    // Only log to console in HTTP mode, use stderr in STDIO mode
    const log = useHttp ? console.log : (msg: string) => console.error(msg);
    const logError = console.error;
    
    // Start IB Gateway first
    log('🚀 Starting Interactive Brokers MCP Server...');
    log('📦 Starting IB Gateway...');
    
    try {
      await this.gatewayManager.startGateway();
      log('✅ IB Gateway started successfully');
    } catch (error) {
      logError('❌ Failed to start IB Gateway:', error);
      process.exit(1);
    }
    
    log(`📡 Starting MCP Server in ${useHttp ? 'HTTP' : 'STDIO'} mode...`);
    
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
      await this.shutdown();
    });
  }

  private setupShutdownHandlers() {
    const shutdown = async () => {
      await this.shutdown();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => {
      // Synchronous cleanup only
      console.log('🛑 Process exiting...');
    });
  }

  private async shutdown() {
    console.log('🛑 Shutting down Interactive Brokers MCP Server...');
    
    try {
      if (this.gatewayManager) {
        await this.gatewayManager.stopGateway();
      }
    } catch (error) {
      console.error('Error stopping gateway:', error);
    }
    
    console.log('✅ Shutdown complete');
    process.exit(0);
  }
}

const server = new IBMCPServer();
server.run().catch(console.error);
