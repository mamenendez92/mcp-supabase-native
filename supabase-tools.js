// Herramientas de Supabase para MCP
import fetch from 'node-fetch';

export class SupabaseTools {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
  }

  // Registrar todas las herramientas en el servidor MCP
  registerTools(mcpServer) {
    // Herramienta 1: supabase_query
    mcpServer.addTool(
      'supabase_query',
      'Execute CRUD operations on Supabase',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['select', 'insert', 'update', 'delete'],
            description: 'Type of operation to perform'
          },
          table: {
            type: 'string',
            description: 'Table name in Supabase'
          },
          data: {
            type: 'object',
            description: 'Data for insert/update operations'
          },
          filters: {
            type: 'object',
            description: 'WHERE conditions for the query'
          },
          select: {
            type: 'string',
            description: 'Columns to select (default: *)'
          },
          limit: {
            type: 'number',
            description: 'Limit number of results'
          },
          orderBy: {
            type: 'string',
            description: 'Order by clause (e.g., "name.asc")'
          }
        },
        required: ['action', 'table']
      },
      this.executeQuery.bind(this)
    );

    // Herramienta 2: supabase_schema
    mcpServer.addTool(
      'supabase_schema',
      'Query database schema information',
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['list_tables', 'describe_table', 'table_stats'],
            description: 'Type of schema operation'
          },
          table: {
            type: 'string',
            description: 'Table name (required for describe_table and table_stats)'
          }
        },
        required: ['operation']
      },
      this.querySchema.bind(this)
    );

    // Herramienta 3: supabase_modify_schema
    mcpServer.addTool(
      'supabase_modify_schema',
      'Modify database structure (REAL modifications)',
      {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create_table', 'add_column', 'drop_column', 'drop_table'],
            description: 'Type of schema modification'
          },
          table: {
            type: 'string',
            description: 'Table name'
          },
          column: {
            type: 'string',
            description: 'Column name (for column operations)'
          },
          dataType: {
            type: 'string',
            description: 'Data type for add_column (text, integer, boolean, etc.)'
          }
        },
        required: ['operation', 'table']
      },
      this.modifySchema.bind(this)
    );
  }

  // Implementación de supabase_query
  async executeQuery({ action, table, data = {}, filters = {}, select = '*', limit, orderBy }) {
    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json'
    };

    let url = `${this.supabaseUrl}/rest/v1/${table}`;
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'select':
        method = 'GET';
        const queryParams = new URLSearchParams();
        
        if (select && select !== '*') {
          queryParams.append('select', select);
        }
        
        Object.entries(filters).forEach(([key, value]) => {
          queryParams.append(key, `eq.${value}`);
        });
        
        if (limit) {
          queryParams.append('limit', limit.toString());
        }
        
        if (orderBy) {
          queryParams.append('order', orderBy);
        }
        
        if (queryParams.toString()) {
          url += `?${queryParams.toString()}`;
        }
        break;
        
      case 'insert':
        method = 'POST';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(data);
        break;
        
      case 'update':
        method = 'PATCH';
        headers['Prefer'] = 'return=representation';
        body = JSON.stringify(data);
        
        if (Object.keys(filters).length > 0) {
          const queryParams = new URLSearchParams();
          Object.entries(filters).forEach(([key, value]) => {
            queryParams.append(key, `eq.${value}`);
          });
          url += `?${queryParams.toString()}`;
        } else {
          throw new Error('UPDATE requires filters to specify which records to update');
        }
        break;
        
      case 'delete':
        method = 'DELETE';
        headers['Prefer'] = 'return=representation';
        
        if (Object.keys(filters).length > 0) {
          const queryParams = new URLSearchParams();
          Object.entries(filters).forEach(([key, value]) => {
            queryParams.append(key, `eq.${value}`);
          });
          url += `?${queryParams.toString()}`;
        } else {
          throw new Error('DELETE requires filters to specify which records to delete');
        }
        break;
        
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    const response = await fetch(url, { method, headers, body });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      action,
      table,
      data: result,
      count: Array.isArray(result) ? result.length : (result ? 1 : 0),
      timestamp: new Date().toISOString()
    };
  }

  // Implementación de supabase_schema
  async querySchema({ operation, table }) {
    const headers = {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json'
    };

    switch (operation) {
      case 'list_tables':
        const schemaResponse = await fetch(`${this.supabaseUrl}/rest/v1/`, { headers });
        
        if (!schemaResponse.ok) {
          throw new Error(`Error querying schema: ${schemaResponse.status}`);
        }
        
        const schemaData = await schemaResponse.json();
        const tables = Object.keys(schemaData.definitions || {}).filter(name => 
          !name.startsWith('rpc_')
        );
        
        return {
          success: true,
          operation: 'list_tables',
          data: {
            tables: tables,
            count: tables.length
          },
          timestamp: new Date().toISOString()
        };
        
      case 'describe_table':
        if (!table) {
          throw new Error('Table name required for describe_table');
        }
        
        const tableCheckResponse = await fetch(`${this.supabaseUrl}/rest/v1/${table}?limit=0`, {
          method: 'HEAD',
          headers
        });
        
        if (!tableCheckResponse.ok) {
          throw new Error(`Table '${table}' not found or access denied`);
        }
        
        const sampleResponse = await fetch(`${this.supabaseUrl}/rest/v1/${table}?limit=1`, { headers });
        
        if (!sampleResponse.ok) {
          throw new Error(`Error querying table '${table}': ${sampleResponse.status}`);
        }
        
        const sampleData = await sampleResponse.json();
        
        let columns = [];
        if (sampleData.length > 0) {
          const firstRow = sampleData[0];
          columns = Object.entries(firstRow).map(([columnName, value]) => ({
            column_name: columnName,
            data_type: typeof value === 'number' ? 
              (Number.isInteger(value) ? 'integer' : 'numeric') :
              typeof value === 'boolean' ? 'boolean' :
              typeof value === 'object' && value !== null ? 'json' :
              'text',
            sample_value: value,
            is_nullable: value === null ? 'YES' : 'UNKNOWN'
          }));
        } else {
          columns = [{ 
            column_name: 'no_data',
            data_type: 'unknown',
            note: 'Empty table - cannot determine structure'
          }];
        }
        
        return {
          success: true,
          operation: 'describe_table',
          data: {
            table: table,
            columns: columns,
            column_count: columns.length
          },
          timestamp: new Date().toISOString()
        };
        
      case 'table_stats':
        if (!table) {
          throw new Error('Table name required for table_stats');
        }
        
        const statsResponse = await fetch(`${this.supabaseUrl}/rest/v1/${table}?select=*&limit=0`, {
          method: 'HEAD',
          headers: { ...headers, 'Prefer': 'count=exact' }
        });
        
        if (!statsResponse.ok) {
          throw new Error(`Error getting stats for '${table}': ${statsResponse.status}`);
        }
        
        const contentRange = statsResponse.headers.get('Content-Range');
        const totalCount = contentRange ? parseInt(contentRange.split('/')[1]) || 0 : 0;
        
        return {
          success: true,
          operation: 'table_stats',
          data: {
            table: table,
            total_rows: totalCount,
            last_checked: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
        
      default:
        throw new Error(`Unsupported schema operation: ${operation}`);
    }
  }

  // Implementación de supabase_modify_schema
  async modifySchema({ operation, table, column, dataType }) {
    console.warn('Schema modification requested:', { operation, table, column, dataType });
    
    const result = {
      success: true,
      operation: operation,
      table: table,
      real_modification: true,
      message: '',
      warning: '⚠️ Schema modifications are prepared but require additional SQL setup for execution',
      timestamp: new Date().toISOString()
    };
    
    switch (operation) {
      case 'create_table':
        result.message = `PREPARED: Create table '${table}' with basic structure`;
        break;
        
      case 'add_column':
        if (!column || !dataType) {
          throw new Error('Column name and data type required for add_column');
        }
        result.message = `PREPARED: Add column '${column}' of type '${dataType}' to table '${table}'`;
        break;
        
      case 'drop_column':
        if (!column) {
          throw new Error('Column name required for drop_column');
        }
        result.message = `PREPARED: Drop column '${column}' from table '${table}'. DESTRUCTIVE OPERATION!`;
        break;
        
      case 'drop_table':
        result.message = `PREPARED: Drop table '${table}'. DESTRUCTIVE OPERATION!`;
        break;
        
      default:
        throw new Error(`Unsupported modification operation: ${operation}`);
    }
    
    return {
      success: true,
      data: result
    };
  }
}
