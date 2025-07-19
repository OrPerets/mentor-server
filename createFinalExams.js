const fs = require('fs');
const path = require('path');

// Read the JSON files
function readJSONFile(filename) {
    const filePath = path.join(__dirname, filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

// Write the JSON file
function writeJSONFile(filename, data) {
    const filePath = path.join(__dirname, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

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

function createFinalExams() {
    console.log('Reading exam sessions and answers...');
    
    // Read the data
    const examSessions = readJSONFile('examSessions.json');
    const examAnswers = readJSONFile('examAnswers.json');
    
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
        
        // If both exist, track as duplicate
        if (sessions.original && sessions.retake) {
            duplicateStudents.push({
                studentId: baseStudentId,
                originalSessionId: sessions.original._id,
                retakeSessionId: sessions.retake._id,
                originalScore: sessions.original.score,
                retakeScore: sessions.retake.score,
                selectedSession: 'original'
            });
        }
        
        // Get answers for this session
        const sessionAnswers = examAnswers.filter(answer => answer.examId === finalSession._id);
        
        // Create final exam record
        const finalExam = {
            _id: finalSession._id, // Use the selected session's ID
            originalSessionId: sessions.original?._id || null,
            retakeSessionId: sessions.retake?._id || null,
            baseStudentId: baseStudentId,
            studentEmail: finalSession.studentEmail,
            studentId: finalSession.studentId, // Keep original ID format for reference
            studentName: finalSession.studentName,
            examTitle: finalSession.examTitle,
            startTime: finalSession.startTime,
            endTime: finalSession.endTime,
            status: finalSession.status,
            currentQuestionIndex: finalSession.currentQuestionIndex,
            totalQuestions: finalSession.totalQuestions,
            questions: finalSession.questions,
            score: finalSession.score,
            createdAt: finalSession.createdAt,
            completedAt: finalSession.completedAt,
            clientIp: finalSession.clientIp,
            browserFingerprint: finalSession.browserFingerprint,
            accessAttempts: finalSession.accessAttempts,
            // Additional metadata for tracking
            sessionType: sessionType,
            hasRetake: sessions.retake !== null,
            finalExamCreatedAt: new Date().toISOString(),
            answersCount: sessionAnswers.length
        };
        
        finalExams.push(finalExam);
    });
    
    // Sort by creation date
    finalExams.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    console.log(`\nCreated ${finalExams.length} final exam records`);
    console.log(`Found ${duplicateStudents.length} students with retakes`);
    
    // Print duplicate information
    if (duplicateStudents.length > 0) {
        console.log('\nStudents with retakes (using original):');
        duplicateStudents.forEach(dup => {
            console.log(`- Student ${dup.studentId}: Original score: ${dup.originalScore}, Retake score: ${dup.retakeScore}`);
        });
    }
    
    // Write the final exams file
    writeJSONFile('finalExams.json', finalExams);
    
    // Write the duplicates report
    writeJSONFile('duplicateStudentsReport.json', {
        summary: {
            totalFinalExams: finalExams.length,
            studentsWithRetakes: duplicateStudents.length,
            createdAt: new Date().toISOString()
        },
        duplicates: duplicateStudents
    });
    
    console.log('\nFiles created:');
    console.log('- finalExams.json');
    console.log('- duplicateStudentsReport.json');
    console.log('\nProcess completed successfully!');
    
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
}

// Run the script
if (require.main === module) {
    try {
        createFinalExams();
    } catch (error) {
        console.error('Error creating final exams:', error);
        process.exit(1);
    }
}

module.exports = { createFinalExams }; 