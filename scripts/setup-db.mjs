#!/usr/bin/env node
/**
 * Database Provider Setup Script
 *
 * Switches Prisma schema provider based on environment:
 * - Local/dev: SQLite (default)
 * - Production: PostgreSQL (when DB_PROVIDER=postgresql or DATABASE_URL starts with postgresql://)
 *
 * Usage:
 *   node scripts/setup-db.mjs
 *
 * Environment variables:
 *   DB_PROVIDER - "sqlite" or "postgresql" (optional, auto-detected from DATABASE_URL)
 *   DATABASE_URL - Database connection string
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');

// Determine provider from environment
function getProvider() {
  // Explicit provider override
  if (process.env.DB_PROVIDER) {
    return process.env.DB_PROVIDER;
  }

  // Auto-detect from DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    return 'postgresql';
  }

  // Default to sqlite for local dev
  return 'sqlite';
}

// Update schema provider
function updateSchema(provider) {
  let schema = fs.readFileSync(schemaPath, 'utf-8');

  // Replace provider line
  schema = schema.replace(
    /provider\s*=\s*"(sqlite|postgresql)"/,
    `provider = "${provider}"`
  );

  fs.writeFileSync(schemaPath, schema);
  console.log(`✓ Prisma schema updated: provider = "${provider}"`);
}

const provider = getProvider();
console.log(`Database provider: ${provider}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? '(set)' : '(not set)'}`);

updateSchema(provider);
