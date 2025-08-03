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
      console.log(`🎯 Question ${currentIndex + 1}: FIXED easy`);
    } else {
      // Questions 2-13 (indices 1-12) are shuffled: 5 easy, 3 medium, 3 hard, 1 algebra
      // Create shuffled pattern for middle questions (12 questions total)
      const middleQuestions = [
        ...Array(5).fill('easy'),
        ...Array(3).fill('medium'),
        ...Array(3).fill('hard'),
        ...Array(1).fill('algebra')
      ];
      
      console.log(`🔄 Original middle questions array:`, middleQuestions);
      
      // Use exam ID as seed for consistent shuffling per exam
      const examSeed = examId.toString();
      let seed = 0;
      for (let i = 0; i < examSeed.length; i++) {
        seed = ((seed << 5) - seed) + examSeed.charCodeAt(i);
        seed = seed & seed; // Convert to 32bit integer
      }
      
      console.log(`🌱 Exam ID: ${examId}, Seed: ${seed}`);
      
      // Simple seeded random number generator
      function seededRandom() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }
      
      // Fisher-Yates shuffle with proper seeded random
      const shuffled = [...middleQuestions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      console.log(`🎲 Shuffled middle questions:`, shuffled);
      
      // Map current index (1-12) to shuffled array (0-11)
      const arrayIndex = currentIndex - 1;
      difficulty = shuffled[arrayIndex];
      console.log(`🎯 Question ${currentIndex + 1} (array index ${arrayIndex}): ${difficulty}`);
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
  const { 
    questionIndex, questionId, questionText, difficulty, studentAnswer, correctAnswer, 
    isCorrect, timeSpent, startTime, endTime, typingSpeed, typingEvents, comprehensiveMetrics 
  } = req.body;
  
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
    comprehensiveMetrics: comprehensiveMetrics || null, // Add comprehensive metrics
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
  const { 
    questionIndex, questionId, questionText, difficulty, studentAnswer, timeSpent, 
    startTime, endTime, typingSpeed, typingEvents, isAutoSave, comprehensiveMetrics 
  } = req.body;
  
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
    comprehensiveMetrics: comprehensiveMetrics || null, // Add comprehensive metrics
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

// FinalExams endpoints
app.get("/admin/final-exams", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 200); // Default 100, max 200 per page
    const skip = parseInt(req.query.skip) || 0;
    
    const [finalExams, totalCount] = await Promise.all([
      DB.getAllFinalExams(limit, skip),
      DB.getFinalExamsCount()
    ]);
    
    res.json({
      exams: finalExams,
      pagination: {
        total: totalCount,
        limit,
        skip,
        hasMore: skip + limit < totalCount
      }
    });
  } catch (error) {
    console.error('Error getting final exams:', error);
    res.status(500).json({ error: 'Failed to get final exams' });
  }
});

app.get("/admin/final-exam/:examId/for-grading", (req, res) => {
  const examId = req.params.examId;
  
  DB.getFinalExamForGrading(examId)
    .then(examData => {
      if (!examData) {
        return res.status(404).json({ error: 'Final exam not found' });
      }
      res.json(examData);
    })
    .catch(error => {
      console.error('Error getting final exam for grading:', error);
      res.status(500).json({ error: 'Failed to get final exam for grading' });
    });
});

// Initialize FinalExams collection
app.post("/admin/initialize-final-exams", async (req, res) => {
  try {
    const result = await DB.initializeFinalExamsCollection();
    res.json(result);
  } catch (error) {
    console.error('Error initializing final exams collection:', error);
    res.status(500).json({ error: 'Failed to initialize final exams collection' });
  }
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

// Final Exam Grade Endpoints
app.post("/admin/final-exam/:examId/grade", (req, res) => {
  const examId = req.params.examId;
  const gradeData = req.body;
  
  DB.saveExamGrade(examId, gradeData)
    .then(result => {
      res.json(result);
    })
    .catch(error => {
      console.error('Error saving final exam grade:', error);
      res.status(500).json({ error: 'Failed to save final exam grade' });
    });
});

app.get("/admin/final-exam/:examId/grade", (req, res) => {
  const examId = req.params.examId;
  
  DB.getExamGrade(examId)
    .then(grade => {
      res.json(grade);
    })
    .catch(error => {
      console.error('Error getting final exam grade:', error);
      res.status(500).json({ error: 'Failed to get final exam grade' });
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

// Import analytics helpers
const {
  generateAnalyticsReport,
  analyzeTypingBehavior,
  detectAnomalies
} = require('./metricsAnalytics');

// Test endpoint for analytics
app.get("/admin/research/test", (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'Analytics endpoints are working',
    timestamp: new Date()
  });
});

// Admin research analytics endpoints
app.get("/admin/research/analytics", async (req, res) => {
  try {
    console.log('📊 Starting analytics report generation...');
    
    // Get all exam answers with comprehensive metrics
    const examAnswers = await DB.getAllExamAnswers();
    console.log(`📊 Found ${examAnswers.length} exam answers`);
    
    if (examAnswers.length === 0) {
      console.log('📊 No exam data found, returning empty report');
      return res.json({
        summary: {
          totalAnswers: 0,
          totalStudents: 0,
          analysisTimestamp: new Date(),
          metricsAvailable: 0
        },
        behaviorAnalysis: {
          overallStats: {},
          anomalies: [],
          researchInsights: { correlations: {}, patterns: {}, recommendations: [] }
        },
        performanceAnalysis: {
          overall: { accuracy: 0, averageTime: 0 },
          byDifficulty: {}
        },
        integrityAnalysis: {
          suspiciousActivities: {},
          attentionMetrics: {}
        },
        recommendations: []
      });
    }
    
    // Generate comprehensive analytics report
    console.log('📊 Generating analytics report...');
    const analyticsReport = generateAnalyticsReport(examAnswers);
    console.log('📊 Analytics report generated successfully');
    
    res.json(analyticsReport);
  } catch (error) {
    console.error('❌ Error generating analytics report:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to generate analytics report',
      details: error.message 
    });
  }
});

// Get analytics for specific exam session
app.get("/admin/research/analytics/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Get answers for specific exam
    const examAnswers = await DB.getExamAnswers(examId);
    
    if (!examAnswers || examAnswers.length === 0) {
      return res.status(404).json({ error: 'No exam data found' });
    }
    
    // Generate analytics for this specific exam
    const studentReport = generateAnalyticsReport(examAnswers);
    
    res.json(studentReport);
  } catch (error) {
    console.error('Error generating student analytics:', error);
    res.status(500).json({ error: 'Failed to generate student analytics' });
  }
});

// Export research data as CSV
app.get("/admin/research/export/csv", async (req, res) => {
  try {
    const examAnswers = await DB.getAllExamAnswers();
    const csvData = generateCSVExport(examAnswers);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="exam-research-data.csv"');
    res.send(csvData);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV data' });
  }
});

// Get anomaly detection results
app.get("/admin/research/anomalies", async (req, res) => {
  try {
    const examAnswers = await DB.getAllExamAnswers();
    const allMetrics = examAnswers
      .filter(answer => answer.behaviorAnalytics)
      .map(answer => answer.behaviorAnalytics);
    
    const anomalies = detectAnomalies(allMetrics, examAnswers);
    
    res.json({
      totalAnomalies: anomalies.length,
      highSeverity: anomalies.filter(a => a.severity === 'high').length,
      mediumSeverity: anomalies.filter(a => a.severity === 'medium').length,
      byType: groupAnomaliesByType(anomalies),
      details: anomalies
    });
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

// Helper function to generate CSV export
function generateCSVExport(examAnswers) {
  const headers = [
    'examId', 'questionIndex', 'difficulty', 'isCorrect', 'timeSpent',
    'wordsPerMinute', 'rhythmConsistency', 'confidenceScore', 'focusScore',
    'timeToFirstKeystroke', 'pauseCount', 'totalBackspaces', 'editingEfficiency',
    'tabSwitches', 'sidebarToggleCount', 'modalOpenCount', 'suspiciousTypingSpeed',
    'pasteFromExternal', 'devToolsOpened', 'submittedAt'
  ];
  
  let csvContent = headers.join(',') + '\n';
  
  examAnswers.forEach(answer => {
    const metrics = answer.behaviorAnalytics || {};
    const row = [
      answer.examId,
      answer.questionIndex,
      answer.difficulty,
      answer.isCorrect,
      answer.timeSpent,
      metrics.wordsPerMinute || 0,
      metrics.rhythmConsistency || 0,
      metrics.confidenceScore || 0,
      metrics.focusScore || 0,
      metrics.timeToFirstKeystroke || 0,
      metrics.pauseCount || 0,
      metrics.totalBackspaces || 0,
      metrics.editingEfficiency || 0,
      metrics.tabSwitches || 0,
      metrics.sidebarToggleCount || 0,
      metrics.modalOpenCount || 0,
      metrics.suspiciousTypingSpeed || false,
      metrics.pasteFromExternal || false,
      metrics.devToolsOpened || false,
      answer.submittedAt
    ];
    
    csvContent += row.map(field => 
      typeof field === 'string' ? `"${field.replace(/"/g, '""')}"` : field
    ).join(',') + '\n';
  });
  
  return csvContent;
}

// Helper function to group anomalies by type
function groupAnomaliesByType(anomalies) {
  const grouped = {};
  anomalies.forEach(anomaly => {
    if (!grouped[anomaly.type]) {
      grouped[anomaly.type] = 0;
    }
    grouped[anomaly.type]++;
  });
  return grouped;
}

// getAllExamAnswers function moved to db.js

// Grade by Question API endpoints
app.get("/api/admin/questions-with-answers", async (req, res) => {
  try {
    // Use new FinalExams-based function
    const questions = await DB.getQuestionsWithAnswersFromFinalExams();
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions with answers:', error);
    res.status(500).json({ error: 'Failed to get questions with answers' });
  }
});

// OPTIMIZED: New paginated questions endpoint
app.get("/api/admin/questions-optimized", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const difficulty = req.query.difficulty || 'all';
    const gradingStatus = req.query.gradingStatus || 'all';
    const includeGradingStatus = req.query.includeGradingStatus === 'true';
    const questionId = req.query.questionId; // Support for fetching specific question
    
    console.log(`🚀 Optimized questions API: page ${page}, limit ${limit}${questionId ? `, questionId ${questionId}` : ''}`);
    
    const filters = {
      search: search.trim(),
      difficulty,
      gradingStatus,
      includeGradingStatus,
      questionId: questionId ? parseInt(questionId) : undefined
    };
    
    const result = await DB.getQuestionsWithAnswersOptimized(page, limit, filters);
    
    console.log(`✅ API returning ${result.questions.length} questions`);
    res.json(result);
  } catch (error) {
    console.error('Error getting optimized questions:', error);
    res.status(500).json({ error: 'Failed to get optimized questions' });
  }
});

// OPTIMIZED: Question answers with pagination
app.get("/api/admin/question/:questionId/answers-optimized", async (req, res) => {
  try {
    const questionId = req.params.questionId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    console.log(`🔄 Optimized answers API: question ${questionId}, page ${page}, limit ${limit}`);
    
    const questionData = await DB.getQuestionAnswersOptimized(questionId, page, limit);
    
    if (!questionData) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    console.log(`✅ API returning ${questionData.answers.length} answers for question ${questionId}`);
    res.json(questionData);
  } catch (error) {
    console.error('Error getting optimized question answers:', error);
    res.status(500).json({ error: 'Failed to get optimized question answers' });
  }
});

// Legacy endpoint for backwards compatibility
app.get("/api/admin/question/:questionId/answers", async (req, res) => {
  try {
    const questionId = req.params.questionId;
    // Use new FinalExams-based function
    const questionData = await DB.getQuestionAnswersFromFinalExams(questionId);
    
    if (!questionData) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json(questionData);
  } catch (error) {
    console.error('Error getting question answers:', error);
    res.status(500).json({ error: 'Failed to get question answers' });
  }
});

app.post("/api/admin/grade-answer", async (req, res) => {
  try {
    const { examId, questionIndex, grade, feedback } = req.body;
    
    if (!examId || questionIndex === undefined || grade === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Use new FinalExams-based grading function
    const result = await DB.updateAnswerGradeInFinalExams(examId, questionIndex, grade, feedback);
    res.json({ success: true, examGrade: result });
  } catch (error) {
    console.error('Error grading answer:', error);
    res.status(500).json({ error: 'Failed to grade answer' });
  }
});

// Comments Bank API endpoints
app.post("/api/admin/comment-bank", async (req, res) => {
  try {
    const { questionId, questionText, difficulty, score, maxScore, feedback, gradedBy } = req.body;
    
    if (!questionId || !questionText || !feedback) {
      return res.status(400).json({ error: 'Missing required fields: questionId, questionText, feedback' });
    }
    
    const result = await DB.saveCommentBankEntry(questionId, questionText, difficulty, score, maxScore, feedback, gradedBy);
    res.json({ success: true, comment: result });
  } catch (error) {
    console.error('Error saving comment to bank:', error);
    res.status(500).json({ error: 'Failed to save comment to bank' });
  }
});

app.get("/api/admin/comment-bank", async (req, res) => {
  try {
    const { questionId, difficulty, searchTerm, limit } = req.query;
    
    const comments = await DB.getCommentBankEntries(
      questionId ? parseInt(questionId) : null,
      difficulty || null,
      searchTerm || null,
      limit ? parseInt(limit) : 50
    );
    
    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments from bank:', error);
    res.status(500).json({ error: 'Failed to fetch comments from bank' });
  }
});

app.post("/api/admin/comment-bank/:commentId/use", async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const result = await DB.updateCommentBankUsage(commentId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating comment usage:', error);
    res.status(500).json({ error: 'Failed to update comment usage' });
  }
});

app.delete("/api/admin/comment-bank/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    
    const result = await DB.deleteCommentBankEntry(commentId);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error deleting comment from bank:', error);
    res.status(500).json({ error: 'Failed to delete comment from bank' });
  }
});

app.put("/api/admin/comment-bank/:commentId", async (req, res) => {
  try {
    const { commentId } = req.params;
    const updates = req.body;
    
    const result = await DB.updateCommentBankEntry(commentId, updates);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating comment in bank:', error);
    res.status(500).json({ error: 'Failed to update comment in bank' });
  }
});

// Missing Correct Answers API endpoints
app.get("/api/admin/check-missing-answers", async (req, res) => {
  try {
    const result = await DB.checkMissingCorrectAnswers();
    res.json(result);
  } catch (error) {
    console.error('Error checking missing answers:', error);
    res.status(500).json({ error: 'Failed to check missing answers' });
  }
});

app.post("/api/admin/fix-missing-answers", async (req, res) => {
  try {
    const result = await DB.checkMissingCorrectAnswers();
    res.json(result);
  } catch (error) {
    console.error('Error fixing missing answers:', error);
    res.status(500).json({ error: 'Failed to fix missing answers' });
  }
});

app.get("/api/admin/questions-answer-status", async (req, res) => {
  try {
    const result = await DB.getQuestionsCorrectAnswerStatus();
    res.json({ success: true, questions: result });
  } catch (error) {
    console.error('Error getting questions answer status:', error);
    res.status(500).json({ error: 'Failed to get questions answer status' });
  }
});

// Debug endpoint to check FinalExams structure
app.get("/api/admin/debug/final-exams-structure", async (req, res) => {
  try {
    const db = await DB.getDatabase();
    
    // Get a sample final exam
    const sampleExam = await db.collection("finalExams").findOne({});
    
    if (!sampleExam) {
      return res.json({ error: "No final exams found" });
    }
    
    // Get count of final exams with mergedAnswers
    const withMergedAnswers = await db.collection("finalExams").countDocuments({
      mergedAnswers: { $exists: true, $ne: [] }
    });
    
    const totalExams = await db.collection("finalExams").countDocuments({});
    
    res.json({
      totalFinalExams: totalExams,
      examsWithMergedAnswers: withMergedAnswers,
      sampleExamStructure: {
        _id: sampleExam._id,
        studentEmail: sampleExam.studentEmail,
        hasMergedAnswers: !!sampleExam.mergedAnswers,
        mergedAnswersCount: sampleExam.mergedAnswers ? sampleExam.mergedAnswers.length : 0,
        sampleMergedAnswer: sampleExam.mergedAnswers ? sampleExam.mergedAnswers[0] : null,
        hasReview: !!sampleExam.review,
        reviewStructure: sampleExam.review ? Object.keys(sampleExam.review) : null
      }
    });
  } catch (error) {
    console.error('Error debugging final exams:', error);
    res.status(500).json({ error: 'Failed to debug final exams' });
  }
});

// Simple endpoint to check merged answers count
app.get("/api/admin/debug/merged-answers-count", async (req, res) => {
  try {
    const db = await DB.getDatabase();
    
    const totalExams = await db.collection("finalExams").countDocuments({});
    const examsWithMergedAnswers = await db.collection("finalExams").countDocuments({
      mergedAnswers: { $exists: true, $ne: [] }
    });
    
    // Get sample of merged answers to see structure
    const sampleExams = await db.collection("finalExams").find({ 
      mergedAnswers: { $exists: true, $ne: [] } 
    }).limit(2).toArray();
    
    const sampleAnswerStructure = sampleExams.length > 0 && sampleExams[0].mergedAnswers 
      ? Object.keys(sampleExams[0].mergedAnswers[0]) 
      : [];
    
    res.json({
      totalExams,
      examsWithMergedAnswers,
      sampleAnswerStructure,
      sampleAnswer: sampleExams.length > 0 ? sampleExams[0].mergedAnswers[0] : null
    });
  } catch (error) {
    console.error('Error checking merged answers:', error);
    res.status(500).json({ error: 'Failed to check merged answers' });
  }
});

// Debug endpoint to check specific question answers
app.get("/api/admin/debug/question/:questionId/final-answers", async (req, res) => {
  try {
    const db = await DB.getDatabase();
    const questionId = req.params.questionId;
    
    // Check both string and number questionId
    const pipeline = [
      { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
      { $unwind: "$mergedAnswers" },
      { 
        $match: { 
          $or: [
            { "mergedAnswers.questionId": questionId.toString() },
            { "mergedAnswers.questionId": parseInt(questionId) }
          ]
        }
      },
      { $limit: 5 },
      { 
        $project: {
          studentEmail: 1,
          "mergedAnswers.questionId": 1,
          "mergedAnswers.questionIndex": 1,
          "mergedAnswers.studentAnswer": 1,
          "mergedAnswers.isCorrect": 1
        }
      }
    ];
    
    const results = await db.collection("finalExams").aggregate(pipeline).toArray();
    
    res.json({
      questionId: questionId,
      questionIdAsNumber: parseInt(questionId),
      foundAnswers: results.length,
      sampleResults: results
    });
  } catch (error) {
    console.error('Error debugging question answers:', error);
    res.status(500).json({ error: 'Failed to debug question answers' });
  }
});

// Debug endpoint to check exam answers data
app.get("/api/admin/debug/exam-answers", async (req, res) => {
  try {
    // Use existing DB functions instead of direct database access
    const answers = await DB.getAllExamAnswers();
    const questions = await DB.getAllQuestions();
    
    res.json({ 
      sampleAnswers: answers.slice(0, 20).map(a => ({
        examId: a.examId,
        questionId: a.questionId,
        questionIdType: typeof a.questionId,
        questionIndex: a.questionIndex,
        submittedAt: a.submittedAt
      })),
      sampleQuestions: questions.slice(0, 10).map(q => ({
        id: q.id,
        idType: typeof q.id,
        question: q.question ? q.question.substring(0, 100) + '...' : 'No question text',
        approved: q.approved
      })),
      answerCount: answers.length,
      questionCount: questions.length
    });
  } catch (error) {
    console.error('Error getting debug data:', error);
    res.status(500).json({ error: 'Failed to get debug data', details: error.message });
  }
});


// Cheat Detection endpoint
app.post("/admin/cheat-detection", async (req, res) => {
  try {
    const { similarityThreshold = 0.8, aiThreshold = 30 } = req.body;

    console.log('🔍 Starting cheat detection analysis...');

    // Get all final exams from FinalExams collection
    const finalExams = await DB.getAllFinalExams(1000, 0); // Get more exams for analysis
    console.log(`Found ${finalExams.length} completed exam sessions`);

    // Collect all answers from all exams
    const allAnswers = [];
    const examAnswers = []; // For frontend AI processing

    for (const session of finalExams) {
      try {
        if (session.status !== 'completed') continue;

        // Get exam data using existing DB functions
        const examData = await DB.getFinalExamForGrading(session._id);
        
        if (examData && examData.mergedAnswers && Array.isArray(examData.mergedAnswers)) {
          for (let i = 0; i < examData.mergedAnswers.length; i++) {
            const answer = examData.mergedAnswers[i];
            if (answer.studentAnswer && answer.studentAnswer.trim()) {
              const examAnswer = {
                _id: session._id,
                studentEmail: session.studentEmail,
                studentName: session.studentName,
                studentId: session.studentId,
                questionIndex: i,
                questionText: answer.questionText || `שאלה ${i + 1}`,
                studentAnswer: answer.studentAnswer,
                examId: session._id
              };
              
              allAnswers.push(examAnswer);
              examAnswers.push(examAnswer); // For frontend processing
            }
          }
        }
      } catch (error) {
        console.error(`Error processing exam ${session._id}:`, error);
      }
    }

    console.log(`Collected ${allAnswers.length} answers for analysis`);

    // Similarity Analysis using the algorithms from the frontend
    const similarityMatches = [];
    const answersByQuestion = {};

    // Group answers by question
    allAnswers.forEach(answer => {
      if (!answersByQuestion[answer.questionIndex]) {
        answersByQuestion[answer.questionIndex] = [];
      }
      answersByQuestion[answer.questionIndex].push(answer);
    });

    // Text similarity functions (copied from frontend)
    function calculateJaccardSimilarity(text1, text2) {
      const normalize = (text) => {
        return text
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .split(' ')
          .filter(word => word.length > 2);
      };

      const tokens1 = new Set(normalize(text1));
      const tokens2 = new Set(normalize(text2));

      if (tokens1.size === 0 && tokens2.size === 0) return 1;
      if (tokens1.size === 0 || tokens2.size === 0) return 0;

      const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
      const union = new Set([...tokens1, ...tokens2]);

      return intersection.size / union.size;
    }

    function calculateLevenshteinSimilarity(str1, str2) {
      const matrix = [];
      const len1 = str1.length;
      const len2 = str2.length;

      if (len1 === 0) return len2 === 0 ? 1 : 0;
      if (len2 === 0) return 0;

      for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
      }

      for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }

      const maxLen = Math.max(len1, len2);
      return (maxLen - matrix[len2][len1]) / maxLen;
    }

    function calculateSequenceSimilarity(text1, text2) {
      const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP BY', 'HAVING', 'ORDER BY', 'INSERT', 'UPDATE', 'DELETE'];
      
      const extractKeywordSequence = (text) => {
        const upperText = text.toUpperCase();
        return sqlKeywords.filter(keyword => upperText.includes(keyword));
      };

      const seq1 = extractKeywordSequence(text1);
      const seq2 = extractKeywordSequence(text2);

      if (seq1.length === 0 && seq2.length === 0) return 1;
      if (seq1.length === 0 || seq2.length === 0) return 0;

      // Simple LCS calculation
      const maxLen = Math.max(seq1.length, seq2.length);
      const commonKeywords = seq1.filter(keyword => seq2.includes(keyword));
      return commonKeywords.length / maxLen;
    }

    function calculateAdvancedSimilarity(text1, text2) {
      const jaccardScore = calculateJaccardSimilarity(text1, text2);
      const levenshteinSimilarity = calculateLevenshteinSimilarity(text1, text2);
      const sequenceSimilarity = calculateSequenceSimilarity(text1, text2);
      
      return (jaccardScore * 0.4 + levenshteinSimilarity * 0.3 + sequenceSimilarity * 0.3);
    }

    function getSuspicionLevel(score) {
      if (score >= 0.85) return 'high';
      if (score >= 0.7) return 'medium';
      return 'low';
    }

    // Compare answers within each question
    Object.keys(answersByQuestion).forEach(questionIndexStr => {
      const questionIndex = parseInt(questionIndexStr);
      const answers = answersByQuestion[questionIndex];
      
      for (let i = 0; i < answers.length - 1; i++) {
        for (let j = i + 1; j < answers.length; j++) {
          const answer1 = answers[i];
          const answer2 = answers[j];

          // Skip if same student
          if (answer1.studentEmail === answer2.studentEmail) continue;

          const similarity = calculateAdvancedSimilarity(
            answer1.studentAnswer,
            answer2.studentAnswer
          );

          if (similarity >= similarityThreshold) {
            similarityMatches.push({
              student1: {
                id: answer1.studentId || answer1.studentEmail,
                name: answer1.studentName || 'לא צוין',
                email: answer1.studentEmail
              },
              student2: {
                id: answer2.studentId || answer2.studentEmail,
                name: answer2.studentName || 'לא צוין',
                email: answer2.studentEmail
              },
              questionIndex,
              questionText: answer1.questionText,
              similarityScore: similarity,
              student1Answer: answer1.studentAnswer,
              student2Answer: answer2.studentAnswer,
              suspicionLevel: getSuspicionLevel(similarity)
            });
          }
        }
      }
    });

    // Sort results by suspicion level and score
    similarityMatches.sort((a, b) => b.similarityScore - a.similarityScore);

    // Calculate statistics
    const stats = {
      totalExams: finalExams.length,
      suspiciousSimilarities: similarityMatches.length,
      suspiciousAI: 0, // Will be calculated on frontend
      averageSimilarityScore: similarityMatches.length > 0 
        ? similarityMatches.reduce((sum, match) => sum + match.similarityScore, 0) / similarityMatches.length 
        : 0,
      highRiskPairs: similarityMatches.filter(match => match.suspicionLevel === 'high').length
    };

    console.log('✅ Cheat detection analysis completed on backend');

    res.json({
      similarityMatches,
      aiDetectionResults: [], // Will be populated on frontend
      examAnswers, // Send raw data for frontend AI processing
      stats
    });

  } catch (error) {
    console.error('Error in cheat detection analysis:', error);
    res.status(500).json({ error: 'שגיאה בניתוח חשדות העתקה' });
  }
});

// PRE-COMPUTED Cheat Detection Results Endpoint
app.get('/admin/cheat-detection', async (req, res) => {
  console.log('📊 Fetching pre-computed cheat detection results...');
  
  try {
    // Connect to DB
    const db = await DB.connectToDatabase();
    
    // Fetch pre-computed results
    const results = await db.collection('CheatDetectionResults').findOne({ 
      _id: 'cheat-detection-results' 
    });

    if (!results) {
      return res.status(404).json({ 
        error: 'לא נמצאו תוצאות מוכנות',
        message: 'יש להריץ ניתוח מחדש או לפנות למנהל המערכת',
        needsAnalysis: true
      });
    }

    // Check if results are recent (less than 7 days old)
    const resultAge = Date.now() - new Date(results.timestamp).getTime();
    const daysSinceAnalysis = Math.floor(resultAge / (1000 * 60 * 60 * 24));
    
    const response = {
      ...results,
      metadata: {
        lastAnalysis: results.timestamp,
        daysSinceAnalysis,
        isStale: daysSinceAnalysis > 7,
        totalResultsCount: {
          similarities: results.similarityMatches?.length || 0,
          aiDetections: results.aiDetectionResults?.length || 0
        }
      }
    };

    console.log(`✅ Returning pre-computed results from ${results.timestamp}`);
    console.log(`📈 Results: ${response.metadata.totalResultsCount.similarities} similarities, ${response.metadata.totalResultsCount.aiDetections} AI detections`);
    
    res.json(response);

  } catch (error) {
    console.error('❌ Error fetching cheat detection results:', error);
    res.status(500).json({ 
      error: 'שגיאה בטעינת תוצאות הניתוח',
      details: error.message 
    });
  }
});

// Trigger new analysis endpoint (optional - for admin use)
app.post('/admin/cheat-detection/analyze', async (req, res) => {
  console.log('🔍 Manual analysis trigger requested...');
  
  // This would trigger the local script or queue a background job
  // For now, just return a message
  res.json({
    message: 'לניתוח מחדש, יש להריץ את הסקריפט המקומי',
    instructions: 'node run-cheat-detection-locally.js',
    status: 'pending'
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Export the Express API
module.exports = app;