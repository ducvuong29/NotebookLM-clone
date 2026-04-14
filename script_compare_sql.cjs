const fs = require('fs');
const { glob } = require('glob');
const path = require('path');

const regex = /^CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|FUNCTION|TRIGGER|POLICY|TYPE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:['"]?public['"]?\.)?['"]?([a-zA-Z0-9_ -]+)['"]?/gmi;

function extractEntities(text) {
    const matches = Array.from(text.matchAll(regex));
    return new Set(matches.map(m => `${m[1].toUpperCase()} ${m[2].trim().toLowerCase()}`));
}

const migrationsPattern = 'f:/NotebookLM clone/NotebookLM-clone/supabase/migrations/**/*.sql';
const restoreFile = 'f:/NotebookLM clone/NotebookLM-clone/supabase/restore_full_database.sql';

async function run() {
    const files = await glob(migrationsPattern);
    let migrationsText = '';
    for (const file of files) {
        migrationsText += fs.readFileSync(file, 'utf8') + '\n';
    }
    
    let migrationsEntities = Array.from(extractEntities(migrationsText)).sort();
    
    // Clean up noisy policies naming strings that had extra double quotes
    migrationsEntities = migrationsEntities.map(x => x.replace(/"/g, ''));
    
    const restoreText = fs.readFileSync(restoreFile, 'utf8');
    let restoreEntities = Array.from(extractEntities(restoreText)).sort();
    restoreEntities = restoreEntities.map(x => x.replace(/"/g, ''));
    
    const mSet = new Set(migrationsEntities);
    const rSet = new Set(restoreEntities);
    
    const missingInRestore = migrationsEntities.filter(x => !rSet.has(x));
    const onlyInRestore = restoreEntities.filter(x => !mSet.has(x));
    
    console.log("=== THỰC THỂ CÓ TRONG MIGRATIONS NHƯNG KHÔNG CÓ TRONG RESTORE FILE (MISSING) ===");
    console.log(missingInRestore.join('\n') || "None");
    
    console.log("\n=== THỰC THỂ CHỈ CÓ TRONG RESTORE FILE (NEW/CONSOLIDATED) ===");
    console.log(onlyInRestore.join('\n') || "None");
}

run();
