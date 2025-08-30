const DB = require('./api/db');

// Extract base student ID (remove -1 suffix if present)
function getBaseStudentId(studentId) {
    if (typeof studentId === 'string' && studentId.endsWith('-1')) {
        return studentId.replace('-1', '');
    }
    return studentId;
}

// Check if this is a retake (has -1 suffix)
function isRetake(studentId) {
    return typeof studentId === 'string' && studentId.endsWith('-1');
}

async function updateFinalExams() {
    console.log('Connecting to database...');
    
    try {
        // Connect to database
        const db = await DB.getDb();
        
        console.log('Fetching exam sessions and answers from database...');
        
        // Fetch data from database
        const examSessions = await db.collection("examSessions").find({}).toArray();
        const examAnswers = await db.collection("examAnswers").find({}).toArray();
        
        console.log(`Found ${examSessions.length} exam sessions`);
        console.log(`Found ${examAnswers.length} exam answers`);
        
        // Group exam sessions by base student ID
        const sessionsByStudent = new Map();
        
        examSessions.forEach(session => {
            const baseStudentId = getBaseStudentId(session.studentId);
            const isSessionRetake = isRetake(session.studentId);
            
            if (!sessionsByStudent.has(baseStudentId)) {
                sessionsByStudent.set(baseStudentId, {
                    original: null,
                    retake: null
                });
            }
            
            const studentSessions = sessionsByStudent.get(baseStudentId);
            if (isSessionRetake) {
                studentSessions.retake = session;
            } else {
                studentSessions.original = session;
            }
        });
        
        console.log(`Found ${sessionsByStudent.size} unique students`);
        
        // Create final exams
        const finalExams = [];
        const duplicateStudents = [];
        
        sessionsByStudent.forEach((sessions, baseStudentId) => {
            let finalSession;
            let sessionType;
            
            // Prefer original over retake
            if (sessions.original) {
                finalSession = sessions.original;
                sessionType = 'original';
            } else if (sessions.retake) {
                finalSession = sessions.retake;
                sessionType = 'retake_only';
            } else {
                console.warn(`No valid session found for student ${baseStudentId}`);
                return;
            }
            
            // Get answers from both sessions and merge them
            let allAnswers = [];
            let originalAnswers = [];
            let retakeAnswers = [];
            
            if (sessions.original) {
                originalAnswers = examAnswers.filter(answer => answer.examId === sessions.original._id.toString());
            }
            if (sessions.retake) {
                retakeAnswers = examAnswers.filter(answer => answer.examId === sessions.retake._id.toString());
            }
            
            // Create a map to track answers by question index/ID
            const answerMap = new Map();
            
            // Add original answers first
            originalAnswers.forEach(answer => {
                const key = `${answer.questionIndex}-${answer.questionId}`;
                answerMap.set(key, {
                    ...answer,
                    examId: finalSession._id.toString(), // Use final session ID
                    sourceSession: 'original',
                    originalExamId: sessions.original._id.toString()
                });
            });
            
            // Add retake answers (may override or add new questions)
            retakeAnswers.forEach(answer => {
                const key = `${answer.questionIndex}-${answer.questionId}`;
                if (answerMap.has(key)) {
                    // Question exists in both - create merged answer data
                    const originalAnswer = answerMap.get(key);
                    answerMap.set(key, {
                        ...answer,
                        examId: finalSession._id.toString(),
                        sourceSession: 'both',
                        originalExamId: sessions.original._id.toString(),
                        retakeExamId: sessions.retake._id.toString(),
                        originalAnswer: {
                            studentAnswer: originalAnswer.studentAnswer,
                            isCorrect: originalAnswer.isCorrect,
                            timeSpent: originalAnswer.timeSpent,
                            timestamp: originalAnswer.timestamp
                        },
                        retakeAnswer: {
                            studentAnswer: answer.studentAnswer,
                            isCorrect: answer.isCorrect,
                            timeSpent: answer.timeSpent,
                            timestamp: answer.timestamp
                        },
                        // Use retake data as primary (most recent attempt)
                        studentAnswer: answer.studentAnswer,
                        isCorrect: answer.isCorrect,
                        timeSpent: answer.timeSpent,
                        timestamp: answer.timestamp
                    });
                } else {
                    // Question only exists in retake
                    answerMap.set(key, {
                        ...answer,
                        examId: finalSession._id.toString(),
                        sourceSession: 'retake_only',
                        retakeExamId: sessions.retake._id.toString()
                    });
                }
            });
            
            // Convert map back to array
            allAnswers = Array.from(answerMap.values());
            
            // Sort by question index
            allAnswers.sort((a, b) => a.questionIndex - b.questionIndex);
            
            // Calculate combined statistics
            const originalScore = sessions.original?.score || 0;
            const retakeScore = sessions.retake?.score || 0;
            const combinedCorrectAnswers = allAnswers.filter(a => a.isCorrect).length;
            const combinedScore = allAnswers.length > 0 ? (combinedCorrectAnswers / allAnswers.length) * 100 : 0;
            
            // If both exist, track as duplicate
            if (sessions.original && sessions.retake) {
                duplicateStudents.push({
                    studentId: baseStudentId,
                    originalSessionId: sessions.original._id.toString(),
                    retakeSessionId: sessions.retake._id.toString(),
                    originalScore: originalScore,
                    retakeScore: retakeScore,
                    combinedScore: combinedScore,
                    originalAnswersCount: originalAnswers.length,
                    retakeAnswersCount: retakeAnswers.length,
                    totalMergedAnswers: allAnswers.length,
                    selectedSession: 'merged'
                });
            }
            
            // Create final exam record with merged data
            const finalExam = {
                _id: finalSession._id,
                originalSessionId: sessions.original?._id || null,
                retakeSessionId: sessions.retake?._id || null,
                baseStudentId: baseStudentId,
                studentEmail: finalSession.studentEmail,
                studentId: finalSession.studentId, // Keep original ID format for reference
                studentName: finalSession.studentName,
                examTitle: finalSession.examTitle,
                startTime: sessions.original?.startTime || finalSession.startTime,
                endTime: sessions.retake?.endTime || finalSession.endTime, // Use latest end time
                status: finalSession.status,
                currentQuestionIndex: finalSession.currentQuestionIndex,
                totalQuestions: allAnswers.length, // Total unique questions answered
                questions: finalSession.questions,
                score: combinedScore, // Combined score from all answers
                createdAt: finalSession.createdAt,
                completedAt: sessions.retake?.completedAt || finalSession.completedAt,
                clientIp: finalSession.clientIp,
                browserFingerprint: finalSession.browserFingerprint,
                accessAttempts: finalSession.accessAttempts,
                // Additional metadata for tracking
                sessionType: sessionType,
                hasRetake: sessions.retake !== null,
                finalExamCreatedAt: new Date(),
                answersCount: allAnswers.length,
                // Statistics from individual sessions
                originalScore: originalScore,
                retakeScore: retakeScore,
                originalAnswersCount: originalAnswers.length,
                retakeAnswersCount: retakeAnswers.length,
                combinedAnswersCount: allAnswers.length,
                // Store merged answers for exam grading
                mergedAnswers: allAnswers
            };
            
            finalExams.push(finalExam);
        });
        
        // Sort by creation date
        finalExams.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        
        console.log(`\nCreated ${finalExams.length} final exam records`);
        console.log(`Found ${duplicateStudents.length} students with retakes`);
        
        // Print duplicate information
        if (duplicateStudents.length > 0) {
            console.log('\nStudents with retakes (merged data):');
            duplicateStudents.forEach(dup => {
                console.log(`- Student ${dup.studentId}:`);
                console.log(`  Original: ${dup.originalAnswersCount} questions, score: ${dup.originalScore.toFixed(2)}`);
                console.log(`  Retake: ${dup.retakeAnswersCount} questions, score: ${dup.retakeScore.toFixed(2)}`);
                console.log(`  Combined: ${dup.totalMergedAnswers} questions, score: ${dup.combinedScore.toFixed(2)}`);
            });
        }
        
        // Clear existing finalExams collection
        console.log('\nClearing existing finalExams collection...');
        await db.collection("finalExams").deleteMany({});
        
        // Insert new final exams
        console.log('Inserting updated final exams...');
        const result = await db.collection("finalExams").insertMany(finalExams);
        
        console.log(`\nSuccessfully updated finalExams collection:`);
        console.log(`- Inserted: ${result.insertedCount} records`);
        console.log(`- Students with retakes: ${duplicateStudents.length}`);
        console.log(`- Total unique students: ${sessionsByStudent.size}`);
        
        // Create summary document
        const summaryDoc = {
            summary: {
                totalFinalExams: finalExams.length,
                studentsWithRetakes: duplicateStudents.length,
                totalOriginalSessions: examSessions.length,
                createdAt: new Date()
            },
            duplicates: duplicateStudents
        };
        
        // Update summary in database
        await db.collection("finalExamsSummary").replaceOne(
            {},
            summaryDoc,
            { upsert: true }
        );
        
        console.log('\nProcess completed successfully!');
        console.log('FinalExams collection updated with proper duplicate handling.');
        
        return {
            finalExams,
            duplicateStudents,
            stats: {
                totalOriginalSessions: examSessions.length,
                totalUniqueStudents: sessionsByStudent.size,
                totalFinalExams: finalExams.length,
                studentsWithRetakes: duplicateStudents.length
            }
        };
        
    } catch (error) {
        console.error('Error updating final exams:', error);
        throw error;
    }
}

// Run the script
if (require.main === module) {
    updateFinalExams()
        .then((result) => {
            console.log('\n✅ Update completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Error updating final exams:', error);
            process.exit(1);
        });
}

module.exports = { updateFinalExams }; 