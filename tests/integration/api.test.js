const request = require('supertest');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const DB = require('../../api/db');

// Create a test app without starting the server
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Add basic routes for testing
  app.get('/', (req, res) => {
    res.send('up.');
  });

  app.get('/allUsers', (req, res) => {
    DB.getAllUsers().then(users => res.send(users)).catch(err => res.status(500).send(err));
  });

  app.post('/updatePassword', (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    
    DB.updatePassword([email], password)
      .then(() => res.sendStatus(200))
      .catch((error) => res.status(500).json({ error: 'Failed to update password' }));
  });

  app.post('/feedback', (req, res) => {
    const { threadId, username, isLike, message, userText } = req.body;
    DB.addItem({
      threadId, username, isLike, message, userText,
      time: new Date()
    }).then(response => res.send({ status: response }))
    .catch(err => res.status(500).send(err));
  });

  return app;
};

describe('API Integration Tests', () => {
  let app;

  beforeEach(async () => {
    // Wait for database to be ready
    if (!global.testDb) {
      throw new Error('Test database not initialized. Check setup.js');
    }
    
    // Create fresh app for each test
    app = createTestApp();
    
    // Mock DB functions to use test database
    DB.getDatabase = jest.fn().mockResolvedValue(global.testDb);
    
    // Seed test data
    await global.testDb.collection('users').insertMany([
      { email: 'student@test.com', password: 'password123' },
      { email: 'admin@test.com', password: 'admin123' }
    ]);
    
    await global.testDb.collection('questions').insertMany([
      { 
        id: 1, 
        question: 'SELECT * FROM users', 
        difficulty: 'easy',
        points: 10,
        expected_keywords: ['SELECT', 'FROM', 'users'],
        solution_example: 'SELECT * FROM users;'
      }
    ]);
  });

  describe('Health Check', () => {
    test('GET / should return server status', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
        
      expect(response.text).toBe('up.');
    });
  });

  describe('User Management', () => {
    test('GET /allUsers should return all users', async () => {
      // Mock the DB function
      DB.getAllUsers = jest.fn().mockResolvedValue([
        { email: 'student@test.com', password: 'password123' },
        { email: 'admin@test.com', password: 'admin123' }
      ]);
      
      const response = await request(app)
        .get('/allUsers')
        .expect(200);
        
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    test('POST /updatePassword should update user password', async () => {
      DB.updatePassword = jest.fn().mockResolvedValue(true);
      
      const response = await request(app)
        .post('/updatePassword')
        .send({
          email: 'student@test.com',
          password: 'newPassword123'
        })
        .expect(200);
        
      expect(DB.updatePassword).toHaveBeenCalledWith(['student@test.com'], 'newPassword123');
    });
  });

  describe('Feedback System', () => {
    test('POST /feedback should save user feedback', async () => {
      const feedbackData = {
        threadId: 'thread123',
        username: 'testuser',
        isLike: true,
        message: 'Great response!',
        userText: 'What is SQL?'
      };
      
      DB.addItem = jest.fn().mockResolvedValue('success');
      
      const response = await request(app)
        .post('/feedback')
        .send(feedbackData)
        .expect(200);
        
      expect(response.body).toHaveProperty('status', 'success');
      expect(DB.addItem).toHaveBeenCalledWith(expect.objectContaining({
        threadId: 'thread123',
        username: 'testuser',
        isLike: true
      }));
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors gracefully', async () => {
      DB.getAllUsers = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      
      const response = await request(app)
        .get('/allUsers')
        .expect(500);
        
      // The actual error handling depends on your implementation
      // This test ensures the server doesn't crash
    });
  });
});
