/**
 * Database Setup Script
 * 
 * Initializes the SQLite database with required tables.
 * Run this once before starting the application.
 */

const db = require('../lib/db');

console.log('Database initialized successfully!');
console.log('Tables created: deployments');
console.log('Database location:', require('path').join(process.cwd(), 'data', 'deployments.db'));

process.exit(0);
