// Simple test to verify setup is working
describe('Test Setup Verification', () => {
  test('should have test database available', () => {
    expect(global.testDb).toBeDefined();
    expect(global.testConnection).toBeDefined();
    expect(global.mongod).toBeDefined();
  });

  test('should be able to create and query collections', async () => {
    // Insert a test document
    const result = await global.testDb.collection('test').insertOne({ name: 'test' });
    expect(result.insertedId).toBeDefined();

    // Query it back
    const doc = await global.testDb.collection('test').findOne({ name: 'test' });
    expect(doc).toBeDefined();
    expect(doc.name).toBe('test');
  });

  test('should have environment variables set', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.ASSISTANT_ID).toBe('test-assistant-id');
    expect(process.env.MONGODB_URI).toBeDefined();
  });
});
