/**
 * Database Setup Script
 * 
 * Initializes the SQLite database with required tables.
 * Run this once before starting the application.
 */

const db = require('../lib/db');

// Add screenshot_path column if it doesn't exist (migration for existing databases)
try {
  db.exec(`ALTER TABLE deployments ADD COLUMN screenshot_path TEXT`);
  console.log('Added screenshot_path column to deployments table');
} catch (err) {
  if (err.message.includes('duplicate column name')) {
    console.log('screenshot_path column already exists');
  } else {
    console.error('Error adding screenshot_path column:', err.message);
  }
}

console.log('Database initialized successfully!');
console.log('Tables created: deployments');
console.log('Database location:', require('path').join(process.cwd(), 'data', 'deployments.db'));

process.exit(0);
