const { Client } = require('pg');

const client = new Client({ 
  connectionString: 'postgresql://postgres:Buivuong2k5%40@db.qreqmcprolrpqkrdpwrl.supabase.co:5432/postgres', 
  ssl: { rejectUnauthorized: false } 
});

async function run() {
  try {
    await client.connect();
    
    // Get all tables
    const tablesQuery = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('=== TABLES IN PUBLIC SCHEMA ===\n');
    const tables = tablesQuery.rows.map(r => r.table_name);
    tables.forEach(t => console.log(`- ${t}`));
    
    // Get all columns
    const columnsQuery = await client.query(`
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        is_nullable, 
        column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position
    `);
    
    console.log('\n=== COLUMNS BY TABLE ===\n');
    
    const columnsByTable = {};
    columnsQuery.rows.forEach(row => {
      if (!columnsByTable[row.table_name]) {
        columnsByTable[row.table_name] = [];
      }
      columnsByTable[row.table_name].push(row);
    });
    
    for (const table of tables) {
      const columns = columnsByTable[table] || [];
      console.log(`\n## Table: ${table}`);
      console.log('| Column Name | Data Type | Is Nullable | Default Value |');
      console.log('|-------------|-----------|-------------|---------------|');
      columns.forEach(col => {
        const defaultValue = col.column_default || 'NULL';
        console.log(`| ${col.column_name} | ${col.data_type} | ${col.is_nullable} | ${defaultValue} |`);
      });
    }
    
    await client.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
