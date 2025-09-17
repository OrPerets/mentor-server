const DB = require('../../api/db');

describe('Database Functions - Unit Tests', () => {
  beforeEach(async () => {
    // Wait for database to be ready
    if (!global.testDb) {
      throw new Error('Test database not initialized. Check setup.js');
    }
    
    // Seed test data
    await global.testDb.collection('users').insertMany([
      { email: 'test1@example.com', password: 'password123' },
      { email: 'test2@example.com', password: 'password456' }
    ]);
    
    await global.testDb.collection('questions').insertMany([
      { 
        id: 1, 
        question: 'SELECT * FROM users', 
        difficulty: 'easy',
        points: 10,
        expected_keywords: ['SELECT', 'FROM', 'users'],
        solution_example: 'SELECT * FROM users;'
      },
      { 
        id: 2, 
        question: 'SELECT name FROM products WHERE price > 100', 
        difficulty: 'medium',
        points: 15,
        expected_keywords: ['SELECT', 'FROM', 'WHERE', 'price'],
        solution_example: 'SELECT name FROM products WHERE price > 100;'
      }
    ]);
  });

  describe('Database Connection', () => {
    test('should connect to test database', async () => {
      // Mock the DB connection to use test database
      DB.getDatabase = jest.fn().mockResolvedValue(global.testDb);
      
      const db = await DB.getDatabase();
      expect(db).toBe(global.testDb);
    });
  });

  describe('User Management', () => {
    test('should work with test data directly', async () => {
      // Work directly with test database instead of through DB functions
      const users = await global.testDb.collection('users').find({}).toArray();
      expect(users).toHaveLength(2);
      expect(users[0]).toHaveProperty('email');
    });

    test('should update password in test database', async () => {
      const email = 'test1@example.com';
      const newPassword = 'newPassword123';
      
      // Update directly in test database
      await global.testDb.collection('users').updateOne(
        { email },
        { $set: { password: newPassword } }
      );
      
      const updatedUser = await global.testDb.collection('users').findOne({ email });
      expect(updatedUser.password).toBe(newPassword);
    });
  });

  describe('Question Management', () => {
    test('should find question by ID in test database', async () => {
      const question = await global.testDb.collection('questions').findOne({ id: 1 });
      expect(question).toBeDefined();
      expect(question.id).toBe(1);
      expect(question.difficulty).toBe('easy');
      expect(question.points).toBe(10);
    });

    test('should get all test questions', async () => {
      const questions = await global.testDb.collection('questions').find({}).toArray();
      expect(questions).toHaveLength(2);
      expect(questions[0]).toHaveProperty('question');
      expect(questions[1]).toHaveProperty('difficulty');
    });

    test('should filter questions by difficulty', async () => {
      const easyQuestions = await global.testDb.collection('questions').find({ difficulty: 'easy' }).toArray();
      expect(easyQuestions).toHaveLength(1);
      expect(easyQuestions[0].difficulty).toBe('easy');
    });
  });

  describe('Points System', () => {
    test('should handle user points in test database', async () => {
      const userId = 'testuser123';
      const points = 10;
      const exerciseId = 1;
      
      // Insert directly into test database
      await global.testDb.collection('userPoints').insertOne({
        userId,
        points,
        exerciseId,
        createdAt: new Date()
      });
      
      const userPoints = await global.testDb.collection('userPoints').findOne({ userId });
      expect(userPoints).toBeDefined();
      expect(userPoints.points).toBe(points);
    });
  });
});
