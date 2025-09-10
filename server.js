import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { MCPServer } from './mcp-protocol.js';
import { SupabaseTools } from './supabase-tools.js';
import { createServer } from 'http';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'mcp-supabase-native-server',
    version: '1.0.0',
    protocols: ['websocket', 'sse', 'http']
  });
});

// Crear instancia del servidor MCP
const mcpServer = new MCPServer();

try {
  const supabaseTools = new SupabaseTools();
  supabaseTools.registerTools(mcpServer);
  console.log('✅ Supabase tools registered successfully');
} catch (error) {
  console.error('❌ Failed to register Supabase tools:', error.message);
}

// WebSocket Server para MCP
const wss = new WebSocketServer({ 
  server,
  path: '/mcp'
});

wss.on('connection', (ws) => {
  console.log('🔌 New MCP client connected via WebSocket');
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received MCP message:', message.method);
      
      const response = await mcpServer.handleMessage(message);
      
      if (response) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('❌ Error handling MCP message:', error);
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error"
        }
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 MCP client disconnected');
  });
});

// Server-Sent Events endpoint para n8n
app.get('/mcp/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  console.log('📺 SSE client connected');
  
  // Enviar mensaje inicial
  res.write('data: {"type": "connection", "status": "connected"}\n\n');

  // Manejar mensajes MCP via SSE
  req.on('close', () => {
    console.log('📺 SSE client disconnected');
  });
});

// HTTP endpoint para MCP
app.post('/mcp/http', async (req, res) => {
  try {
    const message = req.body;
    console.log('🌐 HTTP MCP message:', message.method);
    
    const response = await mcpServer.handleMessage(message);
    
    if (response) {
      res.json(response);
    } else {
      res.status(204).send();
    }
  } catch (error) {
    console.error('❌ HTTP MCP error:', error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id || null,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// Diagnostics endpoint
app.get('/diagnostics', (req, res) => {
  res.json({
    server_info: {
      name: 'mcp-supabase-native-server',
      version: '1.0.0',
      status: 'running',
      protocols: ['websocket', 'sse', 'http'],
      mcp_version: '2024-11-05'
    },
    available_tools: Array.from(mcpServer.tools.keys()),
    tool_count: mcpServer.tools.size,
    endpoints: {
      websocket: `ws://localhost:${PORT}/mcp`,
      sse: `http://localhost:${PORT}/mcp/sse`,
      http: `http://localhost:${PORT}/mcp/http`,
      health: `http://localhost:${PORT}/health`,
      diagnostics: `http://localhost:${PORT}/diagnostics`
    },
    environment: {
      node_env: process.env.NODE_ENV || 'production',
      port: PORT,
      supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    }
  });
});

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MCP Supabase Native Server v1.0 running on port ${PORT}`);
  console.log(`📡 WebSocket: ws://localhost:${PORT}/mcp`);
  console.log(`📺 SSE: http://localhost:${PORT}/mcp/sse`);
  console.log(`🌐 HTTP: http://localhost:${PORT}/mcp/http`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🔧 Diagnostics: http://localhost:${PORT}/diagnostics`);
  console.log(`🛠️ Tools: ${mcpServer.tools.size} registered`);
});

export default app;
