// Implementación del protocolo MCP estándar
import { EventEmitter } from 'events';

export class MCPServer extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.resources = new Map();
    this.prompts = new Map();
    this.clientCapabilities = null;
  }

  // Registrar herramientas
  addTool(name, description, inputSchema, handler) {
    this.tools.set(name, {
      name,
      description,
      inputSchema,
      handler
    });
  }

  // Manejar mensaje MCP
  async handleMessage(message) {
    try {
      const { method, params, id } = message;
      
      switch (method) {
        case 'initialize':
          return this.handleInitialize(params, id);
          
        case 'tools/list':
          return this.handleToolsList(id);
          
        case 'tools/call':
          return this.handleToolCall(params, id);
          
        case 'notifications/initialized':
          return this.handleInitialized();
          
        default:
          return this.createErrorResponse(id, -32601, `Method not found: ${method}`);
      }
    } catch (error) {
      return this.createErrorResponse(message.id, -32603, error.message);
    }
  }

  handleInitialize(params, id) {
    this.clientCapabilities = params.capabilities;
    
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {
            listChanged: false
          },
          resources: {
            subscribe: false,
            listChanged: false
          },
          prompts: {
            listChanged: false
          }
        },
        serverInfo: {
          name: "supabase-mcp-server",
          version: "1.0.0"
        }
      }
    };
  }

  handleInitialized() {
    this.emit('initialized');
    return null;
  }

  handleToolsList(id) {
    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));

    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools
      }
    };
  }

  async handleToolCall(params, id) {
    const { name, arguments: args } = params;
    
    const tool = this.tools.get(name);
    if (!tool) {
      return this.createErrorResponse(id, -32602, `Tool not found: ${name}`);
    }

    try {
      const result = await tool.handler(args);
      
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };
    } catch (error) {
      return this.createErrorResponse(id, -32603, `Tool execution failed: ${error.message}`);
    }
  }

  createErrorResponse(id, code, message) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message
      }
    };
  }
}
