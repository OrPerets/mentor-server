const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

let mongod;
let connection;
let db;

// Global test setup
beforeAll(async () => {
  try {
    // Start in-memory MongoDB instance
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    // Connect without deprecated options
    connection = await MongoClient.connect(uri);
    db = connection.db();
    
    // Set environment variables for tests
    process.env.MONGODB_URI = uri;
    process.env.NODE_ENV = 'test';
    process.env.ASSISTANT_ID = 'test-assistant-id';
    
    // Make db available globally for tests
    global.testDb = db;
    global.testConnection = connection;
    global.mongod = mongod;
    
    console.log('Test database setup completed');
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}, 30000); // 30 second timeout for setup

// Global test teardown
afterAll(async () => {
  try {
    if (connection) {
      await connection.close();
    }
    if (mongod) {
      await mongod.stop();
    }
    console.log('Test database teardown completed');
  } catch (error) {
    console.error('Error during test teardown:', error);
  }
}, 30000);

// Clean up between tests
afterEach(async () => {
  if (global.testDb) {
    try {
      const collections = await global.testDb.listCollections().toArray();
      for (const collection of collections) {
        await global.testDb.collection(collection.name).deleteMany({});
      }
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  }
});
