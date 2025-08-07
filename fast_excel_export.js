const { MongoClient } = require('mongodb');
const fs = require('fs');

// Database configuration
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
    const client = new MongoClient(connectionString, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 30000
    });
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    return client.db(DB_NAME);
}

async function createFastExport() {
    console.log('🚀 Starting fast Excel export...\n');
    
    try {
        const db = await connectToDatabase();
        
        // Step 1: Get all questions first (small, fast query)
        console.log('📚 Loading questions...');
        const questions = await db.collection('questions').find({}).toArray();
        const questionsMap = new Map();
        questions.forEach(q => {
            questionsMap.set(q.id, q);
        });
        console.log(`✅ Loaded ${questions.length} questions`);
        
        // Step 2: Get graded final exams in small batches
        console.log('\n📊 Getting graded final exams...');
        
        // First count
        const totalExams = await db.collection('finalExams').countDocuments({
            'review.questionGrades': { $exists: true, $ne: [] }
        });
        console.log(`📋 Found ${totalExams} exams with grades`);
        
        // Get in smaller batches to avoid timeout
        const BATCH_SIZE = 10;
        const allGradedExams = [];
        
        for (let skip = 0; skip < totalExams; skip += BATCH_SIZE) {
            console.log(`   Loading batch ${Math.floor(skip/BATCH_SIZE) + 1}/${Math.ceil(totalExams/BATCH_SIZE)}...`);
            
            const batch = await db.collection('finalExams')
                .find({ 'review.questionGrades': { $exists: true, $ne: [] } })
                .skip(skip)
                .limit(BATCH_SIZE)
                .toArray();
                
            allGradedExams.push(...batch);
        }
        
        console.log(`✅ Loaded ${allGradedExams.length} graded exams`);
        
        // Step 3: Process data for Excel
        console.log('\n📋 Processing data for Excel...');
        
        const studentData = new Map();
        let totalQuestions = 0;
        
        allGradedExams.forEach((exam, examIndex) => {
            if (examIndex % 10 === 0) {
                console.log(`   Processing exam ${examIndex + 1}/${allGradedExams.length}...`);
            }
            
            const studentKey = exam.studentEmail || exam.email || 'unknown';
            
            if (!studentData.has(studentKey)) {
                studentData.set(studentKey, {
                    studentEmail: studentKey,
                    studentName: exam.studentName || 'לא זמין',
                    studentId: exam.studentId || 'לא זמין',
                    examDate: exam.startTime ? new Date(exam.startTime).toLocaleDateString('he-IL') : 'לא זמין',
                    totalScore: exam.review?.totalScore || 0,
                    maxScore: exam.review?.maxScore || 0,
                    percentage: exam.review?.percentage || 0,
                    questions: []
                });
            }
            
            const student = studentData.get(studentKey);
            
            // Process each question grade
            if (exam.review && exam.review.questionGrades) {
                exam.review.questionGrades.forEach(qg => {
                    // Find the corresponding answer in mergedAnswers
                    let studentAnswer = 'לא זמין';
                    let questionText = 'שאלה לא זמינה';
                    let questionId = null;
                    
                    if (exam.mergedAnswers) {
                        const answer = exam.mergedAnswers.find(a => a.questionIndex === qg.questionIndex);
                        if (answer) {
                            studentAnswer = answer.studentAnswer || answer.answer || 'לא זמין';
                            questionText = answer.questionText || 'לא זמין';
                            questionId = parseInt(answer.questionId) || answer.questionId;
                        }
                    }
                    
                    // Get question details
                    const questionDetails = questionId ? questionsMap.get(questionId) : null;
                    if (questionDetails) {
                        questionText = questionDetails.question || questionText;
                    }
                    
                    student.questions.push({
                        questionId: questionId || 'לא זמין',
                        questionIndex: qg.questionIndex,
                        questionText: questionText.substring(0, 100) + '...', // Truncate for Excel
                        questionDifficulty: questionDetails?.difficulty || 'לא זמין',
                        studentAnswer: studentAnswer.substring(0, 200) + '...', // Truncate for Excel
                        grade: qg.score || 0,
                        maxScore: qg.maxScore || 0,
                        feedback: (qg.feedback || 'אין משוב').substring(0, 100) + '...' // Truncate for Excel
                    });
                    
                    totalQuestions++;
                });
            }
        });
        
        console.log(`✅ Processed ${studentData.size} students with ${totalQuestions} total question responses`);
        
        // Step 4: Create CSV output (faster than Excel)
        console.log('\n📄 Creating CSV export...');
        
        const csvLines = [];
        
        // Header
        csvLines.push([
            'Student Email',
            'Student Name', 
            'Student ID',
            'Exam Date',
            'Total Score',
            'Max Score', 
            'Percentage',
            'Question ID',
            'Question Index',
            'Question Text',
            'Question Difficulty',
            'Student Answer',
            'Grade',
            'Question Max Score',
            'Feedback'
        ].join(','));
        
        // Data rows
        Array.from(studentData.values()).forEach(student => {
            student.questions.forEach(question => {
                csvLines.push([
                    `"${student.studentEmail}"`,
                    `"${student.studentName}"`,
                    `"${student.studentId}"`,
                    `"${student.examDate}"`,
                    student.totalScore,
                    student.maxScore,
                    student.percentage + '%',
                    question.questionId,
                    question.questionIndex,
                    `"${question.questionText.replace(/"/g, '""')}"`, // Escape quotes
                    `"${question.questionDifficulty}"`,
                    `"${question.studentAnswer.replace(/"/g, '""')}"`, // Escape quotes
                    question.grade,
                    question.maxScore,
                    `"${question.feedback.replace(/"/g, '""')}"` // Escape quotes
                ].join(','));
            });
        });
        
        const csvContent = csvLines.join('\n');
        const filename = `grading_export_${new Date().toISOString().split('T')[0]}.csv`;
        
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        console.log(`\n🎉 Export completed successfully!`);
        console.log(`   File: ${filename}`);
        console.log(`   Students: ${studentData.size}`);
        console.log(`   Total responses: ${totalQuestions}`);
        console.log(`   File size: ${(csvContent.length / 1024).toFixed(1)} KB`);
        
        // Also create a summary file
        const summary = {
            timestamp: new Date().toISOString(),
            studentsCount: studentData.size,
            questionsCount: totalQuestions,
            examsProcessed: allGradedExams.length,
            filename: filename
        };
        
        fs.writeFileSync(`export_summary_${new Date().toISOString().split('T')[0]}.json`, 
                        JSON.stringify(summary, null, 2));
        
        return filename;
        
    } catch (error) {
        console.error('❌ Error during export:', error);
        throw error;
    }
}

async function main() {
    await createFastExport();
}

if (require.main === module) {
    main();
}

module.exports = { createFastExport };