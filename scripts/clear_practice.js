const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('../api/config');

const APP_NAME = 'SQLMentor';
const CLUSTER = 'sqlmentor.ydqmecv.mongodb.net';
const DB_NAME = 'experiment';

function buildMongoUri() {
  // Prefer env var if provided, otherwise construct from config defaults
  const fromEnv = process.env.MONGODB_URI || config.mongoUri;
  if (fromEnv) return fromEnv;
  const username = process.env.dbUserName || config.dbUserName;
  const password = process.env.dbPassword || config.dbPassword;
  return `mongodb+srv://${username}:${password}@${CLUSTER}/?retryWrites=true&w=majority&appName=${APP_NAME}`;
}

async function clearPractice() {
  const uri = buildMongoUri();
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    },
    maxPoolSize: 1
  });
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    console.log('🧹 Clearing practice queries...');
    const result = await db.collection('practiceQueries').deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} practice queries`);
    
    console.log('🧹 Clearing practice tables...');
    const tableResult = await db.collection('practiceTables').deleteMany({});
    console.log(`✅ Deleted ${tableResult.deletedCount} practice tables`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

clearPractice();
