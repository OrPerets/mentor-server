# Testing Guide - Backend (Node.js/Express + MongoDB)

This guide covers the comprehensive testing setup for the mentor-server backend application.

## 🧪 Testing Stack

- **Jest** - Testing framework
- **Supertest** - HTTP integration testing
- **MongoDB Memory Server** - In-memory MongoDB for testing
- **GitHub Actions** - CI/CD pipeline

## 📁 Test Structure

```
tests/
├── setup.js                 # Global test configuration
├── helpers/
│   └── testUtils.js         # Test utilities and helpers
├── unit/
│   ├── db.test.js          # Database function tests
│   ├── utils.test.js       # Utility function tests
│   └── models.test.js      # Data model tests
└── integration/
    ├── api.test.js         # API endpoint tests
    ├── auth.test.js        # Authentication tests
    └── exam.test.js        # Exam system tests
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### 3. Environment Setup

Create a `.env.test` file:

```env
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/test-database
ASSISTANT_ID=test-assistant-id
OPENAI_API_KEY=test-openai-key
DISABLE_EXTERNAL_APIS=true
MOCK_OPENAI=true
```

## 📝 Writing Tests

### Unit Tests Example

```javascript
const DB = require('../../api/db');

describe('Database Functions', () => {
  beforeEach(async () => {
    // Seed test data
    await global.testDb.collection('users').insertMany([
      { email: 'test@example.com', password: 'password123' }
    ]);
  });

  test('should get all users', async () => {
    DB.getDatabase = jest.fn().mockResolvedValue(global.testDb);
    
    const users = await DB.getAllUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toHaveProperty('email');
  });
});
```

### Integration Tests Example

```javascript
const request = require('supertest');
const app = require('../../api/index');

describe('API Endpoints', () => {
  test('GET /allUsers should return all users', async () => {
    const response = await request(app)
      .get('/allUsers')
      .expect(200);
      
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

## 🔧 Test Utilities

### TestUtils Class

The `TestUtils` class provides helpful methods:

- `createTestUser(db, userData)` - Create test users
- `createTestQuestions(db, count)` - Create test questions
- `createTestExamSession(db, sessionData)` - Create exam sessions
- `cleanupTestData(db)` - Clean up test data
- `mockRequest(overrides)` - Mock Express request
- `mockResponse()` - Mock Express response

### Usage Example

```javascript
const TestUtils = require('../helpers/testUtils');

describe('User Management', () => {
  test('should create and retrieve user', async () => {
    const user = await TestUtils.createTestUser(global.testDb, {
      email: 'newuser@test.com'
    });
    
    expect(user).toHaveProperty('_id');
    expect(user.email).toBe('newuser@test.com');
  });
});
```

## 🎯 Testing Best Practices

### 1. Test Isolation
- Each test should be independent
- Clean up data between tests
- Use fresh database state

### 2. Mock External Dependencies
- Mock OpenAI API calls
- Mock email services
- Mock file system operations

### 3. Test Coverage
- Aim for >80% code coverage
- Cover happy paths and error cases
- Test edge cases and boundary conditions

### 4. Descriptive Test Names
```javascript
// Good ✅
test('should return 401 when user provides invalid credentials')

// Bad ❌
test('login test')
```

### 5. Arrange-Act-Assert Pattern
```javascript
test('should award points for correct answer', async () => {
  // Arrange
  const userId = 'testuser123';
  const exerciseId = 1;
  DB.getQuestion = jest.fn().mockResolvedValue({ points: 10 });
  
  // Act
  const result = await submitAnswer(userId, exerciseId, 'correct answer');
  
  // Assert
  expect(result.pointsAwarded).toBe(10);
});
```

## 🚀 CI/CD Integration

### GitHub Actions

The `.github/workflows/test.yml` file runs:

1. **Linting** - Code style checks
2. **Unit Tests** - Individual function tests
3. **Integration Tests** - API endpoint tests
4. **Coverage Reports** - Code coverage analysis
5. **Security Audit** - Dependency vulnerability checks

### Environment Variables for CI

Set these secrets in your GitHub repository:

- `ASSISTANT_ID` - OpenAI Assistant ID
- `OPENAI_API_KEY` - OpenAI API key (or test key)

## 📊 Coverage Reports

Coverage reports are generated in:
- `coverage/lcov-report/index.html` - HTML report
- `coverage/lcov.info` - LCOV format for CI

View coverage:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## 🐛 Debugging Tests

### VS Code Configuration

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Debug Specific Test

```bash
# Run specific test file
npm test -- tests/unit/db.test.js

# Run specific test case
npm test -- --testNamePattern="should get all users"

# Run with verbose output
npm test -- --verbose
```

## 🔍 Common Issues

### MongoDB Connection Issues
- Ensure MongoDB Memory Server is properly configured
- Check if ports are available
- Verify test database cleanup

### Async Test Issues
- Use `await` for all async operations
- Set appropriate timeouts
- Handle promise rejections

### Mock Issues
- Clear mocks between tests
- Verify mock implementations
- Use `jest.resetAllMocks()` in `afterEach`

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
