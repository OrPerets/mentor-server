const OpenAI = require("openai");
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const DB = require ('./db');
const Streamer = require('ai');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const port = 5555;

let assistant_id;
// Create an Assistant
async function createAssistant() {
  assistant_id =  process.env.ASSISTANT_ID;
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
  DB.updatePassword(email, password).then(res.sendStatus(200))
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

// Exam-related routes
app.post("/exam/start", async (req, res) => {
  try {
    const { studentEmail, examTitle, studentId, studentName, browserFingerprint, randomizationConfig } = req.body;
    
    // TODO: Use randomizationConfig for future enhancements
    // The frontend sends detailed randomization configuration including:
    // - totalQuestions, structure, preventDuplicates, difficultyDistribution
    // Current implementation uses fixed structure but could be enhanced to use this config
    if (randomizationConfig) {
      console.log(`Received randomization config for exam:`, randomizationConfig);
    }
    
    // Get client IP address
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    console.log(`Exam start attempt - Student: ${studentId}, IP: ${clientIp}`);

    // Check if student has already completed an exam (one-time restriction)
    const hasCompletedExam = await DB.hasStudentCompletedExam(studentId);
    if (hasCompletedExam) {
      console.log(`Access denied for student ${studentId}: Already completed exam`);
      return res.status(403).json({ 
        error: 'ניתן להיבחן פעם אחת בלבד',
        message: 'ניתן להיבחן פעם אחת בלבד'
      });
    }

    // Check if student already has an active session
    const activeSession = await DB.getActiveExamSession(studentId);
    if (activeSession) {
      console.log(`Access denied for student ${studentId}: Active session exists`);
      return res.status(403).json({ 
        error: 'יש לך בחינה פעילה',
        message: 'יש לך בחינה פעילה. אנא פנה למנהל הבחינה.',
        existingSession: {
          examId: activeSession._id,
          startTime: activeSession.startTime
        }
      });
    }

    // Create new session
    const session = await DB.createExamSession(studentEmail, examTitle, studentId, studentName, clientIp, browserFingerprint);
    console.log(`New exam session created for student ${studentId}: ${session.examId}`);
    res.json(session);
    
  } catch (error) {
    console.error('Error starting exam:', error);
    res.status(500).json({ error: 'Failed to start exam' });
  }
});

app.get("/exam/:examId", (req, res) => {
  const examId = req.params.examId;
  DB.getExamSession(examId)
    .then(session => {
      if (!session) {
        return res.status(404).json({ error: 'Exam not found' });
      }
      res.json(session);
    })
    .catch(error => {
      console.error('Error getting exam session:', error);
      res.status(500).json({ error: 'Failed to get exam session' });
    });
});

app.get("/exam/:examId/question/:questionIndex", async (req, res) => {
  try {
    const { examId, questionIndex } = req.params;
    const { studentId, browserFingerprint } = req.query;
    const currentIndex = parseInt(questionIndex);
    
    // Get client IP address
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    // Get session and validate access
    const [session, answers] = await Promise.all([
      DB.getExamSession(examId),
      DB.getExamAnswers(examId)
    ]);
    
    if (!session) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Validate access for ongoing session
    // DISABLED: Always allow access, skip security validation
    // if (studentId && browserFingerprint) {
    //   const validationResult = await DB.validateExamAccess(studentId, clientIp, JSON.parse(browserFingerprint));
    //   if (!validationResult.allowed) {
    //     console.log(`Access denied during exam for student ${studentId}: ${validationResult.reason}`);
    //     return res.status(403).json({ 
    //       error: 'הגישה נחסמה',
    //       reason: validationResult.reason,
    //       message: validationResult.reason === 'ip_mismatch' 
    //         ? 'זוהה שינוי במיקום. פנה למנהל הבחינה.'
    //         : 'זוהה ניסיון גישה לא חוקי. פנה למנהל הבחינה.'
    //     });
    //   }
    // }
    
    if (currentIndex >= session.totalQuestions) {
      return res.status(400).json({ error: 'Question index out of range' });
    }

    // New exam structure: 1st question easy, questions 2-12 shuffled, 13th question algebra
    let difficulty = 'easy';
    
    if (currentIndex === 0) {
      // First question is always easy
      difficulty = 'easy';
    } else if (currentIndex === 12) {
      // 13th question (index 12) is always algebra
      difficulty = 'algebra';
    } else {
      // Questions 2-12 (indices 1-11) are shuffled: 5 easy, 3 medium, 3 hard
      // Create shuffled pattern for middle questions
      const middleQuestions = [
        ...Array(5).fill('easy'),
        ...Array(3).fill('medium'),
        ...Array(3).fill('hard')
      ];
      
      // Use exam ID as seed for consistent shuffling per exam
      const examSeed = examId.toString();
      let hash = 0;
      for (let i = 0; i < examSeed.length; i++) {
        hash = ((hash << 5) - hash) + examSeed.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
      }
      
      // Fisher-Yates shuffle with seeded random
      const shuffled = [...middleQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        hash = (hash * 9301 + 49297) % 233280; // Linear congruential generator
        const j = Math.floor((hash / 233280) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      // Map current index (1-11) to shuffled array (0-10)
      difficulty = shuffled[currentIndex - 1];
    }

    // Get question based on fixed difficulty, preventing duplicates
    const question = await DB.getNextExamQuestion(difficulty, examId, currentIndex);
    res.json({
      question,
      questionIndex: currentIndex,
      totalQuestions: session.totalQuestions,
      difficulty
    });
    
  } catch (error) {
    console.error('Error in exam question route:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.post("/exam/:examId/answer", (req, res) => {
  const examId = req.params.examId;
  const { questionIndex, questionId, questionText, difficulty, studentAnswer, correctAnswer, isCorrect, timeSpent, startTime, endTime, typingSpeed, typingEvents } = req.body;
  
  const answerData = {
    questionId,
    questionText,
    difficulty,
    studentAnswer,
    correctAnswer,
    isCorrect,
    timeSpent,
    typingSpeed: typingSpeed || 0,
    typingEvents: typingEvents || [],
    startTime: new Date(startTime),
    endTime: new Date(endTime)
  };

  DB.saveExamAnswer(examId, questionIndex, answerData)
    .then(answer => res.json(answer))
    .catch(error => {
      console.error('Error saving exam answer:', error);
      res.status(500).json({ error: 'Failed to save answer' });
    });
});

// New auto-save endpoint
app.post("/exam/:examId/auto-save", (req, res) => {
  const examId = req.params.examId;
  const { questionIndex, questionId, questionText, difficulty, studentAnswer, timeSpent, startTime, endTime, typingSpeed, typingEvents, isAutoSave } = req.body;
  
  const answerData = {
    questionId,
    questionText,
    difficulty,
    studentAnswer,
    correctAnswer: '', // Not evaluated in auto-save
    isCorrect: false, // Not evaluated in auto-save
    timeSpent,
    typingSpeed: typingSpeed || 0,
    typingEvents: typingEvents || [],
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    isAutoSave: true
  };

  DB.saveExamAnswer(examId, questionIndex, answerData)
    .then(answer => res.json({ success: true, message: 'Auto-saved successfully' }))
    .catch(error => {
      console.error('Error auto-saving exam answer:', error);
      res.status(500).json({ error: 'Failed to auto-save answer' });
    });
});

app.post("/exam/:examId/complete", (req, res) => {
  const examId = req.params.examId;
  const { finalScore } = req.body;
  
  DB.completeExamSession(examId, finalScore)
    .then(result => res.json({ success: true, result }))
    .catch(error => {
      console.error('Error completing exam:', error);
      res.status(500).json({ error: 'Failed to complete exam' });
    });
});

app.get("/exam/:examId/results", (req, res) => {
  const examId = req.params.examId;
  
  Promise.all([
    DB.getExamSession(examId),
    DB.getExamAnswers(examId),
    DB.getExamStatistics(examId)
  ]).then(([session, answers, stats]) => {
    if (!session) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    
    res.json({
      session,
      answers,
      statistics: stats
    });
  }).catch(error => {
    console.error('Error getting exam results:', error);
    res.status(500).json({ error: 'Failed to get exam results' });
  });
});

// Exam grading endpoints
app.get("/admin/exam-sessions", (req, res) => {
  DB.getAllExamSessions()
    .then(sessions => {
      res.json(sessions);
    })
    .catch(error => {
      console.error('Error getting exam sessions:', error);
      res.status(500).json({ error: 'Failed to get exam sessions' });
    });
});

app.get("/admin/exam/:examId/for-grading", (req, res) => {
  const examId = req.params.examId;
  
  DB.getExamForGrading(examId)
    .then(examData => {
      if (!examData) {
        return res.status(404).json({ error: 'Exam not found' });
      }
      res.json(examData);
    })
    .catch(error => {
      console.error('Error getting exam for grading:', error);
      res.status(500).json({ error: 'Failed to get exam for grading' });
    });
});

app.post("/admin/exam/:examId/grade", (req, res) => {
  const examId = req.params.examId;
  const gradeData = req.body;
  
  DB.saveExamGrade(examId, gradeData)
    .then(result => {
      res.json(result);
    })
    .catch(error => {
      console.error('Error saving exam grade:', error);
      res.status(500).json({ error: 'Failed to save exam grade' });
    });
});

app.get("/admin/exam/:examId/grade", (req, res) => {
  const examId = req.params.examId;
  
  DB.getExamGrade(examId)
    .then(grade => {
      res.json(grade);
    })
    .catch(error => {
      console.error('Error getting exam grade:', error);
      res.status(500).json({ error: 'Failed to get exam grade' });
    });
});

app.get("/admin/exam-grades", (req, res) => {
  DB.getAllExamGrades()
    .then(grades => {
      res.json(grades);
    })
    .catch(error => {
      console.error('Error getting exam grades:', error);
      res.status(500).json({ error: 'Failed to get exam grades' });
    });
});

app.get("/student/:studentEmail/exam-history", (req, res) => {
  const studentEmail = req.params.studentEmail;
  
  DB.getStudentExamHistory(studentEmail)
    .then(history => res.json(history))
    .catch(error => {
      console.error('Error getting exam history:', error);
      res.status(500).json({ error: 'Failed to get exam history' });
    });
});

// Security validation endpoints
app.post("/exam/validate-access", async (req, res) => {
  try {
    const { studentId, browserFingerprint } = req.body;
    
    // Get client IP address
    const clientIp = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] || 
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const validationResult = await DB.validateExamAccess(studentId, clientIp, browserFingerprint);
    
    if (validationResult.allowed) {
      res.json(validationResult);
    } else {
      res.status(403).json(validationResult);
    }
  } catch (error) {
    console.error('Error validating exam access:', error);
    res.status(500).json({ 
      allowed: false, 
      reason: 'server_error',
      message: 'שגיאת שרת. אנא נסה שוב.'
    });
  }
});

app.get("/exam/check-session/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    const activeSession = await DB.getActiveExamSession(studentId);
    
    if (activeSession) {
      res.json({
        hasActiveSession: true,
        session: {
          examId: activeSession._id,
          startTime: activeSession.startTime,
          currentQuestionIndex: activeSession.currentQuestionIndex,
          totalQuestions: activeSession.totalQuestions,
          studentName: activeSession.studentName
        }
      });
    } else {
      res.json({
        hasActiveSession: false
      });
    }
  } catch (error) {
    console.error('Error checking for active session:', error);
    res.status(500).json({ error: 'Failed to check for active session' });
  }
});

// Check if student has already completed any exam (for one-time restriction)
app.get("/exam/check-completed/:studentId", async (req, res) => {
  try {
    const studentId = req.params.studentId;
    
    const hasCompletedExam = await DB.hasStudentCompletedExam(studentId);
    
    if (hasCompletedExam) {
      res.json({
        hasCompletedExam: true,
        message: "ניתן להיבחן פעם אחת בלבד",
        allowExam: false
      });
    } else {
      res.json({
        hasCompletedExam: false,
        allowExam: true
      });
    }
  } catch (error) {
    console.error('Error checking for completed exam:', error);
    res.status(500).json({ error: 'Failed to check exam status' });
  }
});

app.post("/submitExerciseAnswer", async (req, res) => {
  const { userId, exerciseId, answerText } = req.body;
  
  if (!userId || !exerciseId || !answerText) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const exercise = await DB.getQuestion(exerciseId);
    
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    // Simple keyword validation
    const answerUpper = answerText.toUpperCase();
    const hasAllKeywords = exercise.expected_keywords.every(keyword => 
      answerUpper.includes(keyword.toUpperCase())
    );

    if (hasAllKeywords) {
      // Correct answer - award points
      DB.updateUserPoints(userId, exercise.points, exercise.id).then(() => {
        DB.getUserPoints(userId).then(userPoints => {
          res.json({
            correct: true,
            pointsAwarded: exercise.points,
            totalPoints: userPoints.points,
            feedback: `מצוין! ענית נכון וקיבלת ${exercise.points} נקודות. סה״כ נקודות: ${userPoints.points}`
          });
        });
      });
    } else {
      // Incorrect answer - track failed attempt
      DB.addFailedAttempt(userId, exercise.id).then(() => {
        DB.getFailedAttempts(userId, exercise.id).then(failedAttempts => {
          let feedback = "כמעט! נסה לבדוק אם שכחת משהו בשאילתה.";
          
          if (failedAttempts >= 2) {
            feedback += ` אתה יכול לראות את הפתרון בכפתור "תראה פתרון".`;
          }

          res.json({
            correct: false,
            pointsAwarded: 0,
            failedAttempts: failedAttempts,
            feedback: feedback,
            showSolution: failedAttempts >= 2
          });
        });
      });
    }
  } catch (error) {
    console.error('Error processing exercise answer:', error);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

app.get("/getUserPoints/:userId", (req, res) => {
  const userId = req.params.userId;
  DB.getUserPoints(userId).then(userPoints => {
    res.json(userPoints);
  }).catch(error => {
    console.error('Error getting user points:', error);
    res.status(500).json({ error: 'Failed to get user points' });
  });
});

app.get("/getExerciseSolution/:exerciseId", async (req, res) => {
  const exerciseId = req.params.exerciseId;
  try {
    const exercise = await DB.getQuestion(exerciseId);
    
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    
    res.json({ solution: exercise.solution_example });
  } catch (error) {
    console.error('Error getting exercise solution:', error);
    res.status(500).json({ error: 'Failed to get solution' });
  }
});

// Question management endpoints for admin
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await DB.getAllQuestions();
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

app.post("/api/questions", async (req, res) => {
  try {
    const questionData = req.body;
    const result = await DB.addQuestion(questionData);
    res.json({ success: true, question: result });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

app.get("/api/exercises", async (req, res) => {
  try {
    const questions = await DB.getAllQuestions();
    res.json(questions);
  } catch (error) {
    console.error('Error getting exercises:', error);
    res.status(500).json({ error: 'Failed to get exercises' });
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  const questionId = req.params.id;
  
  try {
    const result = await DB.deleteQuestion(questionId);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

app.delete("/api/exercises/:id", async (req, res) => {
  const questionId = req.params.id;
  
  try {
    const result = await DB.deleteQuestion(questionId);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

app.post("/api/questions/:id/approve", async (req, res) => {
  const questionId = req.params.id;
  const { approvedBy } = req.body;
  console.log('API: Approving question ID:', questionId, 'Type:', typeof questionId, 'Approved by:', approvedBy);
  
  try {
    const result = await DB.approveQuestion(questionId, approvedBy);
    console.log('API: Approval result:', result);
    
    if (result.matchedCount === 0) {
      console.log('API: Question not found for ID:', questionId);
      return res.status(404).json({ error: 'Question not found' });
    }
    
    console.log('API: Question approved successfully');
    res.json({ success: true, message: 'Question approved successfully' });
  } catch (error) {
    console.error('Error approving question:', error);
    res.status(500).json({ error: 'Failed to approve question' });
  }
});

// Update question (difficulty, text, solution) - for questions route
app.patch("/api/questions/:id", async (req, res) => {
  const questionId = req.params.id;
  const updates = req.body;
  
  try {
    const result = await DB.updateQuestion(questionId, updates);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ success: true, message: 'Question updated successfully' });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Get approved questions only - for questions route
app.get("/api/questions/approved", async (req, res) => {
  try {
    const approvedQuestions = await DB.getApprovedQuestions();
    res.json(approvedQuestions);
  } catch (error) {
    console.error('Error getting approved questions:', error);
    res.status(500).json({ error: 'Failed to get approved questions' });
  }
});

app.post("/api/exercises/:id/approve", async (req, res) => {
  const questionId = req.params.id;
  const { approvedBy } = req.body;
  
  try {
    const result = await DB.approveQuestion(questionId, approvedBy);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ success: true, message: 'Question approved successfully' });
  } catch (error) {
    console.error('Error approving question:', error);
    res.status(500).json({ error: 'Failed to approve question' });
  }
});

// Update question (difficulty, text, solution)
app.patch("/api/exercises/:id", async (req, res) => {
  const questionId = req.params.id;
  const updates = req.body;
  
  try {
    const result = await DB.updateQuestion(questionId, updates);
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ success: true, message: 'Question updated successfully' });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ error: 'Failed to update question' });
  }
});

// Get approved questions only
app.get("/api/exercises/approved", async (req, res) => {
  try {
    const approvedQuestions = await DB.getApprovedQuestions();
    res.json(approvedQuestions);
  } catch (error) {
    console.error('Error getting approved questions:', error);
    res.status(500).json({ error: 'Failed to get approved questions' });
  }
});

// Extra time management endpoints
app.post("/admin/uploadExtraTime", async (req, res) => {
  try {
    const { records, uploadedBy, uploadTime } = req.body;
    
    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'No records provided' });
    }

    // Validate records structure
    for (const record of records) {
      if (!record.studentId || typeof record.percentage !== 'number' || record.percentage < 0 || record.percentage > 100) {
        return res.status(400).json({ 
          error: 'Invalid record format',
          details: `Record for student ${record.studentId} has invalid data`
        });
      }
    }

    const result = await DB.uploadExtraTimeRecords(records, uploadedBy);
    
    res.json({
      success: true,
      message: `Successfully processed ${records.length} records`,
      summary: result
    });
  } catch (error) {
    console.error('Error uploading extra time records:', error);
    res.status(500).json({ error: 'Failed to upload extra time records' });
  }
});

app.get("/exam/extraTime/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const extraTimeData = await DB.getExtraTimeForStudent(studentId);
    
    res.json({
      studentId,
      percentage: extraTimeData.percentage || 0,
      hasExtraTime: (extraTimeData.percentage || 0) > 0,
      createdAt: extraTimeData.createdAt
    });
  } catch (error) {
    console.error('Error fetching extra time for student:', error);
    res.status(500).json({ error: 'Failed to fetch extra time data' });
  }
});

app.get("/admin/extraTime", async (req, res) => {
  try {
    const records = await DB.getAllExtraTimeRecords();
    res.json(records);
  } catch (error) {
    console.error('Error fetching all extra time records:', error);
    res.status(500).json({ error: 'Failed to fetch extra time records' });
  }
});

app.delete("/admin/extraTime/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const result = await DB.deleteExtraTimeRecord(studentId);
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Extra time record not found' });
    }
    
    res.json({ success: true, message: 'Extra time record deleted successfully' });
  } catch (error) {
    console.error('Error deleting extra time record:', error);
    res.status(500).json({ error: 'Failed to delete extra time record' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Export the Express API
module.exports = app;