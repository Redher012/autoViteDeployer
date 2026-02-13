const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs-extra');

const dbPath = path.join(process.cwd(), 'data', 'deployments.db');
const dataDir = path.dirname(dbPath);

// Ensure data directory exists
fs.ensureDirSync(dataDir);

const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    site_name TEXT NOT NULL,
    subdomain TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    port INTEGER,
    pid INTEGER,
    build_log TEXT,
    error_log TEXT,
    file_path TEXT,
    screenshot_path TEXT,
    is_demo INTEGER DEFAULT 0,
    expires_at DATETIME
  )
`);

// Add new columns if they don't exist (for existing databases)
try {
  db.exec(`ALTER TABLE deployments ADD COLUMN is_demo INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}

try {
  db.exec(`ALTER TABLE deployments ADD COLUMN expires_at DATETIME`);
} catch (e) {
  // Column already exists, ignore
}

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_subdomain ON deployments(subdomain);
  CREATE INDEX IF NOT EXISTS idx_status ON deployments(status);
  CREATE INDEX IF NOT EXISTS idx_is_demo ON deployments(is_demo);
  CREATE INDEX IF NOT EXISTS idx_expires_at ON deployments(expires_at);
`);

module.exports = db;
