// MongoDB Connection Manager for Vercel Serverless Environment
var MongoClient = require('mongodb').MongoClient;
var ServerApiVersion = require('mongodb').ServerApiVersion;
var config = require('./config');

const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;

// Global variables for connection caching
let cachedClient = null;
let cachedDb = null;
let connectionAttempts = 0;
const maxConnectionAttempts = 3;

// Connection manager - singleton pattern for Vercel serverless
async function connectToDatabase() {
    // If we have a cached connection and it's still connected, reuse it
    if (cachedClient && cachedDb) {
        try {
            // Test the connection with a simple ping
            await cachedDb.admin().ping();
            console.log('♻️ Reusing existing MongoDB connection');
            return { client: cachedClient, db: cachedDb };
        } catch (error) {
            console.log('🔄 Cached connection failed, creating new connection...');
            // Clear cached connection if ping fails
            cachedClient = null;
            cachedDb = null;
        }
    }

    while (connectionAttempts < maxConnectionAttempts) {
        try {
            console.log(`🔌 Creating new MongoDB connection (attempt ${connectionAttempts + 1})...`);
            
            // Create new client with minimal, stable settings for Vercel
            const client = new MongoClient(connectionString, {
                serverApi: {
                    version: ServerApiVersion.v1,
                    strict: true,
                    deprecationErrors: true,
                },
                maxPoolSize: 1, // Use single connection to avoid pool issues
                serverSelectionTimeoutMS: 15000, // Increased timeout
                heartbeatFrequencyMS: 60000, // Less frequent heartbeats
                minPoolSize: 0, // Allow pool to shrink to 0
            });

            await client.connect();
            await client.db("experiment").command({ ping: 1 });
            
            console.log("✅ Successfully connected to MongoDB!");
            
            // Cache the connection
            cachedClient = client;
            cachedDb = client.db("experiment");
            connectionAttempts = 0; // Reset on successful connection
            
            return { client: cachedClient, db: cachedDb };
            
        } catch (error) {
            connectionAttempts++;
            console.error(`❌ MongoDB connection attempt ${connectionAttempts} failed:`, error.message);
            
            if (connectionAttempts >= maxConnectionAttempts) {
                console.error(`❌ Failed to connect after ${maxConnectionAttempts} attempts`);
                throw error;
            }
            
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * connectionAttempts));
        }
    }
}

// Helper function to execute database operations with automatic recovery from pool errors
async function executeWithRetry(operation, operationName = 'Database operation') {
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();
            return result;
        } catch (error) {
            lastError = error;
            console.error(`${operationName} failed (attempt ${attempt + 1}):`, error.message);
            
            // Check if it's a pool clearing error or connection error
            if (error.name === 'MongoPoolClearedError' || 
                error.name === 'MongoNetworkError' || 
                error.message.includes('SSL routines') ||
                error.message.includes('connection pool')) {
                
                console.log('🔄 Pool/connection error detected, clearing cache and retrying...');
                // Clear the cached connection
                cachedClient = null;
                cachedDb = null;
                connectionAttempts = 0;
                
                // Don't retry on the last attempt
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
            }
            
            // For non-connection errors or last attempt, throw immediately
            throw error;
        }
    }
    
    throw lastError;
}

// Helper function to get database instance with automatic recovery
async function getDatabase() {
    try {
        const { db } = await connectToDatabase();
        return db;
    } catch (error) {
        console.error('Database connection failed, clearing cache and retrying...');
        // Clear cache and try once more
        cachedClient = null;
        cachedDb = null;
        connectionAttempts = 0;
        
        const { db } = await connectToDatabase();
        return db;
    }
}

module.exports = {
    getDatabase: getDatabase, // Export for debugging
    connectToDb: async () => {
        try {
            await connectToDatabase();
            console.log('✅ Connected to mongo!!!');
        } catch (err) {
            console.log(`❌ Could not connect to MongoDB (err) => ${err}`);
        }
    },
    
    connection: connectionString,
    
    getDb: async () => {
        const db = await getDatabase();
        return db;
    },
    
    getStatus: async () => {
        const db = await getDatabase();
        const status = await db.collection("Status").find({}).toArray();
        return {
            "status": status[0]["status"]
        };
    },
    
    setStatus: async (val) => {
        const db = await getDatabase();
        const status = await db.collection("Status").updateOne(
            { sid: "admin" },
            { $set: { status: val } }
        );
        return status;
    },
    
    getCoinsStatus: async () => {
        const db = await getDatabase();
        const status = await db.collection("CoinsStatus").find({}).toArray();
        return {
            "status": status[0]["status"]
        };
    },
    
    setCoinsStatus: async (val) => {
        const db = await getDatabase();
        const status = await db.collection("CoinsStatus").updateOne(
            { sid: "admin" },
            { $set: { status: val } }
        );
        return status;
    },
    
    addItem: async (item) => {
        const db = await getDatabase();
        const collection = db.collection("winter");
        await collection.insertOne(item);
        return 200;
    },
    
    updatePassword: async (emails, newPassword) => {
        const db = await getDatabase();
        const collection = db.collection("users");
        await collection.updateMany(
            { email: { $in: emails } }, 
            { $set: { password: newPassword } }
        );
        return 200;
    },
    
    getAllUsers: async () => {
        const db = await getDatabase();
        const collection = db.collection("users");
        return collection.find({}).toArray();
    },
    
    getChatSessions: async (userId) => {
        const db = await getDatabase();
        const sessions = await db.collection("chatSessions").find({ userId }).toArray();
        return sessions;
    },

    createChatSession: async (userId, title) => {
        const session = {
            userId,
            title,
            createdAt: new Date(),
            lastMessageTimestamp: new Date()
        };
        const db = await getDatabase();
        const result = await db.collection("chatSessions").insertOne(session);
        return { id: result.insertedId, ...session };
    },
    
    getCoinsBalance: async (userEmail) => {
        const db = await getDatabase();
        const messages = await db.collection("Coins").find({user: userEmail}).toArray();
        return messages;
    },
    
    getAllCoins: async () => {
        const db = await getDatabase();
        const coins = await db.collection("Coins").find({}).toArray();
        return coins;
    },

    setCoinsBalance: async (user, currentBalance) => {
        const db = await getDatabase();
        const result = await db.collection("Coins").updateOne(
            { user: user },
            { $set: { coins: currentBalance } },
            { upsert: true }
        );
        return result;
    },
    
    updateCoinsBalance: async (users, amount) => {
        const db = await getDatabase();
        const result = await db.collection("Coins").updateMany(
            { user: { $in: users } },
            { $inc: { coins: amount } }
        );
        return result;
    },
    
    getChatMessages: async (chatId) => {
        const db = await getDatabase();
        const messages = await db.collection("chatMessages").find({ chatId }).toArray();
        return messages;
    },
    
    saveFeedback: async (feedbackObj) => {
        const db = await getDatabase();
        const result = await db.collection("Feedbacks").insertOne(feedbackObj);
        return { id: result.insertedId };
    },
    
    saveChatMessage: async (chatId, role, text) => {
        const message = {
            chatId,
            role,
            text,
            timestamp: new Date()
        };
        const db = await getDatabase();
        await db.collection("chatMessages").insertOne(message);
        await db.collection("chatSessions").updateOne(
            { _id: chatId },
            { $set: { lastMessageTimestamp: new Date() } }
        );
        return message;
    },
    
    saveUserForm: async (data) => {
        const db = await getDatabase();
        try {
            const result = await db.collection("UserForms").insertOne(data);
            return { "status": 1 };
        } catch {
            return { "status": 0 };
        }
    },

    // Exercise-related functions
    getUserPoints: async (userId) => {
        const db = await getDatabase();
        const userPoints = await db.collection("userPoints").findOne({ userId });
        return userPoints || { userId, points: 0, answeredExercises: [], failedAttempts: {} };
    },

    updateUserPoints: async (userId, pointsToAdd, exerciseId) => {
        const db = await getDatabase();
        const result = await db.collection("userPoints").updateOne(
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
        const db = await getDatabase();
        const result = await db.collection("userPoints").updateOne(
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
        const db = await getDatabase();
        const userPoints = await db.collection("userPoints").findOne({ userId });
        return userPoints?.failedAttempts?.[exerciseId] || 0;
    },

    getAvailableExercises: async (userId) => {
        const db = await getDatabase();
        const userPoints = await db.collection("userPoints").findOne({ userId });
        const answeredExercises = userPoints?.answeredExercises || [];
        
        // Return exercise IDs that haven't been answered yet
        const exercises = await db.collection("questions").find({}).toArray();
        return exercises.filter(exercise => !answeredExercises.includes(exercise.id));
    },

    // Exam-related functions
    createExamSession: async (studentEmail, examTitle = 'SQL Exam', studentId = null, studentName = null, clientIp = null, browserFingerprint = null) => {
        const db = await getDatabase();
        
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
        
        const result = await db.collection("examSessions").insertOne(examSession);
        return { examId: result.insertedId, ...examSession };
    },

    getExamSession: async (examId) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        const examSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
        return examSession;
    },

    updateExamSession: async (examId, updateData) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        const result = await db.collection("examSessions").updateOne(
            { _id: new ObjectId(examId) },
            { $set: { ...updateData, lastUpdated: new Date() } }
        );
        return result;
    },

    saveExamAnswer: async (examId, questionIndex, answerData) => {
        const db = await getDatabase();
        
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
            
            // Legacy typing metrics (for backward compatibility)
            typingSpeed: answerData.typingSpeed || 0, // characters per second
            typingEvents: answerData.typingEvents || [], // array of typing events
            
            // Comprehensive research metrics
            comprehensiveMetrics: answerData.comprehensiveMetrics || null,
            
            // Research analytics fields extracted from comprehensive metrics
            behaviorAnalytics: answerData.comprehensiveMetrics ? {
                // Typing patterns
                wordsPerMinute: answerData.comprehensiveMetrics.typingPatterns?.wordsPerMinute || 0,
                averageKeyInterval: answerData.comprehensiveMetrics.typingPatterns?.averageKeyInterval || 0,
                rhythmConsistency: answerData.comprehensiveMetrics.typingPatterns?.rhythmConsistency || 0,
                pauseCount: answerData.comprehensiveMetrics.typingPatterns?.pauseCount || 0,
                longPauseCount: answerData.comprehensiveMetrics.typingPatterns?.longPauseCount || 0,
                
                // Editing behavior
                totalBackspaces: answerData.comprehensiveMetrics.editingBehavior?.totalBackspaces || 0,
                totalDeletes: answerData.comprehensiveMetrics.editingBehavior?.totalDeletes || 0,
                editingEfficiency: answerData.comprehensiveMetrics.editingBehavior?.editingEfficiency || 0,
                copyPasteEvents: answerData.comprehensiveMetrics.editingBehavior?.copyPasteEvents || 0,
                
                // Cognitive metrics
                timeToFirstKeystroke: answerData.comprehensiveMetrics.cognitiveMetrics?.timeToFirstKeystroke || 0,
                hesitationIndicators: answerData.comprehensiveMetrics.cognitiveMetrics?.hesitationIndicators || 0,
                confidenceScore: answerData.comprehensiveMetrics.cognitiveMetrics?.confidenceScore || 0,
                stressIndicators: answerData.comprehensiveMetrics.cognitiveMetrics?.stressIndicators || 0,
                
                // Interface usage
                sidebarToggleCount: answerData.comprehensiveMetrics.interfaceUsage?.sidebarToggleCount || 0,
                modalOpenCount: answerData.comprehensiveMetrics.interfaceUsage?.modalOpenCount || 0,
                scrollEvents: answerData.comprehensiveMetrics.interfaceUsage?.scrollEvents || 0,
                rightClickCount: answerData.comprehensiveMetrics.interfaceUsage?.rightClickCount || 0,
                
                // Academic integrity indicators
                suspiciousTypingSpeed: answerData.comprehensiveMetrics.academicIntegrityMetrics?.suspiciousPatterns?.unusualTypingSpeed || false,
                pasteFromExternal: answerData.comprehensiveMetrics.academicIntegrityMetrics?.suspiciousPatterns?.pasteFromExternal || false,
                devToolsOpened: answerData.comprehensiveMetrics.interfaceUsage?.devToolsOpened || false,
                tabSwitches: answerData.comprehensiveMetrics.academicIntegrityMetrics?.attentionMetrics?.tabSwitches || 0,
                windowBlurEvents: answerData.comprehensiveMetrics.academicIntegrityMetrics?.attentionMetrics?.windowBlurEvents || 0,
                focusScore: answerData.comprehensiveMetrics.academicIntegrityMetrics?.attentionMetrics?.focusScore || 1.0,
                
                // Device and technical info
                deviceInfo: answerData.comprehensiveMetrics.technicalMetrics?.deviceInfo || {},
                performanceMetrics: answerData.comprehensiveMetrics.technicalMetrics?.performanceMetrics || {}
            } : null,
            
            isAutoSave: answerData.isAutoSave || false, // whether this is an auto-save
            submittedAt: new Date(),
            startTime: answerData.startTime,
            endTime: answerData.endTime
        };
        
        // Always use upsert to prevent duplicate answers for the same question
        const existingAnswer = await db.collection("examAnswers").findOne({
            examId,
            questionIndex
        });
        
        if (existingAnswer) {
            // Update existing answer (regardless of whether it's auto-save or final submission)
            const result = await db.collection("examAnswers").updateOne(
                { _id: existingAnswer._id },
                { $set: examAnswer }
            );
            return { answerId: existingAnswer._id, ...examAnswer };
        } else {
            // Insert new answer if none exists
            const result = await db.collection("examAnswers").insertOne(examAnswer);
            return { answerId: result.insertedId, ...examAnswer };
        }
    },

    getExamAnswers: async (examId) => {
        const db = await getDatabase();
        const answers = await db.collection("examAnswers").find({ examId }).sort({ questionIndex: 1 }).toArray();
        return answers;
    },

    getExamQuestions: async (difficulty = null, limit = 10) => {
        const db = await getDatabase();
        
        let query = {};
        if (difficulty) {
            query.difficulty = difficulty;
        }
        
        const exercises = await db.collection("questions").find(query).toArray();
        
        // Shuffle and return limited questions
        const shuffled = exercises.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, limit);
    },

    getNextExamQuestion: async (currentDifficulty, examId, questionIndex) => {
        const db = await getDatabase();
        
        try {
            // First, let's check how many questions of each difficulty we have in total
            const totalCounts = await Promise.all([
                db.collection("questions").countDocuments({ difficulty: 'easy' }),
                db.collection("questions").countDocuments({ difficulty: 'medium' }),
                db.collection("questions").countDocuments({ difficulty: 'hard' }),
                db.collection("questions").countDocuments({ difficulty: 'algebra' })
            ]);
            
            console.log(`📊 Total questions in DB: easy=${totalCounts[0]}, medium=${totalCounts[1]}, hard=${totalCounts[2]}, algebra=${totalCounts[3]}`);
            
            // Get questions already used in this exam session
            const usedAnswers = await db.collection("examAnswers")
                .find({ examId: examId })
                .toArray();
            
            const usedQuestionIds = usedAnswers.map(answer => answer.questionId);
            
            console.log(`🔒 Used questions in exam ${examId}: ${usedQuestionIds.length} questions`);
            console.log(`🔒 Used question IDs: [${usedQuestionIds.join(', ')}]`);
            console.log(`🎯 Looking for ${currentDifficulty} question for position ${questionIndex}`);
            
            // Get questions of the specified difficulty that haven't been used
            // Note: Filter by 'id' field (not '_id') because usedQuestionIds contains numeric IDs from exam answers
            let availableQuestions = await db.collection("questions").find({ 
                difficulty: currentDifficulty,
                approved: true, // Only use approved questions for exams
                ...(usedQuestionIds.length > 0 ? { id: { $nin: usedQuestionIds } } : {})
            }).toArray();
            
            console.log(`✅ Available ${currentDifficulty} questions after duplicate filtering: ${availableQuestions.length}`);
            
            // If no available questions of this difficulty (shouldn't happen with proper question pool)
            if (availableQuestions.length === 0) {
                console.warn(`⚠️ No available ${currentDifficulty} questions for exam ${examId}, trying without duplicate filter`);
                availableQuestions = await db.collection("questions").find({ 
                    difficulty: currentDifficulty,
                    approved: true // Only use approved questions for exams
                }).toArray();
                
                console.log(`🔄 Total ${currentDifficulty} questions (ignoring duplicates): ${availableQuestions.length}`);
                
                if (availableQuestions.length === 0) {
                    // Final fallback to any difficulty
                    console.error(`❌ No questions found for difficulty ${currentDifficulty}, using fallback to easy`);
                    availableQuestions = await db.collection("questions").find({ difficulty: 'easy', approved: true }).toArray();
                    if (availableQuestions.length === 0) {
                        console.error(`❌ CRITICAL: No approved questions found at all! Using any approved question`);
                        availableQuestions = await db.collection("questions").find({ approved: true }).toArray();
                    }
                }
            }
            
            // Select random question from available pool
            const selectedQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
            
            console.log(`🎯 SELECTED: Question ${selectedQuestion._id} (${selectedQuestion.difficulty}) for exam ${examId}, position ${questionIndex}`);
            console.log(`📈 Stats - Used: ${usedQuestionIds.length}, Available: ${availableQuestions.length}, Requested: ${currentDifficulty}, Actual: ${selectedQuestion.difficulty}`);
            
            return selectedQuestion;
            
        } catch (error) {
            console.error('Error in getNextExamQuestion:', error);
            // Fallback to original behavior if error occurs
            const questionsOfDifficulty = await db.collection("questions").find({ difficulty: currentDifficulty, approved: true }).toArray();
            return questionsOfDifficulty[Math.floor(Math.random() * questionsOfDifficulty.length)];
        }
    },

    completeExamSession: async (examId, finalScore) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        const result = await db.collection("examSessions").updateOne(
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
        const db = await getDatabase();
        const examSessions = await db.collection("examSessions")
            .find({ studentEmail })
            .sort({ startTime: -1 })
            .toArray();
        return examSessions;
    },

    // Security functions for exam access control
    getActiveExamSession: async (studentId) => {
        const db = await getDatabase();
        // Look for active session (in_progress status) for this student
        const activeSession = await db.collection("examSessions").findOne({ 
            studentId: studentId,
            status: 'in_progress'
        });
        return activeSession;
    },

    // NEW: Get pre-configured exam session for a student
    getPreConfiguredExamSession: async (studentId) => {
        const db = await getDatabase();
        // Look for pre-configured session for this student
        const preConfiguredSession = await db.collection("examSessions").findOne({ 
            studentId: studentId,
            isPreConfigured: true
        });
        return preConfiguredSession;
    },

    // NEW: Activate a pre-configured exam session
    activatePreConfiguredExamSession: async (examId, studentEmail, clientIp, browserFingerprint) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        // Update the pre-configured session to start the exam
        const updateData = {
            startTime: new Date(),
            status: 'in_progress',
            studentEmail: studentEmail,
            clientIp: clientIp,
            browserFingerprint: browserFingerprint,
            accessAttempts: [{
                timestamp: new Date(),
                clientIp: clientIp,
                browserFingerprint: browserFingerprint,
                success: true
            }],
            lastUpdated: new Date()
        };
        
        await db.collection("examSessions").updateOne(
            { _id: new ObjectId(examId) },
            { $set: updateData }
        );
        
        // Get the updated session
        const updatedSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
        
        return {
            examId: updatedSession._id,
            studentEmail: updatedSession.studentEmail,
            examTitle: updatedSession.examTitle,
            startTime: updatedSession.startTime,
            totalQuestions: updatedSession.totalQuestions,
            currentQuestionIndex: updatedSession.currentQuestionIndex,
            studentId: updatedSession.studentId,
            studentName: updatedSession.studentName,
            questions: updatedSession.questions // Include pre-configured questions
        };
    },

    // Check if student has already completed any exam (for one-time restriction)
    hasStudentCompletedExam: async (studentId) => {
        const db = await getDatabase();
        // Look for any completed exam session for this student
        const completedSession = await db.collection("examSessions").findOne({ 
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
        const db = await getDatabase();
        const answers = await db.collection("examAnswers").find({ examId }).toArray();
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
        const db = await getDatabase();
        
        // First check if questions collection exists and has data
        const questionsCount = await db.collection("questions").countDocuments();
        
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
            await db.collection("questions").insertMany(exercisesWithApprovalStatus);
            return exercisesWithApprovalStatus;
        }
        
        // Ensure all existing questions have approval fields
        await db.collection("questions").updateMany(
            { approved: { $exists: false } },
            { 
                $set: { 
                    approved: false,
                    approvedAt: null
                }
            }
        );

        const questions = await db.collection("questions").find({}).sort({ id: 1 }).toArray();
        return questions;
    },

    deleteQuestion: async (questionId) => {
        const db = await getDatabase();
        const result = await db.collection("questions").deleteOne({ id: parseInt(questionId) });
        return result;
    },

    approveQuestion: async (questionId, approvedBy = 'Unknown') => {
        const db = await getDatabase();
        
        console.log('Approving question with ID:', questionId, 'by:', approvedBy);
        
        // First get the question to check its difficulty
        const question = await db.collection("questions").findOne({ id: parseInt(questionId) });
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
        
        const result = await db.collection("questions").updateOne(
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
        const updatedQuestion = await db.collection("questions").findOne({ id: parseInt(questionId) });
        console.log('Updated question:', updatedQuestion);
        
        return result;
    },

    getQuestion: async (questionId) => {
        const db = await getDatabase();
        const question = await db.collection("questions").findOne({ id: parseInt(questionId) });
        return question;
    },

    addQuestion: async (questionData) => {
        const db = await getDatabase();
        
        // Get the next available ID
        const lastQuestion = await db.collection("questions").findOne({}, { sort: { id: -1 } });
        const nextId = lastQuestion ? lastQuestion.id + 1 : 1;
        
        const newQuestion = {
            id: nextId,
            ...questionData,
            createdAt: new Date(),
            approved: false
        };
        
        const result = await db.collection("questions").insertOne(newQuestion);
        return { questionId: result.insertedId, ...newQuestion };
    },

    updateQuestion: async (questionId, updates) => {
        const db = await getDatabase();
        const result = await db.collection("questions").updateOne(
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
        const db = await getDatabase();
        const approvedQuestions = await db.collection("questions")
            .find({ approved: true })
            .sort({ approvedAt: -1 })
            .toArray();
        
        return approvedQuestions;
    },

    // Extra time management functions
    uploadExtraTimeRecords: async (records, uploadedBy = 'admin') => {
        const db = await getDatabase();
        const extraTimeCollection = db.collection("extraTime");
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
        const db = await getDatabase();
        const extraTimeRecord = await db.collection("extraTime").findOne({ studentId });
        return extraTimeRecord || { studentId, percentage: 0, hasExtraTime: false };
    },

    getAllExtraTimeRecords: async () => {
        const db = await getDatabase();
        const records = await db.collection("extraTime").find({}).sort({ createdAt: -1 }).toArray();
        return records;
    },

    // Exam grading functions
    getAllExamSessions: async () => {
        const db = await getDatabase();
        const examSessions = await db.collection("examSessions")
            .find({})
            .sort({ startTime: -1 })
            .toArray();
        
        // Check which exams have been graded
        const gradedExams = await db.collection("examGrades").find({}).toArray();
        const gradedExamIds = gradedExams.map(grade => grade.examId.toString());
        
        // Add graded status to exam sessions and normalize status
        const sessionsWithGradingStatus = examSessions.map(session => ({
            ...session,
            status: (session.status || '').toLowerCase().trim(),
            graded: gradedExamIds.includes(session._id.toString())
        }));
        
        return sessionsWithGradingStatus;
    },

    // FinalExams collection methods
    getAllFinalExams: async (limit = 100, skip = 0) => {
        const db = await getDatabase();
        

        
        // Only fetch essential fields for listing to reduce memory usage
        const finalExams = await db.collection("finalExams")
            .find({}, {
                projection: {
                    studentId: 1,
                    studentName: 1,
                    studentEmail: 1,
                    startTime: 1,
                    endTime: 1,
                    status: 1,
                    totalQuestions: 1,
                    score: 1,
                    'statistics.totalQuestions': 1,
                    'statistics.answeredQuestions': 1,
                    'statistics.averageScore': 1,
                    'retakeInfo.hasRetake': 1,
                    'retakeInfo.improvementAnalysis': 1
                }
            })
            .limit(limit)
            .skip(skip)
            .toArray();
        
        // Check which exams have been graded
        const examIds = finalExams.map(exam => exam._id.toString());
        const gradedExams = await db.collection("examGrades")
            .find({ examId: { $in: examIds } }, { projection: { examId: 1 } })
            .toArray();
        const gradedExamIds = gradedExams.map(grade => grade.examId.toString());
        
        // Add graded status to final exams and normalize status
        const examsWithGradingStatus = finalExams.map(exam => ({
            ...exam,
            status: (exam.status || '').toLowerCase().trim(),
            graded: gradedExamIds.includes(exam._id.toString())
        }));
        
        // Sort in JavaScript (more memory efficient for smaller result set)
        examsWithGradingStatus.sort((a, b) => {
            const aTime = new Date(a.startTime || 0).getTime();
            const bTime = new Date(b.startTime || 0).getTime();
            return bTime - aTime; // Descending order (newest first)
        });
        
        return examsWithGradingStatus;
    },

    getFinalExamsCount: async () => {
        const db = await getDatabase();
        return await db.collection("finalExams").countDocuments({});
    },

    getFinalExamForGrading: async (examId) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        const finalExam = await db.collection("finalExams").findOne({ _id: new ObjectId(examId) });
        
        if (!finalExam) {
            throw new Error('Final exam not found');
        }
        
        const answers = finalExam.mergedAnswers || [];
        
        // Load deleted questions from examGrades collection
        let deletedQuestions = [];
        try {
            const existingGrade = await db.collection("examGrades").findOne({ examId });
            if (existingGrade && existingGrade.deletedQuestions) {
                deletedQuestions = existingGrade.deletedQuestions;
            }
        } catch (err) {
            console.log('No previous grade data found for deleted questions');
        }
        
        // Filter out deleted questions from answers
        const filteredAnswers = answers.filter(answer => 
            !deletedQuestions.includes(answer.questionIndex)
        );
        
        // Get questions details for each remaining answer (resilient version for deadline)
        const questionsWithAnswers = await Promise.all(
            filteredAnswers.map(async (answer) => {
                let question = null;
                try {
                    // Try multiple ways to find the question
                    if (answer.questionId) {
                        question = await db.collection("questions").findOne({ id: parseInt(answer.questionId) });
                        if (!question) {
                            question = await db.collection("questions").findOne({ _id: answer.questionId });
                        }
                        if (!question) {
                            question = await db.collection("questions").findOne({ id: answer.questionId.toString() });
                        }
                    }
                } catch (err) {
                    console.log(`Warning: Could not find question for answer with questionId: ${answer.questionId}`);
                }
                
                // Add metadata about the source of this answer
                const enhancedAnswer = {
                    ...answer,
                    questionDetails: question || null
                };
                
                // If this answer has both original and retake data, add comparison info
                if (answer.sourceSession === 'both' && answer.originalAnswer && answer.retakeAnswer) {
                    enhancedAnswer.hasMultipleAttempts = true;
                    enhancedAnswer.originalAttempt = answer.originalAnswer;
                    enhancedAnswer.retakeAttempt = answer.retakeAnswer;
                    enhancedAnswer.improved = answer.retakeAnswer.isCorrect && !answer.originalAnswer.isCorrect;
                    enhancedAnswer.degraded = !answer.retakeAnswer.isCorrect && answer.originalAnswer.isCorrect;
                }
                
                return enhancedAnswer;
            })
        );
        
        // Add summary statistics for grading interface (excluding deleted questions)
        const gradingSummary = {
            totalQuestions: questionsWithAnswers.length,
            originalQuestions: finalExam.originalAnswersCount || 0,
            retakeQuestions: finalExam.retakeAnswersCount || 0,
            questionsWithMultipleAttempts: questionsWithAnswers.filter(q => q.hasMultipleAttempts).length,
            improved: questionsWithAnswers.filter(q => q.improved).length,
            degraded: questionsWithAnswers.filter(q => q.degraded).length,
            originalScore: finalExam.originalScore || 0,
            retakeScore: finalExam.retakeScore || 0,
            combinedScore: finalExam.score || 0,
            deletedQuestions: deletedQuestions // Include info about deleted questions
        };
        
        return {
            session: {
                _id: finalExam._id,
                studentEmail: finalExam.email,
                studentName: finalExam.studentName,
                studentId: finalExam.studentId,
                startTime: finalExam.startTime,
                endTime: finalExam.endTime,
                status: finalExam.status,
                totalQuestions: questionsWithAnswers.length, // Updated count after filtering
                score: finalExam.score
            },
            answers: questionsWithAnswers,
            gradingSummary,
            deletedQuestions // Include for frontend reference
        };
    },

    initializeFinalExamsCollection: async () => {
        const db = await getDatabase();
        const fs = require('fs');
        const path = require('path');
        
        try {
            // Check if finalExams collection is empty
            const count = await db.collection("finalExams").countDocuments();
            
            if (count === 0) {
                console.log('Initializing finalExams collection from JSON file...');
                
                // Read finalExams.json file
                const filePath = path.join(__dirname, '..', 'finalExams.json');
                const finalExamsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Convert string _id to ObjectId for proper database storage
                const { ObjectId } = require('mongodb');
                const finalExamsWithObjectIds = finalExamsData.map(exam => ({
                    ...exam,
                    _id: new ObjectId(exam._id),
                    originalSessionId: exam.originalSessionId ? new ObjectId(exam.originalSessionId) : null,
                    retakeSessionId: exam.retakeSessionId ? new ObjectId(exam.retakeSessionId) : null
                }));
                
                // Insert into database
                const result = await db.collection("finalExams").insertMany(finalExamsWithObjectIds);
                console.log(`Inserted ${result.insertedCount} final exam records`);
                
                return { success: true, inserted: result.insertedCount };
            } else {
                console.log(`FinalExams collection already has ${count} records`);
                return { success: true, inserted: 0, message: 'Collection already initialized' };
            }
        } catch (error) {
            console.error('Error initializing finalExams collection:', error);
            throw error;
        }
    },

    getExamForGrading: async (examId) => {
        return await executeWithRetry(async () => {
            const db = await getDatabase();
            const { ObjectId } = require('mongodb');
            
            // Get exam session
            const examSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
            if (!examSession) {
                return null;
            }
            
            // Get all answers for this exam
            const answers = await db.collection("examAnswers").find({ examId }).sort({ questionIndex: 1 }).toArray();
            
            // Get questions details for each answer
            const questionsWithAnswers = await Promise.all(
                answers.map(async (answer) => {
                    const question = await db.collection("questions").findOne({ id: parseInt(answer.questionId) });
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
        }, `getExamForGrading (examId: ${examId})`);
    },

    saveExamGrade: async (examId, gradeData) => {
        const db = await getDatabase();
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
            deletedQuestions: gradeData.deletedQuestions || [], // Track deleted questions
            isGraded: true
        };
        
        // If there are deleted questions, remove them from the exam answers
        if (gradeData.deletedQuestions && gradeData.deletedQuestions.length > 0) {
            try {
                // Try updating finalExams collection first (note: lowercase 'f')
                await db.collection("finalExams").updateOne(
                    { _id: new ObjectId(examId) },
                    { 
                        $pull: { 
                            mergedAnswers: { 
                                questionIndex: { $in: gradeData.deletedQuestions } 
                            } 
                        },
                        $set: { lastUpdated: new Date() }
                    }
                );
                
                // Also try updating regular exam collections if they exist
                await db.collection("examSessions").updateOne(
                    { _id: new ObjectId(examId) },
                    { 
                        $pull: { 
                            answers: { 
                                questionIndex: { $in: gradeData.deletedQuestions } 
                            } 
                        },
                        $set: { lastUpdated: new Date() }
                    }
                );
            } catch (error) {
                console.log('Note: Could not update exam answers (exam may not exist in expected collections):', error.message);
            }
        }
        
        // Check if grade already exists
        const existingGrade = await db.collection("examGrades").findOne({ examId });
        let result;
        if (existingGrade) {
            // Update existing grade
            result = await db.collection("examGrades").updateOne(
                { examId },
                { $set: examGrade }
            );
        } else {
            // Insert new grade
            result = await db.collection("examGrades").insertOne(examGrade);
        }
        // --- NEW: Update score in finalExams and examSessions ---
        // Calculate the sum of all non-deleted question grades
        const nonDeletedGrades = (gradeData.questionGrades || []).filter(qg =>
            !(gradeData.deletedQuestions || []).includes(qg.questionIndex)
        );
        const newScore = nonDeletedGrades.reduce((sum, qg) => sum + (qg.score || 0), 0);
        // Update finalExams
        await db.collection("finalExams").updateOne(
            { _id: new ObjectId(examId) },
            { $set: { score: newScore } }
        );
        // Update examSessions (if exists)
        await db.collection("examSessions").updateOne(
            { _id: new ObjectId(examId) },
            { $set: { score: newScore } }
        );
        // --- END NEW ---
        if (existingGrade) {
            return { gradeId: existingGrade._id, ...examGrade, updated: true };
        } else {
            return { gradeId: result.insertedId, ...examGrade, updated: false };
        }
    },

    getExamGrade: async (examId) => {
        const db = await getDatabase();
        const grade = await db.collection("examGrades").findOne({ examId });
        return grade;
    },

    getAllExamGrades: async () => {
        const db = await getDatabase();
        const grades = await db.collection("examGrades")
            .find({})
            .sort({ gradedAt: -1 })
            .toArray();
        
        return grades;
    },

    deleteExtraTimeRecord: async (studentId) => {
        const db = await getDatabase();
        const result = await db.collection("extraTime").deleteOne({ studentId });
        return result;
    },

    getAllExamAnswers: async () => {
        const db = await getDatabase();
        const answers = await db.collection("examAnswers")
            .find({})
            .sort({ submittedAt: -1 })
            .toArray();
        return answers;
    },

    // Grade by Question functions
    getQuestionsWithAnswers: async () => {
        const db = await getDatabase();
        
        // Get all approved questions that have been used in exams
        const questions = await db.collection("questions")
            .find({ approved: true })
            .sort({ id: 1 })
            .toArray();
        
        // For each question, count how many answers exist
        const questionsWithCounts = await Promise.all(
            questions.map(async (question) => {
                const answerCount = await db.collection("examAnswers")
                    .countDocuments({ 
                        $or: [
                            { questionId: question.id.toString() },
                            { questionId: question.id }
                        ]
                    });
                
                return {
                    ...question,
                    answerCount
                };
            })
        );
        
        return questionsWithCounts;
    },

    // OPTIMIZED: Get questions with pagination and bulk answer counting
    getQuestionsWithAnswersOptimized: async (page = 1, limit = 10, filters = {}) => {
        const db = await getDatabase();
        const skip = (page - 1) * limit;
        
        console.log(`🚀 Optimized query: page ${page}, limit ${limit}, skip ${skip}`);
        
        // Build query for questions based on filters
        let questionsQuery = { approved: true };
        
        if (filters.search) {
            questionsQuery.question = { $regex: filters.search, $options: 'i' };
        }
        
        if (filters.difficulty && filters.difficulty !== 'all') {
            questionsQuery.difficulty = filters.difficulty;
        }
        
        // Support for fetching specific question by ID
        if (filters.questionId) {
            questionsQuery.id = filters.questionId;
        }
        
        // Get total count for pagination
        const totalQuestions = await db.collection("questions").countDocuments(questionsQuery);
        
        // Get questions with pagination
        const questions = await db.collection("questions")
            .find(questionsQuery)
            .sort({ id: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        if (questions.length === 0) {
            return {
                questions: [],
                totalQuestions: 0,
                totalPages: 0,
                currentPage: page,
                hasMore: false
            };
        }
        
        // Get ALL question IDs for bulk answer counting (more efficient than individual queries)
        const questionIds = questions.map(q => q.id);
        console.log(`📊 Bulk counting UNIQUE STUDENTS for ${questionIds.length} questions:`, questionIds);
        
        // BULK query to get answer counts for all questions at once from examSessions (מועד ב)
        const answerCounts = await db.collection("examSessions").aggregate([
            { $match: { answers: { $exists: true, $ne: [] } } },
            { $unwind: "$answers" },
            { 
                $match: { 
                    "answers.questionId": { $in: questionIds.map(id => id.toString()) }
                }
            },
            {
                $group: {
                    _id: {
                        questionId: "$answers.questionId",
                        studentEmail: "$studentEmail"
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.questionId",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();
        
        // Convert to lookup map for O(1) access
        const answerCountMap = new Map();
        answerCounts.forEach(result => {
            const questionId = parseInt(result._id) || result._id;
            answerCountMap.set(questionId, result.count);
        });
        
        // BULK query to get grading status for all questions at once from examGrades (מועד ב)
        let gradingStatusMap = new Map();
        if (filters.includeGradingStatus) {
            // For מועד ב (regular questions), check examGrades collection for graded answers
            // The examGrades collection stores grades for examSessions
            const gradingStats = await db.collection("examGrades").aggregate([
                { $match: { questionGrades: { $exists: true, $ne: [] } } },
                { $unwind: "$questionGrades" },
                { 
                    $match: { 
                        $or: [
                            { "questionGrades.questionId": { $in: questionIds.map(id => id.toString()) } },
                            { "questionGrades.questionIndex": { $in: questionIds } }
                        ]
                    }
                },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $ne: ["$questionGrades.questionId", null] },
                                "$questionGrades.questionId",
                                "$questionGrades.questionIndex"
                            ]
                        },
                        gradedCount: { $sum: 1 }
                    }
                }
            ]).toArray();
            
            gradingStats.forEach(stat => {
                const questionId = parseInt(stat._id) || stat._id;
                const totalAnswers = answerCountMap.get(questionId) || 0;
                const gradedCount = stat.gradedCount || 0;
                gradingStatusMap.set(questionId, {
                    gradedCount: gradedCount,
                    ungradedCount: Math.max(0, totalAnswers - gradedCount),
                    isCompleted: gradedCount > 0 && gradedCount >= totalAnswers && totalAnswers > 0
                });
            });
        }
        
        // Combine results efficiently
        const questionsWithCounts = questions.map(question => {
            const answerCount = answerCountMap.get(question.id) || 0;
            const gradingStatus = gradingStatusMap.get(question.id) || {
                gradedCount: 0,
                ungradedCount: answerCount,
                isCompleted: false
            };
            
            // Calculate completion percentage and completion status based on actual grading
            const completionPercentage = answerCount > 0 ? Math.round((gradingStatus.gradedCount / answerCount) * 100) : 0;
            const isCompleted = gradingStatus.gradedCount > 0 && gradingStatus.gradedCount >= answerCount && answerCount > 0;
            
            return {
                ...question,
                answerCount,
                gradedCount: gradingStatus.gradedCount,
                ungradedCount: gradingStatus.ungradedCount,
                completionPercentage,
                isCompleted
            };
        });
        
        // Apply grading status filter if specified
        let filteredQuestions = questionsWithCounts;
        if (filters.gradingStatus && filters.gradingStatus !== 'all') {
            filteredQuestions = questionsWithCounts.filter(q => {
                switch (filters.gradingStatus) {
                    case 'completed':
                        return q.isCompleted;
                    case 'partial':
                        return q.gradedCount > 0 && !q.isCompleted;
                    case 'ungraded':
                        return q.gradedCount === 0;
                    default:
                        return true;
                }
            });
        }
        
        const totalPages = Math.ceil(totalQuestions / limit);
        
        console.log(`✅ Optimized query complete: ${filteredQuestions.length} questions, ${totalPages} total pages`);
        
        return {
            questions: filteredQuestions,
            totalQuestions,
            totalPages,
            currentPage: page,
            hasMore: page < totalPages
        };
    },

    // OPTIMIZED: Get question answers with pagination
    getQuestionAnswersOptimized: async (questionId, page = 1, limit = 20) => {
        const db = await getDatabase();
        const skip = (page - 1) * limit;
        
        console.log(`🔄 Optimized answer fetch for question ${questionId}, page ${page}, limit ${limit}`);
        
        // Get the question details first
        const question = await db.collection("questions").findOne({ id: parseInt(questionId) });
        if (!question) {
            return null;
        }
        
        // Get total count of answers for this question
        const totalAnswers = await db.collection("finalExams").aggregate([
            { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
            { $unwind: "$mergedAnswers" },
            { 
                $match: { 
                    $or: [
                        { "mergedAnswers.questionId": questionId.toString() },
                        { "mergedAnswers.questionId": parseInt(questionId) },
                        { "mergedAnswers.questionDetails.id": parseInt(questionId) }
                    ]
                }
            },
            { $count: "total" }
        ]).toArray();
        
        const total = totalAnswers.length > 0 ? totalAnswers[0].total : 0;
        
        // Get paginated answers
        const finalExamsWithAnswers = await db.collection("finalExams").aggregate([
            { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
            { $unwind: "$mergedAnswers" },
            { 
                $match: { 
                    $or: [
                        { "mergedAnswers.questionId": questionId.toString() },
                        { "mergedAnswers.questionId": parseInt(questionId) },
                        { "mergedAnswers.questionDetails.id": parseInt(questionId) }
                    ]
                }
            },
            { 
                $project: {
                    _id: 1,
                    studentEmail: 1,
                    studentName: 1,
                    studentId: 1,
                    startTime: 1,
                    endTime: 1,
                    status: 1,
                    answer: "$mergedAnswers",
                    graded: 1,
                    review: 1
                }
            },
            { $sort: { "answer.timestamp": -1 } },
            { $skip: skip },
            { $limit: limit }
        ]).toArray();
        
        // Process answers and add grading information
        const answersWithDetails = finalExamsWithAnswers.map((examData) => {
            const answer = examData.answer;
            
            let grade, feedback;
            if (examData.review && examData.review.questionGrades) {
                const questionGrade = examData.review.questionGrades.find(qg => qg.questionIndex === answer.questionIndex);
                if (questionGrade) {
                    grade = questionGrade.score;
                    feedback = questionGrade.feedback;
                }
            }
            
            return {
                examId: examData._id.toString(),
                questionIndex: answer.questionIndex,
                studentAnswer: answer.studentAnswer || answer.answer,
                timeSpent: answer.timeSpent || 0,
                timestamp: answer.timestamp || answer.submittedAt || examData.startTime,
                isCorrect: answer.isCorrect,
                studentEmail: examData.studentEmail,
                studentName: examData.studentName,
                studentId: examData.studentId,
                examStartTime: examData.startTime,
                grade: grade,
                feedback: feedback
            };
        });
        
        // Deduplicate based on student email
        const answerMap = new Map();
        answersWithDetails.forEach(answer => {
            const key = answer.studentEmail;
            const existing = answerMap.get(key);
            
            if (!existing) {
                answerMap.set(key, answer);
            } else {
                const currentTime = new Date(answer.timestamp).getTime();
                const existingTime = new Date(existing.timestamp).getTime();
                
                if (currentTime > existingTime) {
                    answerMap.set(key, answer);
                }
            }
        });
        
        const uniqueAnswers = Array.from(answerMap.values());
        const gradedAnswers = uniqueAnswers.filter(a => a.grade !== undefined);
        const averageGrade = gradedAnswers.length > 0 
            ? gradedAnswers.reduce((sum, a) => sum + a.grade, 0) / gradedAnswers.length 
            : 0;
        
        const totalPages = Math.ceil(total / limit);
        
        console.log(`✅ Optimized answer fetch complete: ${uniqueAnswers.length} unique answers, page ${page}/${totalPages}`);
        
        return {
            question,
            answers: uniqueAnswers,
            totalAnswers: total,
            gradedAnswers: gradedAnswers.length,
            averageGrade,
            pagination: {
                currentPage: page,
                totalPages,
                hasMore: page < totalPages,
                limit
            }
        };
    },

    // Legacy function for backwards compatibility
    getQuestionsWithAnswersFromFinalExams: async () => {
        const db = await getDatabase();
        
        // Get all approved questions
        const questions = await db.collection("questions")
            .find({ approved: true })
            .sort({ id: 1 })
            .toArray();
        
        console.log(`Checking answer counts for ${questions.length} questions`);
        
        // For each question, count answers from FinalExams collection
        const questionsWithCounts = await Promise.all(
            questions.map(async (question) => {
                const answerCount = await db.collection("finalExams").aggregate([
                    { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
                    { $unwind: "$mergedAnswers" },
                    { 
                        $match: { 
                            $or: [
                                { "mergedAnswers.questionId": question.id.toString() },
                                { "mergedAnswers.questionId": question.id },
                                { "mergedAnswers.questionDetails.id": question.id }
                            ]
                        }
                    },
                    { $count: "count" }
                ]).toArray();
                
                const count = answerCount.length > 0 ? answerCount[0].count : 0;
                console.log(`Question ${question.id} has ${count} answers`);
                
                return {
                    ...question,
                    answerCount: count
                };
            })
        );
        
        console.log(`Returning ${questionsWithCounts.length} questions with answer counts`);
        return questionsWithCounts;
    },

    // PAGINATED: Get questions with answers from FinalExams collection with pagination
    getQuestionsWithAnswersFromFinalExamsPaginated: async (page = 1, limit = 10, filters = {}) => {
        const db = await getDatabase();
        const skip = (page - 1) * limit;
        
        console.log(`🚀 Paginated FinalExams query: page ${page}, limit ${limit}, skip ${skip}`);
        
        // Build query for questions based on filters
        let questionsQuery = { approved: true };
        
        if (filters.search) {
            questionsQuery.question = { $regex: filters.search, $options: 'i' };
        }
        
        if (filters.difficulty && filters.difficulty !== 'all') {
            questionsQuery.difficulty = filters.difficulty;
        }
        
        if (filters.questionId) {
            questionsQuery.id = filters.questionId;
        }
        
        // Get total count of matching questions
        const totalQuestions = await db.collection("questions").countDocuments(questionsQuery);
        const totalPages = Math.ceil(totalQuestions / limit);
        
        // Get paginated questions
        const questions = await db.collection("questions")
            .find(questionsQuery)
            .sort({ id: 1 })
            .skip(skip)
            .limit(limit)
            .toArray();
        
        console.log(`Found ${questions.length} questions for page ${page}`);
        
        // For each question, count answers from FinalExams collection
        const questionsWithCounts = await Promise.all(
            questions.map(async (question) => {
                const answerCount = await db.collection("finalExams").aggregate([
                    { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
                    { $unwind: "$mergedAnswers" },
                    { 
                        $match: { 
                            $or: [
                                { "mergedAnswers.questionId": question.id.toString() },
                                { "mergedAnswers.questionId": question.id },
                                { "mergedAnswers.questionDetails.id": question.id }
                            ]
                        }
                    },
                    { $count: "count" }
                ]).toArray();
                
                const count = answerCount.length > 0 ? answerCount[0].count : 0;
                
                // Add grading status information if requested
                let gradedCount = 0;
                let ungradedCount = 0;
                let completionPercentage = 0;
                
                if (filters.includeGradingStatus && count > 0) {
                    // Count graded vs ungraded answers
                    const gradedAnswers = await db.collection("finalExams").aggregate([
                        { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
                        { $unwind: "$mergedAnswers" },
                        { 
                            $match: { 
                                $and: [
                                    {
                                        $or: [
                                            { "mergedAnswers.questionId": question.id.toString() },
                                            { "mergedAnswers.questionId": question.id },
                                            { "mergedAnswers.questionDetails.id": question.id }
                                        ]
                                    },
                                    {
                                        $or: [
                                            { "mergedAnswers.grade": { $exists: true, $ne: null } },
                                            { "review.questionGrades": { $exists: true } }
                                        ]
                                    }
                                ]
                            }
                        },
                        { $count: "count" }
                    ]).toArray();
                    
                    gradedCount = gradedAnswers.length > 0 ? gradedAnswers[0].count : 0;
                    ungradedCount = count - gradedCount;
                    completionPercentage = count > 0 ? Math.round((gradedCount / count) * 100) : 0;
                }
                
                return {
                    ...question,
                    answerCount: count,
                    gradedCount,
                    ungradedCount,
                    completionPercentage,
                    isCompleted: completionPercentage === 100
                };
            })
        );
        
        console.log(`✅ Returning ${questionsWithCounts.length} FinalExams questions with pagination`);
        
        return {
            questions: questionsWithCounts,
            currentPage: page,
            totalPages,
            totalQuestions,
            hasMore: page < totalPages
        };
    },

    // NEW: Get question answers from FinalExams collection
    getQuestionAnswersFromFinalExams: async (questionId) => {
        const db = await getDatabase();
        
        // Get the question details
        const question = await db.collection("questions").findOne({ id: parseInt(questionId) });
        if (!question) {
            return null;
        }
        
        console.log(`Looking for answers to question ${questionId}`);
        
        // First, let's check what format the questionId is stored in
        const sampleExam = await db.collection("finalExams").findOne({ 
            mergedAnswers: { $exists: true, $ne: [] } 
        });
        
        if (sampleExam && sampleExam.mergedAnswers && sampleExam.mergedAnswers.length > 0) {
            console.log(`Sample answer questionId format:`, typeof sampleExam.mergedAnswers[0].questionId, sampleExam.mergedAnswers[0].questionId);
        }
        
        // Comprehensive aggregation pipeline that combines all matching strategies
        const finalExamsWithAnswers = await db.collection("finalExams").aggregate([
            // First, only match documents that have mergedAnswers
            { $match: { mergedAnswers: { $exists: true, $ne: [] } } },
            // Unwind the mergedAnswers array
            { $unwind: "$mergedAnswers" },
            // Match the specific question using all possible formats and strategies
            { 
                $match: { 
                    $or: [
                        // Primary matching strategies
                        { "mergedAnswers.questionId": questionId.toString() },
                        { "mergedAnswers.questionId": parseInt(questionId) },
                        { "mergedAnswers.questionId": questionId }, // In case it's already correct type
                        // Alternative matching strategies
                        { "mergedAnswers.questionDetails.id": parseInt(questionId) },
                        { "mergedAnswers.questionText": { $regex: new RegExp(question.question.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
                    ]
                }
            },
            // Project the fields we need
            { 
                $project: {
                    _id: 1,
                    studentEmail: 1,
                    studentName: 1,
                    studentId: 1,
                    startTime: 1,
                    endTime: 1,
                    status: 1,
                    answer: "$mergedAnswers",
                    graded: 1,
                    review: 1
                }
            },
            // Sort by submission time, newest first
            { $sort: { "answer.timestamp": -1 } }
        ]).toArray();
        
        console.log(`Found ${finalExamsWithAnswers.length} answers for question ${questionId}`);
        
        // Debug: Check for potential duplicates
        if (finalExamsWithAnswers.length > 0) {
            const sampleAnswers = finalExamsWithAnswers.slice(0, 5);
            console.log('Sample answers for duplicate analysis:');
            sampleAnswers.forEach((exam, index) => {
                console.log(`  ${index}: Student=${exam.studentEmail}, QuestionIndex=${exam.answer.questionIndex}, ExamId=${exam._id.toString().slice(-6)}, Timestamp=${exam.answer.timestamp}`);
            });
        }
        
        // Process answers and add grading information
        const answersWithDetails = finalExamsWithAnswers.map((examData) => {
            const answer = examData.answer;
            
            // Get grade information from the exam's review data
            let grade, feedback;
            if (examData.review && examData.review.questionGrades) {
                const questionGrade = examData.review.questionGrades.find(qg => qg.questionIndex === answer.questionIndex);
                if (questionGrade) {
                    grade = questionGrade.score;
                    feedback = questionGrade.feedback;
                }
            }
            
            return {
                examId: examData._id.toString(),
                questionIndex: answer.questionIndex,
                studentAnswer: answer.studentAnswer || answer.answer, // Handle different field names
                timeSpent: answer.timeSpent || 0,
                timestamp: answer.timestamp || answer.submittedAt || examData.startTime,
                isCorrect: answer.isCorrect,
                studentEmail: examData.studentEmail,
                studentName: examData.studentName,
                studentId: examData.studentId,
                examStartTime: examData.startTime,
                grade: grade,
                feedback: feedback
            };
        });
        
        // Remove duplicates based on student email and questionId (not questionIndex!)
        // The same question might have different questionIndex values in different exams
        const answerMap = new Map();
        
        answersWithDetails.forEach(answer => {
            // Use questionId instead of questionIndex for more reliable deduplication
            const key = `${answer.studentEmail}_${questionId}`;
            const existing = answerMap.get(key);
            
            if (!existing) {
                answerMap.set(key, answer);
            } else {
                // Keep the more recent answer
                const currentTime = new Date(answer.timestamp).getTime();
                const existingTime = new Date(existing.timestamp).getTime();
                
                if (currentTime > existingTime) {
                    answerMap.set(key, answer);
                    console.log(`🔄 Replaced duplicate: Student ${answer.studentEmail} had newer submission`);
                } else {
                    console.log(`⏭️ Kept existing: Student ${answer.studentEmail} older submission was better`);
                }
            }
        });
        
        const uniqueAnswers = Array.from(answerMap.values());
        
        // Calculate statistics
        const gradedAnswers = uniqueAnswers.filter(a => a.grade !== undefined);
        const averageGrade = gradedAnswers.length > 0 
            ? gradedAnswers.reduce((sum, a) => sum + a.grade, 0) / gradedAnswers.length 
            : 0;
        
        console.log(`Returning ${uniqueAnswers.length} unique answers, ${gradedAnswers.length} graded`);
        
        return {
            question,
            answers: uniqueAnswers,
            totalAnswers: uniqueAnswers.length,
            gradedAnswers: gradedAnswers.length,
            averageGrade
        };
    },

    getQuestionAnswers: async (questionId, fromDate) => {
        const db = await getDatabase();
        
        // Get the question details
        const question = await db.collection("questions").findOne({ id: parseInt(questionId) });
        if (!question) {
            return null;
        }
        
        // Build base query for this question (support both string and number formats)
        const baseQuery = {
            $or: [
                { questionId: questionId.toString() },
                { questionId: parseInt(questionId) }
            ]
        };

        // Apply date filter if provided
        const query = fromDate
            ? { 
                ...baseQuery,
                submittedAt: { $gte: new Date(fromDate) }
              }
            : baseQuery;

        // Get all exam answers for this question, optionally filtered by date
        const answers = await db.collection("examAnswers")
            .find(query)
            .sort({ submittedAt: -1 })
            .toArray();
        
        // Get exam session details for each answer
        const answersWithDetails = await Promise.all(
            answers.map(async (answer) => {
                const examSession = await db.collection("examSessions").findOne({ _id: new (require('mongodb')).ObjectId(answer.examId) });
                
                // Get any existing grade for this answer
                const existingGrade = await db.collection("examGrades").findOne({ examId: answer.examId });
                const questionGrade = existingGrade?.questionGrades?.find(qg => qg.questionIndex === answer.questionIndex);
                
                return {
                    ...answer,
                    studentEmail: examSession?.studentEmail,
                    studentName: examSession?.studentName,
                    studentId: examSession?.studentId,
                    examStartTime: examSession?.startTime,
                    grade: questionGrade?.score,
                    feedback: questionGrade?.feedback
                };
            })
        );
        
        // Calculate statistics
        const gradedAnswers = answersWithDetails.filter(a => a.grade !== undefined);
        const averageGrade = gradedAnswers.length > 0 
            ? gradedAnswers.reduce((sum, a) => sum + a.grade, 0) / gradedAnswers.length 
            : 0;
        
        return {
            question,
            answers: answersWithDetails,
            totalAnswers: answersWithDetails.length,
            gradedAnswers: gradedAnswers.length,
            averageGrade
        };
    },

    // NEW: Update answer grade in FinalExams collection
    updateAnswerGradeInFinalExams: async (examId, questionIndex, grade, feedback) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        console.log(`🔄 Updating grade for exam ${examId}, question ${questionIndex}, grade ${grade}`);
        
        // Try to find the exam in finalExams first
        let finalExam = await db.collection("finalExams").findOne({ _id: new ObjectId(examId) });
        
        if (!finalExam) {
            console.log(`📋 Exam not found in finalExams, checking examSessions...`);
            
            // Try to find in examSessions (regular exams)
            const examSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
            if (!examSession) {
                throw new Error('Exam not found in either finalExams or examSessions');
            }
            
            console.log(`✅ Found exam in examSessions collection, using examGrades`);
            
            // For regular exams, use the examGrades collection
            const result = await module.exports.updateAnswerGrade(examId, questionIndex, grade, feedback);
            console.log(`✅ Updated regular exam grade via examGrades collection`);
            return result;
        }
        
        // Check if this is a true final exam (has mergedAnswers) or a regular exam that happens to be in finalExams
        console.log(`📊 Exam structure check:`);
        console.log(`   Has mergedAnswers: ${!!finalExam.mergedAnswers} (${finalExam.mergedAnswers?.length || 0} items)`);
        console.log(`   Has answers: ${!!finalExam.answers} (${finalExam.answers?.length || 0} items)`);
        
        const isActualFinalExam = finalExam.mergedAnswers && finalExam.mergedAnswers.length > 0;
        
        if (!isActualFinalExam) {
            console.log(`✅ Found exam in finalExams but no mergedAnswers - treating as regular exam, using examGrades`);
            
            // This exam is in finalExams collection but has no mergedAnswers, so treat it as regular exam
            const result = await module.exports.updateAnswerGrade(examId, questionIndex, grade, feedback);
            console.log(`✅ Updated regular exam grade via examGrades collection`);
            return result;
        }
        
        console.log(`✅ Found true final exam in finalExams collection with mergedAnswers`);
        
        // Initialize review object if it doesn't exist
        if (!finalExam.review) {
            finalExam.review = {
                questionGrades: [],
                totalScore: 0,
                maxScore: 0,
                percentage: 0,
                feedback: '',
                gradedBy: 'admin',
                gradedAt: new Date(),
                isGraded: false
            };
        }
        
        if (!finalExam.review.questionGrades) {
            finalExam.review.questionGrades = [];
        }
        
        // Update or add the question grade
        const existingGradeIndex = finalExam.review.questionGrades.findIndex(qg => qg.questionIndex === questionIndex);
        const questionGrade = {
            questionIndex,
            score: grade,
            maxScore: 1, // Default, will be updated based on question details
            feedback: feedback || '',
            gradedAt: new Date()
        };
        
        // Get question details to set maxScore
        if (finalExam.mergedAnswers) {
            const answer = finalExam.mergedAnswers.find(a => a.questionIndex === questionIndex);
            if (answer && answer.questionDetails && answer.questionDetails.points) {
                questionGrade.maxScore = answer.questionDetails.points;
                console.log(`✅ Using question points from mergedAnswers: ${answer.questionDetails.points} for question ${questionIndex}`);
            } else if (answer && answer.questionId) {
                // If questionDetails.points is missing, fetch from questions collection
                console.log(`⚠️ Missing questionDetails.points for question ${questionIndex}, fetching from questions collection...`);
                try {
                    const questionFromDB = await db.collection("questions").findOne({ id: parseInt(answer.questionId) });
                    if (questionFromDB && questionFromDB.points) {
                        questionGrade.maxScore = questionFromDB.points;
                        console.log(`✅ Retrieved question points from database: ${questionFromDB.points} for question ${questionIndex}`);
                    } else {
                        console.log(`⚠️ No points found in database for questionId ${answer.questionId}, defaulting to 1`);
                    }
                } catch (error) {
                    console.error(`❌ Error fetching question ${answer.questionId} from database:`, error);
                }
            } else {
                console.log(`⚠️ No answer found for questionIndex ${questionIndex} or missing questionId, defaulting maxScore to 1`);
            }
        }
        
        if (existingGradeIndex >= 0) {
            finalExam.review.questionGrades[existingGradeIndex] = questionGrade;
        } else {
            finalExam.review.questionGrades.push(questionGrade);
        }
        
        // Recalculate totals
        finalExam.review.totalScore = finalExam.review.questionGrades.reduce((sum, qg) => sum + qg.score, 0);
        finalExam.review.maxScore = finalExam.review.questionGrades.reduce((sum, qg) => sum + qg.maxScore, 0);
        finalExam.review.percentage = finalExam.review.maxScore > 0 ? Math.round((finalExam.review.totalScore / finalExam.review.maxScore) * 100) : 0;
        
        // Mark as graded if all questions have grades
        const totalQuestions = finalExam.mergedAnswers ? finalExam.mergedAnswers.length : 0;
        finalExam.review.isGraded = finalExam.review.questionGrades.length >= totalQuestions;
        finalExam.graded = finalExam.review.isGraded;
        
        // Update the final exam in database
        await db.collection("finalExams").updateOne(
            { _id: new ObjectId(examId) },
            { 
                $set: { 
                    review: finalExam.review,
                    graded: finalExam.graded
                }
            }
        );
        
        return finalExam.review;
    },

    updateAnswerGrade: async (examId, questionIndex, grade, feedback) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        console.log(`📝 updateAnswerGrade: examId=${examId}, questionIndex=${questionIndex}, grade=${grade}`);
        
        // Get or create exam grade record
        let examGrade = await db.collection("examGrades").findOne({ examId });
        console.log(`📊 Existing examGrade found:`, !!examGrade);
        
        if (!examGrade) {
            // Create new exam grade record
            const examSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
            if (!examSession) {
                throw new Error('Exam session not found');
            }
            
            examGrade = {
                examId,
                gradedBy: 'admin',
                gradedAt: new Date(),
                totalScore: 0,
                maxScore: 0,
                percentage: 0,
                questionGrades: [],
                overallFeedback: '',
                isGraded: false
            };
        }
        
        // Update or add the question grade
        const existingGradeIndex = examGrade.questionGrades.findIndex(qg => qg.questionIndex === questionIndex);
        const questionGrade = {
            questionIndex,
            score: grade,
            maxScore: 1, // Default, will be updated based on question details
            feedback: feedback || '',
            gradedAt: new Date()
        };
        
        // Get question details to set proper maxScore
        try {
            const examSession = await db.collection("examSessions").findOne({ _id: new ObjectId(examId) });
            if (examSession && examSession.answers) {
                const answer = examSession.answers.find(a => a.questionIndex === questionIndex);
                if (answer && answer.questionId) {
                    console.log(`⚠️ Fetching question points for regular exam question ${questionIndex} (questionId: ${answer.questionId})`);
                    const questionFromDB = await db.collection("questions").findOne({ id: parseInt(answer.questionId) });
                    if (questionFromDB && questionFromDB.points) {
                        questionGrade.maxScore = questionFromDB.points;
                        console.log(`✅ Retrieved question points from database: ${questionFromDB.points} for question ${questionIndex}`);
                    } else {
                        console.log(`⚠️ No points found in database for questionId ${answer.questionId}, defaulting to 1`);
                    }
                } else {
                    console.log(`⚠️ No answer or questionId found for questionIndex ${questionIndex}, defaulting maxScore to 1`);
                }
            }
        } catch (error) {
            console.error(`❌ Error fetching question details for exam ${examId}:`, error);
        }
        
        if (existingGradeIndex >= 0) {
            examGrade.questionGrades[existingGradeIndex] = questionGrade;
        } else {
            examGrade.questionGrades.push(questionGrade);
        }
        
        // Recalculate total scores
        examGrade.totalScore = examGrade.questionGrades.reduce((sum, qg) => sum + qg.score, 0);
        examGrade.maxScore = examGrade.questionGrades.reduce((sum, qg) => sum + qg.maxScore, 0);
        examGrade.percentage = examGrade.maxScore > 0 ? Math.round((examGrade.totalScore / examGrade.maxScore) * 100) : 0;
        examGrade.lastUpdated = new Date();
        
        // Update the database
        console.log(`💾 Saving examGrade: hasId=${!!examGrade._id}, totalScore=${examGrade.totalScore}`);
        
        if (examGrade._id) {
            const updateResult = await db.collection("examGrades").updateOne(
                { _id: examGrade._id },
                { $set: examGrade }
            );
            console.log(`✅ Updated existing examGrade: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);
        } else {
            const insertResult = await db.collection("examGrades").insertOne(examGrade);
            console.log(`✅ Inserted new examGrade: id=${insertResult.insertedId}`);
            examGrade._id = insertResult.insertedId;
        }
        
        return examGrade;
    },

    // Comments Bank functions
    saveCommentBankEntry: async (questionId, questionText, difficulty, score, maxScore, feedback, gradedBy = 'admin') => {
        const db = await getDatabase();
        
        const commentEntry = {
            questionId,
            questionText,
            difficulty,
            score,
            maxScore,
            feedback,
            gradedBy,
            gradedAt: new Date(),
            tags: [], // For future use - could extract keywords from questionText
            usageCount: 0, // Track how many times this comment was reused
            lastUsed: null
        };
        
        const result = await db.collection("commentBank").insertOne(commentEntry);
        return { commentId: result.insertedId, ...commentEntry };
    },

    getCommentBankEntries: async (questionId = null, difficulty = null, searchTerm = null, limit = 50) => {
        const db = await getDatabase();
        
        let query = {};
        
        // Filter by question ID if provided
        if (questionId) {
            query.questionId = questionId;
        }
        
        // Filter by difficulty if provided
        if (difficulty) {
            query.difficulty = difficulty;
        }
        
        // Search in question text and feedback if search term provided
        if (searchTerm) {
            query.$or = [
                { questionText: { $regex: searchTerm, $options: 'i' } },
                { feedback: { $regex: searchTerm, $options: 'i' } }
            ];
        }
        
        const comments = await db.collection("commentBank")
            .find(query)
            .sort({ gradedAt: -1, usageCount: -1 }) // Sort by recent and frequently used
            .limit(limit)
            .toArray();
        
        return comments;
    },

    updateCommentBankUsage: async (commentId) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        const result = await db.collection("commentBank").updateOne(
            { _id: new ObjectId(commentId) },
            { 
                $inc: { usageCount: 1 },
                $set: { lastUsed: new Date() }
            }
        );
        
        return result;
    },

    deleteCommentBankEntry: async (commentId) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        const result = await db.collection("commentBank").deleteOne({ _id: new ObjectId(commentId) });
        return result;
    },

    updateCommentBankEntry: async (commentId, updates) => {
        const db = await getDatabase();
        const { ObjectId } = require('mongodb');
        
        const result = await db.collection("commentBank").updateOne(
            { _id: new ObjectId(commentId) },
            { 
                $set: { 
                    ...updates,
                    lastUpdated: new Date()
                }
            }
        );
        
        return result;
    },

    // Function to check and fix missing correct answers
    checkMissingCorrectAnswers: async () => {
        const db = await getDatabase();
        
        // Get all questions from database
        const questions = await db.collection("questions").find({}).toArray();
        
        // Find questions without solution_example
        const questionsWithoutSolution = questions.filter(q => !q.solution_example || q.solution_example.trim() === '');
        
        if (questionsWithoutSolution.length === 0) {
            return { 
                status: 'success', 
                message: 'All questions have correct answers',
                totalQuestions: questions.length
            };
        }
        
        // Load exercises.json to get the solutions
        const exercises = require('./exercises.json');
        const exercisesMap = exercises.reduce((map, exercise) => {
            map[exercise.id] = exercise;
            return map;
        }, {});
        
        let fixedCount = 0;
        const missingAnswers = [];
        
        for (const question of questionsWithoutSolution) {
            const exerciseData = exercisesMap[question.id];
            
            if (exerciseData && exerciseData.solution_example) {
                // Update the question with the correct answer
                await db.collection("questions").updateOne(
                    { id: question.id },
                    { 
                        $set: { 
                            solution_example: exerciseData.solution_example,
                            expected_keywords: exerciseData.expected_keywords || [],
                            lastUpdated: new Date()
                        }
                    }
                );
                fixedCount++;
            } else {
                missingAnswers.push({
                    id: question.id,
                    question: question.question,
                    difficulty: question.difficulty
                });
            }
        }
        
        return {
            status: 'success',
            message: `Fixed ${fixedCount} questions, ${missingAnswers.length} still missing answers`,
            totalQuestions: questions.length,
            questionsWithoutSolution: questionsWithoutSolution.length,
            fixedCount,
            missingAnswers
        };
    },

    // Function to get all questions with their correct answer status
    getQuestionsCorrectAnswerStatus: async () => {
        const db = await getDatabase();
        
        const questions = await db.collection("questions").find({}).sort({ id: 1 }).toArray();
        
        return questions.map(q => ({
            id: q.id,
            question: q.question?.substring(0, 100) + '...' || 'No question text',
            difficulty: q.difficulty,
            hasCorrectAnswer: !!(q.solution_example && q.solution_example.trim() !== ''),
            approved: q.approved || false
        }));
    }
};

