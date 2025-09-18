const OpenAI = require("openai");
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const DB = require ('./db');
const Streamer = require('ai');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

const port = 5555;

let assistant_id;
// Create an Assistant
async function createAssistant() {
  assistant_id =  process.env.ASSISTANT_ID || 'asst_9bDfXIUHAqyYGa6SZgzBjE87';
  console.log(`Assistant ID: ${assistant_id}`);
}

createAssistant()

app.post("/feedback", (req, res) => {
  const threadId = req.body.threadId;
  const username = req.body.username;
  const isLike = req.body.isLike;
  const message = req.body.message;
  const userText = req.body.userText;
  DB.addItem({
    "threadId": threadId,
    "username": username,
    "isLike": isLike,
    "message": message,
    "userText": userText,
    "time": new Date()
  }).then(response => res.send({ "status": response}))
})

app.post("/save", (req, res) => {
  const { threadId, userId, message, role } = req.body;
  DB.addItem({
    threadId,
    userId,
    message,
    role,
    time: new Date()
  }).then(response => res.send({ "status": response}))
})

app.get("/", async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.send("up.")
})

app.get("/allUsers", (req, res) => {
  DB.getAllUsers().then(users => res.send(users))
});

app.post("/updatePassword", (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )
  let email = req.body.email;
  let password = req.body.password;
  
  // Convert single email to array format expected by DB function
  DB.updatePassword([email], password)
    .then(() => {
      res.sendStatus(200);
    })
    .catch((error) => {
      console.error('Error updating password:', error);
      res.status(500).json({ error: 'Failed to update password' });
    });
})

app.post("/updatePasswordToMany", (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )
  let emails = req.body.emails;
  DB.updatePassword(emails, "shenkar").then(res.sendStatus(200))
})

// Get all chat sessions for a user
app.get("/chat-sessions/:uid", (req, res) => {
  const userId = req.params.uid; 
  DB.getChatSessions(userId).then(sessions => res.json(sessions));
});

// Create a new chat session
app.post("/chat-sessions", (req, res) => {
  const userId = req.body.user;
  const title = req.body.title;
  DB.createChatSession(userId, title).then(session => res.json(session));
});

// Get messages for a specific chat session
app.get("/chat-sessions/:chatId/messages", (req, res) => {
  const chatId = req.params.chatId;
  DB.getChatMessages(chatId).then(messages => res.json(messages));
});

// Save a message to a chat session
app.post("/chat-sessions/:chatId/messages", (req, res) => {
  const chatId = req.body.chatId;
  const role = req.body.role;
  const text = req.body.message;
  DB.saveChatMessage(chatId, role, text).then(message => res.json(message));
});

// Save a message to a chat session
app.post("/saveUserForm", (req, res) => {
  DB.saveUserForm(req.body).then(message => res.json(message));
});


app.post("/saveFeedback", (req, res) => {
  DB.saveFeedback(req.body).then(response => res.send(response))
})

app.get("/coinsBalance/:email", (req, res) => {
  const email = req.params.email;
  DB.getCoinsBalance(email).then(response => res.send(response))
})

app.get("/getAllCoins", (req, res) => {
  DB.getAllCoins().then(response => res.send(response))
})

app.post("/updateBalance", (req, res) => {
  const email = req.body.email;
  const currentBalance = req.body.currentBalance;
  DB.setCoinsBalance(email, currentBalance).then(response => res.send(response))
})

app.get("/getStatus", (req, res) => {
  DB.getStatus().then(response => res.send(response))
})

app.post("/setStatus", (req, res) => {
  DB.setStatus(req.body.newStatus).then(response => res.send(response))
})

app.get("/getCoinsStatus", (req, res) => {
  DB.getCoinsStatus().then(response => res.send(response))
})

app.post("/setCoinsStatus", (req, res) => {
  DB.setCoinsStatus(req.body.newStatus).then(response => res.send(response))
})

app.post("/admin/changeBalance", (req, res) => {
  var users = req.body.users;
  var type = req.body.type;
  var amount = req.body.amount;
  if (type === "reduce_balance") {
    amount = -amount;
  }
  DB.updateCoinsBalance(users, amount).then(response => res.send(response));
})

// Exercise-related routes
app.get("/getRandomExercise/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const availableExercises = await DB.getAvailableExercises(userId);
    if (availableExercises.length === 0) {
      // If no exercises available, return a random one from all exercises
      const allQuestions = await DB.getAllQuestions();
      const randomExercise = allQuestions[Math.floor(Math.random() * allQuestions.length)];
      return res.json(randomExercise);
    }
    
    const randomExercise = availableExercises[Math.floor(Math.random() * availableExercises.length)];
    res.json(randomExercise);
  } catch (error) {
    console.error('Error getting random exercise:', error);
    res.status(500).json({ error: 'Failed to get exercise' });
  }
});

// NOTE: Exam-related routes have been removed as part of Sprint 0 teardown.
// The Full Homework Exercise module will be rebuilt in future sprints.
// Practice functionality remains intact below.

// Practice-related endpoints
app.get("/practice/tables", async (req, res) => {
  try {
    const db = await DB.getDatabase();
    const practiceTables = await db.collection("practiceTables").find({}).toArray();
    
    // Group tables by practiceId
    const groupedTables = practiceTables.reduce((acc, table) => {
      if (!acc[table.practiceId]) {
        acc[table.practiceId] = [];
      }
      acc[table.practiceId].push({
        id: table._id.toString(),
        table: table.table,
        columns: table.columns,
        constraints: table.constraints,
        fullSql: table.fullSql
      });
      return acc;
    }, {});
    
    res.json(groupedTables);
  } catch (error) {
    console.error('Error fetching practice tables:', error);
    res.status(500).json({ error: 'Failed to fetch practice tables' });
  }
});

app.get("/practice/queries/:practiceId", async (req, res) => {
  try {
    const { practiceId } = req.params;
    const db = await DB.getDatabase();
    
    // Get queries for the selected practice tables
    const queries = await db.collection("practiceQueries")
      .find({ practiceId })
      .toArray();
    
    // Randomly select 2-3 queries for practice
    const shuffledQueries = queries.sort(() => 0.5 - Math.random());
    const selectedQueries = shuffledQueries.slice(0, Math.min(3, queries.length));
    
    // Convert ObjectIds to strings for frontend
    const queriesWithStringIds = selectedQueries.map(query => ({
      ...query,
      _id: query._id.toString()
    }));
    
    res.json(queriesWithStringIds);
  } catch (error) {
    console.error('Error fetching practice queries:', error);
    res.status(500).json({ error: 'Failed to fetch practice queries' });
  }
});

// Test endpoint to check database connection
app.get("/test-db", async (req, res) => {
  try {
    const db = await DB.getDatabase();
    const count = await db.collection("practiceQueries").countDocuments();
    res.json({ 
      message: "Database connection successful", 
      practiceQueriesCount: count,
      database: db.databaseName
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/practice/submit", async (req, res) => {
  try {
    const { userId, queryId, answer, question } = req.body;
    console.log('Practice submit request:', { userId, queryId, answer, question });
    
    // Improved answer validation - normalize and compare
    const normalizeAnswer = (sql) => {
      return sql.toLowerCase()
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/['"]/g, "'") // Normalize quotes (both single and double to single)
        .replace(/;/g, '')     // Remove semicolons
        .replace(/\s*,\s*/g, ', ') // Normalize comma spacing
        .replace(/\s*=\s*/g, ' = ') // Normalize equals spacing
        .replace(/\s*>\s*/g, ' > ') // Normalize greater than spacing
        .replace(/\s*<\s*/g, ' < ') // Normalize less than spacing
        .replace(/\s*!=\s*/g, ' != ') // Normalize not equals spacing
        .replace(/\s*<=\s*/g, ' <= ') // Normalize less than or equal spacing
        .replace(/\s*>=\s*/g, ' >= ') // Normalize greater than or equal spacing
        .replace(/\s*like\s*/gi, ' like ') // Normalize LIKE spacing
        .replace(/\s*is\s+not\s+null\s*/gi, ' is not null ') // Normalize IS NOT NULL
        .replace(/\s*is\s+null\s*/gi, ' is null ') // Normalize IS NULL
        .replace(/\s*order\s+by\s*/gi, ' order by ') // Normalize ORDER BY
        .replace(/\s*group\s+by\s*/gi, ' group by ') // Normalize GROUP BY
        .trim();
    };
    
    const db = await DB.getDatabase();
    const { ObjectId } = require('mongodb');
    
    // Convert string queryId to ObjectId
    let objectId;
    try {
      objectId = new ObjectId(queryId);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid query ID format' });
    }
    
    console.log('Looking for query with ObjectId:', objectId);
    let query = await db.collection("practiceQueries").findOne({ _id: objectId });
    console.log('Query found with ObjectId:', query ? 'Yes' : 'No');
    
    if (!query) {
      console.log('Trying with string queryId:', queryId);
      query = await db.collection("practiceQueries").findOne({ _id: queryId });
      console.log('Query found with string:', query ? 'Yes' : 'No');
    }
    
    if (!query) {
      console.log('Query not found in database');
      return res.status(404).json({ error: 'Query not found' });
    }
    
    const normalizedUserAnswer = normalizeAnswer(answer);
    const normalizedCorrectAnswer = normalizeAnswer(query.answerSql);
    
    const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
    
    // Enhanced feedback analysis
    const analyzeSQL = (sql) => {
      const normalized = normalizeAnswer(sql);
      const parts = {
        select: normalized.includes('select') ? normalized.match(/select\s+(.+?)(?=\s+from|\s+where|\s+order|\s+group|\s+having|$)/i)?.[1]?.trim() : null,
        from: normalized.includes('from') ? normalized.match(/from\s+(.+?)(?=\s+where|\s+order|\s+group|\s+having|$)/i)?.[1]?.trim() : null,
        where: normalized.includes('where') ? normalized.match(/where\s+(.+?)(?=\s+order|\s+group|\s+having|$)/i)?.[1]?.trim() : null,
        orderBy: normalized.includes('order by') ? normalized.match(/order by\s+(.+?)(?=\s+group|\s+having|$)/i)?.[1]?.trim() : null,
        groupBy: normalized.includes('group by') ? normalized.match(/group by\s+(.+?)(?=\s+having|$)/i)?.[1]?.trim() : null,
        having: normalized.includes('having') ? normalized.match(/having\s+(.+?)$/i)?.[1]?.trim() : null
      };
      return parts;
    };

    const calculateSimilarity = (sql1, sql2) => {
      const parts1 = analyzeSQL(sql1);
      const parts2 = analyzeSQL(sql2);
      
      let score = 0;
      let totalParts = 0;
      
      Object.keys(parts1).forEach(key => {
        if (parts1[key] && parts2[key]) {
          totalParts++;
          if (parts1[key] === parts2[key]) {
            score += 1;
          } else if (parts1[key] && parts2[key] && 
                     (parts1[key].includes(parts2[key]) || parts2[key].includes(parts1[key]))) {
            score += 0.5; // Partial match
          }
        }
      });
      
      return totalParts > 0 ? score / totalParts : 0;
    };
    
    const similarity = calculateSimilarity(answer, query.answerSql);
    
    // Determine feedback level and message
    let feedbackLevel = 'wrong';
    let feedbackMessage = '';
    let showCorrectAnswer = false;
    
    if (isCorrect) {
      feedbackLevel = 'correct';
      feedbackMessage = 'מצוין! תשובה נכונה לחלוטין! 🎉';
    } else if (similarity >= 0.7) {
      feedbackLevel = 'partially_correct';
      feedbackMessage = 'כמעט נכון! יש לך את הרעיון הנכון, אבל יש כמה דברים שצריך לתקן.';
      showCorrectAnswer = true;
    } else if (similarity >= 0.4) {
      feedbackLevel = 'partially_correct';
      feedbackMessage = 'יש לך חלק מהרעיון נכון, אבל יש מקום לשיפור.';
      showCorrectAnswer = true;
    } else {
      feedbackLevel = 'wrong';
      feedbackMessage = 'התשובה לא נכונה. כדאי לבדוק את המבנה של השאילתה.';
      showCorrectAnswer = true;
    }
    
    // Generate detailed feedback based on analysis
    const userParts = analyzeSQL(answer);
    const correctParts = analyzeSQL(query.answerSql);
    
    let detailedFeedback = '';
    if (!isCorrect) {
      const issues = [];
      
      if (!userParts.select && correctParts.select) {
        issues.push('חסר SELECT או שהוא לא נכון');
      }
      if (!userParts.from && correctParts.from) {
        issues.push('חסר FROM או שם הטבלה לא נכון');
      }
      if (correctParts.where && !userParts.where) {
        issues.push('חסר תנאי WHERE');
      }
      if (correctParts.orderBy && !userParts.orderBy) {
        issues.push('חסר ORDER BY');
      }
      if (correctParts.groupBy && !userParts.groupBy) {
        issues.push('חסר GROUP BY');
      }
      
      if (issues.length > 0) {
        detailedFeedback = `בעיות שזוהו: ${issues.join(', ')}.`;
      }
    }
    
    // Save practice attempt with enhanced data
    await db.collection("practiceAttempts").insertOne({
      userId,
      queryId: objectId,
      question: query.question,
      userAnswer: answer,
      correctAnswer: query.answerSql,
      isCorrect,
      feedbackLevel,
      similarity,
      timestamp: new Date()
    });
    
    res.json({
      correct: isCorrect,
      feedbackLevel,
      feedback: feedbackMessage,
      detailedFeedback,
      correctAnswer: showCorrectAnswer ? query.answerSql : null,
      similarity: Math.round(similarity * 100)
    });
  } catch (error) {
    console.error('Error submitting practice answer:', error);
    res.status(500).json({ error: 'Failed to submit practice answer' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 Server URL: http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('  GET  / - Health check');
  console.log('  GET  /test-db - Database connection test');
  console.log('  GET  /practice/tables - Get practice tables');
  console.log('  POST /practice/submit - Submit practice answer');
  console.log('  GET  /allUsers - Get all users');
  console.log('  POST /feedback - Submit feedback');
});