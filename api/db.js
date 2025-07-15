// const { MongoClient, ServerApiVersion } = require('mongodb');
var MongoClient = require('mongodb').MongoClient;
var ServerApiVersion = require('mongodb').ServerApiVersion;
var config = require('./config');

const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`
var _db;
var _items;
var _users;



module.exports = {
    connectToDb: async () => {
        try {
            const client = new MongoClient(connectionString);
            console.log('Connecting to mongo...');
            await client.connect();
            await client.db("experiment").command({ ping: 1 });
            console.log("Pinged your deployment. You successfully connected to MongoDB!");
            _db = client.db("experiment");
            _items = _db.collection("winter");
            _users = _db.collection("users");
            console.log('Connected to mongo!!!');
        } catch (err) {
            console.log(`Could not connect to MongoDB (err) => ${err}`);
        }
    },
    connection: connectionString,
    getDb: () => {return _db;},
    getStatus: async () => {
      const client = new MongoClient(connectionString);
      await client.connect();
      _db = client.db("experiment");
      const status = await _db.collection("Status").find({}).toArray();
      return {
        "status": status[0]["status"]
      }
    },
    setStatus: async (val) => {
      const client = new MongoClient(connectionString);
      await client.connect();
      _db = client.db("experiment");
      const status = await _db.collection("Status").updateOne(
        { sid: "admin" },
        { $set: { status: val } }
      )
      return status;
    },
    getCoinsStatus: async () => {
      const client = new MongoClient(connectionString);
      await client.connect();
      _db = client.db("experiment");
      const status = await _db.collection("CoinsStatus").find({}).toArray();
      return {
        "status": status[0]["status"]
      }
    },
    setCoinsStatus: async (val) => {
      const client = new MongoClient(connectionString);
      await client.connect();
      _db = client.db("experiment");
      const status = await _db.collection("CoinsStatus").updateOne(
        { sid: "admin" },
        { $set: { status: val } }
      )
      return status;
    },
    addItem: async (item) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        _items = _db.collection("winter");
        // _users = _db.collection("users");
        _items.insertOne(item, {}, function (err, doc) {
            if (err) {
                return 500
            }
        });
        // await client.close();
        return 200
    },
    updatePassword: async (emails, newPassword) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        // _items = _db.collection("summer");
        _users = _db.collection("users");
        _users.updateMany({ email: { $in: emails } }, { $set: { password: newPassword } }, function (err, res) {
            if (err) {
                console.log(err)
                return 500
            }
        });
        return 200
    },
    getAllUsers: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        _users = _db.collection("users");
        return _users.find({}).toArray();
    },
    getChatSessions: async (userId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const sessions = await _db.collection("chatSessions").find({ userId }).toArray();
        return sessions;
      },
    
      createChatSession: async (userId, title) => {
        const session = {
          userId,
          title,
          createdAt: new Date(),
          lastMessageTimestamp: new Date()
        };
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const result = await _db.collection("chatSessions").insertOne(session);
        return { id: result.insertedId, ...session };
      },
      getCoinsBalance: async (userEmail) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const messages = await _db.collection("Coins").find({user: userEmail}).toArray();
        return messages;
      },
      getAllCoins: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const coins = await _db.collection("Coins").find({}).toArray();
        return coins;
      },

      setCoinsBalance: async (user, currentBalance) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const result = await _db.collection("Coins").updateOne(
          { user: user }, // Filter to find the document for the specific user
          { $set: { coins: currentBalance } }, // Update the 'coins' field with the new balance
          { upsert: true } // Create a new document if the user doesn't exist
        );
        return result
      },
      updateCoinsBalance: async (users, amount) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        // Update all users by adding 'amount' to their 'coins' field
        const result = await _db.collection("Coins").updateMany(
          { user: { $in: users } }, // Update only specified users
          { $inc: { coins: amount } } // Increment 'coins' field
      );
        return result;

      },
      getChatMessages: async (chatId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const messages = await _db.collection("chatMessages").find({ chatId }).toArray();
        return messages;
      },
      saveFeedback: async (feedbackObj) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const result = await _db.collection("Feedbacks").insertOne(feedbackObj)
        return { id: result.insertedId }
      },
      saveChatMessage: async (chatId, role, text) => {
        const message = {
          chatId,
          role,
          text,
          timestamp: new Date()
        };
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        await _db.collection("chatMessages").insertOne(message);
        await _db.collection("chatSessions").updateOne(
          { _id: chatId },
          { $set: { lastMessageTimestamp: new Date() } }
        );
        return message;
      },
      saveUserForm: async (data) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        try {
          const result = await _db.collection("UserForms").insertOne(data);
          return { "status" : 1}
        } catch {
          return { "status" : 0}
        }
      },

      // Exercise-related functions
      getUserPoints: async (userId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const userPoints = await _db.collection("userPoints").findOne({ userId });
        return userPoints || { userId, points: 0, answeredExercises: [], failedAttempts: {} };
      },

      updateUserPoints: async (userId, pointsToAdd, exerciseId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const result = await _db.collection("userPoints").updateOne(
          { userId },
          { 
            $inc: { points: pointsToAdd },
            $addToSet: { answeredExercises: exerciseId },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true }
        );
        return result;
      },

      addFailedAttempt: async (userId, exerciseId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const result = await _db.collection("userPoints").updateOne(
          { userId },
          { 
            $inc: { [`failedAttempts.${exerciseId}`]: 1 },
            $set: { lastUpdated: new Date() }
          },
          { upsert: true }
        );
        return result;
      },

      getFailedAttempts: async (userId, exerciseId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const userPoints = await _db.collection("userPoints").findOne({ userId });
        return userPoints?.failedAttempts?.[exerciseId] || 0;
      },

      getAvailableExercises: async (userId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        const userPoints = await _db.collection("userPoints").findOne({ userId });
        const answeredExercises = userPoints?.answeredExercises || [];
        
        // Return exercise IDs that haven't been answered yet
        const exercises = await _db.collection("questions").find({}).toArray();
        return exercises.filter(exercise => !answeredExercises.includes(exercise.id));
      },

      // Exam-related functions
      createExamSession: async (studentEmail, examTitle = 'SQL Exam', studentId = null, studentName = null, clientIp = null, browserFingerprint = null) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const examSession = {
          studentEmail,
          examTitle,
          studentId,
          studentName,
          startTime: new Date(),
          endTime: null,
          status: 'in_progress', // 'in_progress', 'completed', 'timeout'
          currentQuestionIndex: 0,
          totalQuestions: 13, // Updated to 13 questions (6 easy + 3 medium + 3 hard + 1 algebra)
          questions: [],
          score: 0,
          createdAt: new Date(),
          // Security fields for single-access validation
          clientIp: clientIp,
          browserFingerprint: browserFingerprint, // Contains userAgent, screenResolution, timezone etc.
          accessAttempts: [{ // Track all access attempts
            timestamp: new Date(),
            clientIp: clientIp,
            browserFingerprint: browserFingerprint,
            success: true
          }]
        };
        
        const result = await _db.collection("examSessions").insertOne(examSession);
        return { examId: result.insertedId, ...examSession };
      },

      getExamSession: async (examId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const { ObjectId } = require('mongodb');
        const examSession = await _db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
        return examSession;
      },

      updateExamSession: async (examId, updateData) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const { ObjectId } = require('mongodb');
        const result = await _db.collection("examSessions").updateOne(
          { _id: new ObjectId(examId) },
          { $set: { ...updateData, lastUpdated: new Date() } }
        );
        return result;
      },

      saveExamAnswer: async (examId, questionIndex, answerData) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const examAnswer = {
          examId,
          questionIndex,
          questionId: answerData.questionId,
          questionText: answerData.questionText,
          difficulty: answerData.difficulty,
          studentAnswer: answerData.studentAnswer,
          correctAnswer: answerData.correctAnswer,
          isCorrect: answerData.isCorrect,
          timeSpent: answerData.timeSpent, // in seconds
          typingSpeed: answerData.typingSpeed || 0, // characters per second
          typingEvents: answerData.typingEvents || [], // array of typing events
          isAutoSave: answerData.isAutoSave || false, // whether this is an auto-save
          submittedAt: new Date(),
          startTime: answerData.startTime,
          endTime: answerData.endTime
        };
        
        // If this is an auto-save, check if we already have an answer for this question
        if (answerData.isAutoSave) {
          const existingAnswer = await _db.collection("examAnswers").findOne({
            examId,
            questionIndex,
            isAutoSave: true
          });
          
          if (existingAnswer) {
            // Update existing auto-save
            const result = await _db.collection("examAnswers").updateOne(
              { _id: existingAnswer._id },
              { $set: examAnswer }
            );
            return { answerId: existingAnswer._id, ...examAnswer };
          }
        }
        
        const result = await _db.collection("examAnswers").insertOne(examAnswer);
        return { answerId: result.insertedId, ...examAnswer };
      },

      getExamAnswers: async (examId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const answers = await _db.collection("examAnswers").find({ examId }).sort({ questionIndex: 1 }).toArray();
        return answers;
      },

      getExamQuestions: async (difficulty = null, limit = 10) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        let query = {};
        if (difficulty) {
          query.difficulty = difficulty;
        }
        
        const exercises = await _db.collection("questions").find(query).toArray();
        
        // Shuffle and return limited questions
        const shuffled = exercises.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, limit);
      },

      getNextExamQuestion: async (currentDifficulty, examId, questionIndex) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        try {
          // Get questions already used in this exam session
          const usedAnswers = await _db.collection("examAnswers")
            .find({ examId: examId })
            .toArray();
          
          const usedQuestionIds = usedAnswers.map(answer => answer.questionId);
          
          // Get questions of the specified difficulty that haven't been used
          let availableQuestions = await _db.collection("questions").find({ 
            difficulty: currentDifficulty,
            ...(usedQuestionIds.length > 0 ? { _id: { $nin: usedQuestionIds } } : {})
          }).toArray();
          
          // If no available questions of this difficulty (shouldn't happen with proper question pool)
          if (availableQuestions.length === 0) {
            console.warn(`No available ${currentDifficulty} questions for exam ${examId}, trying without duplicate filter`);
            availableQuestions = await _db.collection("questions").find({ 
              difficulty: currentDifficulty 
            }).toArray();
            
            if (availableQuestions.length === 0) {
              // Final fallback to any difficulty
              console.error(`No questions found for difficulty ${currentDifficulty}, using fallback`);
              availableQuestions = await _db.collection("questions").find({}).toArray();
            }
          }
          
          // Select random question from available pool
          const selectedQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
          
          console.log(`Selected question for exam ${examId}, position ${questionIndex}: ${selectedQuestion._id} (${currentDifficulty})`);
          console.log(`Used questions so far: ${usedQuestionIds.length}, Available: ${availableQuestions.length}`);
          
          return selectedQuestion;
          
        } catch (error) {
          console.error('Error in getNextExamQuestion:', error);
          // Fallback to original behavior if error occurs
          const questionsOfDifficulty = await _db.collection("questions").find({ difficulty: currentDifficulty }).toArray();
          return questionsOfDifficulty[Math.floor(Math.random() * questionsOfDifficulty.length)];
        } finally {
          await client.close();
        }
      },

      completeExamSession: async (examId, finalScore) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const { ObjectId } = require('mongodb');
        const result = await _db.collection("examSessions").updateOne(
          { _id: new ObjectId(examId) },
          { 
            $set: { 
              status: 'completed',
              endTime: new Date(),
              score: finalScore,
              completedAt: new Date()
            } 
          }
        );
        return result;
      },

      getStudentExamHistory: async (studentEmail) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const examSessions = await _db.collection("examSessions")
          .find({ studentEmail })
          .sort({ startTime: -1 })
          .toArray();
        return examSessions;
      },

      // Security functions for exam access control
      getActiveExamSession: async (studentId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        // Look for active session (in_progress status) for this student
        const activeSession = await _db.collection("examSessions").findOne({ 
          studentId: studentId,
          status: 'in_progress'
        });
        return activeSession;
      },

      // Check if student has already completed any exam (for one-time restriction)
      hasStudentCompletedExam: async (studentId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        // Look for any completed exam session for this student
        const completedSession = await _db.collection("examSessions").findOne({ 
          studentId: studentId,
          status: 'completed'
        });
        return !!completedSession; // Return true if found, false if not
      },

      validateExamAccess: async (studentId, clientIp, browserFingerprint) => {
        // Security validation disabled: always allow
        return { allowed: true, reason: 'disabled' };
      },

      getExamStatistics: async (examId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const answers = await _db.collection("examAnswers").find({ examId }).toArray();
        const correctCount = answers.filter(a => a.isCorrect).length;
        const totalQuestions = answers.length;
        const averageTime = answers.reduce((sum, a) => sum + a.timeSpent, 0) / totalQuestions;
        
        const difficultyBreakdown = {
          easy: answers.filter(a => a.difficulty === 'easy').length,
          medium: answers.filter(a => a.difficulty === 'medium').length,
          hard: answers.filter(a => a.difficulty === 'hard').length,
          algebra: answers.filter(a => a.difficulty === 'algebra').length,
        };
        
        return {
          totalQuestions,
          correctAnswers: correctCount,
          incorrectAnswers: totalQuestions - correctCount,
          accuracy: (correctCount / totalQuestions) * 100,
          averageTimePerQuestion: averageTime,
          difficultyBreakdown
        };
      },

      // Question management functions for admin
      getAllQuestions: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        // First check if questions collection exists and has data
        const questionsCount = await _db.collection("questions").countDocuments();
        
        if (questionsCount === 0) {
          // Initialize questions collection from exercises.json
          const exercises = require('./exercises.json');
          // Add default approval status to all questions
          const exercisesWithApprovalStatus = exercises.map(exercise => ({
            ...exercise,
            approved: false,
            approvedAt: null,
            createdAt: new Date()
          }));
          await _db.collection("questions").insertMany(exercisesWithApprovalStatus);
          return exercisesWithApprovalStatus;
        }
        
        // Ensure all existing questions have approval fields
        await _db.collection("questions").updateMany(
          { approved: { $exists: false } },
          { 
            $set: { 
              approved: false,
              approvedAt: null
            }
          }
        );

        const questions = await _db.collection("questions").find({}).sort({ id: 1 }).toArray();
        return questions;
      },

      deleteQuestion: async (questionId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const result = await _db.collection("questions").deleteOne({ id: parseInt(questionId) });
        return result;
      },

      approveQuestion: async (questionId, approvedBy = 'Unknown') => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        console.log('Approving question with ID:', questionId, 'by:', approvedBy);
        
        // First get the question to check its difficulty
        const question = await _db.collection("questions").findOne({ id: parseInt(questionId) });
        if (!question) {
          throw new Error('Question not found');
        }
        
        // Automatically assign points based on difficulty
        let points;
        switch (question.difficulty.toLowerCase()) {
          case 'easy':
            points = 6;
            break;
          case 'medium':
            points = 8;
            break;
          case 'hard':
            points = 10;
            break;
          case 'algebra':
            points = 12;
            break;
          default:
            points = question.points || 5; // Keep existing points if difficulty is unknown
        }
        
        console.log(`Setting points to ${points} for difficulty: ${question.difficulty}`);
        
        const result = await _db.collection("questions").updateOne(
          { id: parseInt(questionId) },
          { 
            $set: { 
              approved: true,
              approvedAt: new Date(),
              approvedBy: approvedBy,
              points: points
            }
          }
        );
        
        console.log('Approval result:', result);
        
        // Verify the update worked
        const updatedQuestion = await _db.collection("questions").findOne({ id: parseInt(questionId) });
        console.log('Updated question:', updatedQuestion);
        
        return result;
      },

      getQuestion: async (questionId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const question = await _db.collection("questions").findOne({ id: parseInt(questionId) });
        return question;
      },

      addQuestion: async (questionData) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        // Get the next available ID
        const lastQuestion = await _db.collection("questions").findOne({}, { sort: { id: -1 } });
        const nextId = lastQuestion ? lastQuestion.id + 1 : 1;
        
        const newQuestion = {
          id: nextId,
          ...questionData,
          createdAt: new Date(),
          approved: false
        };
        
        const result = await _db.collection("questions").insertOne(newQuestion);
        return { questionId: result.insertedId, ...newQuestion };
      },

      updateQuestion: async (questionId, updates) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const result = await _db.collection("questions").updateOne(
          { id: parseInt(questionId) },
          { 
            $set: { 
              ...updates,
              updatedAt: new Date()
            }
          }
        );
        
        return result;
      },

      getApprovedQuestions: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const approvedQuestions = await _db.collection("questions")
          .find({ approved: true })
          .sort({ approvedAt: -1 })
          .toArray();
        
        return approvedQuestions;
      },

      // Extra time management functions
      uploadExtraTimeRecords: async (records, uploadedBy = 'admin') => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const extraTimeCollection = _db.collection("extraTime");
        let inserted = 0;
        let updated = 0;
        let errors = 0;
        
        for (const record of records) {
          try {
            const result = await extraTimeCollection.updateOne(
              { studentId: record.studentId },
              { 
                $set: { 
                  percentage: record.percentage,
                  updatedAt: new Date(),
                  uploadedBy: uploadedBy
                },
                $setOnInsert: { 
                  createdAt: new Date()
                }
              },
              { upsert: true }
            );
            
            if (result.upsertedCount > 0) {
              inserted++;
            } else {
              updated++;
            }
          } catch (error) {
            console.error(`Error processing record for student ${record.studentId}:`, error);
            errors++;
          }
        }
        
        return { inserted, updated, errors };
      },

      getExtraTimeForStudent: async (studentId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const extraTimeRecord = await _db.collection("extraTime").findOne({ studentId });
        return extraTimeRecord || { studentId, percentage: 0, hasExtraTime: false };
      },

      getAllExtraTimeRecords: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const records = await _db.collection("extraTime").find({}).sort({ createdAt: -1 }).toArray();
        return records;
      },

      // Exam grading functions
      getAllExamSessions: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const examSessions = await _db.collection("examSessions")
          .find({})
          .sort({ startTime: -1 })
          .toArray();
        
        // Check which exams have been graded
        const gradedExams = await _db.collection("examGrades").find({}).toArray();
        const gradedExamIds = gradedExams.map(grade => grade.examId.toString());
        
        // Add graded status to exam sessions and normalize status
        const sessionsWithGradingStatus = examSessions.map(session => ({
          ...session,
          status: (session.status || '').toLowerCase().trim(),
          graded: gradedExamIds.includes(session._id.toString())
        }));
        
        return sessionsWithGradingStatus;
      },

      getExamForGrading: async (examId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const { ObjectId } = require('mongodb');
        
        // Get exam session
        const examSession = await _db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
        if (!examSession) {
          return null;
        }
        
        // Get all answers for this exam
        const answers = await _db.collection("examAnswers").find({ examId }).sort({ questionIndex: 1 }).toArray();
        
        // Get questions details for each answer
        const questionsWithAnswers = await Promise.all(
          answers.map(async (answer) => {
            const question = await _db.collection("questions").findOne({ id: parseInt(answer.questionId) });
            return {
              ...answer,
              questionDetails: question || null
            };
          })
        );
        
        return {
          session: examSession,
          answers: questionsWithAnswers
        };
      },

      saveExamGrade: async (examId, gradeData) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const { ObjectId } = require('mongodb');
        
        const examGrade = {
          examId,
          gradedBy: gradeData.gradedBy,
          gradedAt: new Date(),
          totalScore: gradeData.totalScore,
          maxScore: gradeData.maxScore,
          percentage: gradeData.percentage,
          review: gradeData.review,
          questionGrades: gradeData.questionGrades || [],
          overallFeedback: gradeData.overallFeedback || '',
          grade: gradeData.grade || '', // A, B, C, D, F or numerical
          isGraded: true
        };
        
        // Check if grade already exists
        const existingGrade = await _db.collection("examGrades").findOne({ examId });
        
        if (existingGrade) {
          // Update existing grade
          const result = await _db.collection("examGrades").updateOne(
            { examId },
            { $set: examGrade }
          );
          return { gradeId: existingGrade._id, ...examGrade, updated: true };
        } else {
          // Insert new grade
          const result = await _db.collection("examGrades").insertOne(examGrade);
          return { gradeId: result.insertedId, ...examGrade, updated: false };
        }
      },

      getExamGrade: async (examId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const grade = await _db.collection("examGrades").findOne({ examId });
        return grade;
      },

      getAllExamGrades: async () => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const grades = await _db.collection("examGrades")
          .find({})
          .sort({ gradedAt: -1 })
          .toArray();
        
        return grades;
      },

      deleteExtraTimeRecord: async (studentId) => {
        const client = new MongoClient(connectionString);
        await client.connect();
        _db = client.db("experiment");
        
        const result = await _db.collection("extraTime").deleteOne({ studentId });
        return result;
      }
}

// export default DB;

