const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'school_departments';

let client;
let dbInstance;

/**
 * Returns a connected database instance, reusing the same connection
 * across calls (a fresh connection per request would be slow and can
 * exhaust MongoDB Atlas's free-tier connection limit).
 */
async function getDb() {
  if (dbInstance) return dbInstance;

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Add your MongoDB Atlas connection string ' +
      'to the environment before payment/recovery features can work.'
    );
  }

  client = new MongoClient(MONGODB_URI);
  await client.connect();
  dbInstance = client.db(DB_NAME);

  console.log('[mongodb] Connected to', DB_NAME);
  return dbInstance;
}

module.exports = { getDb };
