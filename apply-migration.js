const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://papgcizhfkngubwofjuo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcGdjaXpoZmtuZ3Vid29manVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTkzMDM1MSwiZXhwIjoyMDc3NTA2MzUxfQ.XwEjEJIxZ6J_3C9UZQ3hvrlm3GsfOCxMz3lYUK_trKg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    try {
        const migrationSQL = fs.readFileSync('migrations/024_user_activity_analytics.sql', 'utf8');
        
        // Split SQL into individual statements
        const statements = migrationSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        console.log(`Executing ${statements.length} SQL statements...`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.length > 10) { // Skip very short statements
                console.log(`\nStatement ${i + 1}/${statements.length}:`);
                console.log(statement.substring(0, 100) + '...');
                
                const { data, error } = await supabase.rpc('exec_sql_statement', { sql: statement });
                
                if (error) {
                    console.error(`Error executing statement ${i + 1}:`, error);
                    break;
                } else {
                    console.log(`✅ Statement ${i + 1} executed successfully`);
                }
            }
        }
        
    } catch (error) {
        console.error('Error applying migration:', error);
    }
}

applyMigration();