const { MongoClient } = require('mongodb');
const fs = require('fs');

// Simple CSV export since we don't have xlsx in mentor-server
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

async function createUrgentExport() {
    console.log('🚨 URGENT EXPORT STARTED 🚨\n');
    
    try {
        const db = await connectToDatabase();
        
        // Get ALL graded final exams directly
        console.log('📊 Getting graded final exams...');
        const gradedExams = await db.collection('finalExams').find({
            'review.questionGrades': { $exists: true, $ne: [] }
        }).toArray();
        
        console.log(`✅ Found ${gradedExams.length} graded exams`);
        
        // Get questions for reference
        console.log('📚 Loading questions...');
        const questions = await db.collection('questions').find({}).toArray();
        const questionsMap = new Map();
        questions.forEach(q => {
            questionsMap.set(q.id, q);
        });
        console.log(`✅ Loaded ${questions.length} questions`);
        
        // Process ALL data
        console.log('\n📋 Processing all grading data...');
        const csvRows = [];
        
        // CSV Header
        csvRows.push([
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
            'Question Points',
            'Student Answer',
            'Grade',
            'Max Grade',
            'Feedback',
            'Graded By',
            'Exam ID'
        ].join(','));
        
        let totalRows = 0;
        
        gradedExams.forEach((exam, examIndex) => {
            console.log(`   Processing exam ${examIndex + 1}/${gradedExams.length}: ${exam.studentEmail}`);
            
            const baseData = {
                studentEmail: exam.studentEmail || exam.email || 'לא זמין',
                studentName: exam.studentName || 'לא זמין',
                studentId: exam.studentId || 'לא זמין',
                examDate: exam.startTime ? new Date(exam.startTime).toLocaleDateString('he-IL') : 'לא זמין',
                totalScore: exam.review?.totalScore || 0,
                maxScore: exam.review?.maxScore || 0,
                percentage: exam.review?.percentage || 0,
                examId: exam._id.toString(),
                gradedBy: exam.review?.gradedBy || 'admin'
            };
            
            // Process each question grade
            if (exam.review && exam.review.questionGrades) {
                exam.review.questionGrades.forEach(qg => {
                    // Find corresponding answer
                    let studentAnswer = 'לא זמין';
                    let questionText = 'שאלה לא זמינה';
                    let questionId = null;
                    let questionDifficulty = 'לא זמין';
                    let questionPoints = qg.maxScore || 0;
                    
                    if (exam.mergedAnswers) {
                        const answer = exam.mergedAnswers.find(a => a.questionIndex === qg.questionIndex);
                        if (answer) {
                            studentAnswer = answer.studentAnswer || answer.answer || 'לא זמין';
                            questionText = answer.questionText || 'לא זמין';
                            questionId = parseInt(answer.questionId) || answer.questionId;
                            questionDifficulty = answer.difficulty || 'לא זמין';
                        }
                    }
                    
                    // Get additional question details
                    if (questionId && questionsMap.has(questionId)) {
                        const questionDetails = questionsMap.get(questionId);
                        questionText = questionDetails.question || questionText;
                        questionDifficulty = questionDetails.difficulty || questionDifficulty;
                        questionPoints = questionDetails.points || questionPoints;
                    }
                    
                    // Escape CSV fields
                    const escapeCsv = (str) => {
                        if (str === null || str === undefined) return '';
                        const strValue = str.toString();
                        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                            return `"${strValue.replace(/"/g, '""')}"`;
                        }
                        return strValue;
                    };
                    
                    csvRows.push([
                        escapeCsv(baseData.studentEmail),
                        escapeCsv(baseData.studentName),
                        escapeCsv(baseData.studentId),
                        escapeCsv(baseData.examDate),
                        baseData.totalScore,
                        baseData.maxScore,
                        baseData.percentage + '%',
                        questionId || 'לא זמין',
                        qg.questionIndex,
                        escapeCsv(questionText.substring(0, 200)),
                        escapeCsv(questionDifficulty),
                        questionPoints,
                        escapeCsv(studentAnswer.substring(0, 300)),
                        qg.score || 0,
                        qg.maxScore || 0,
                        escapeCsv((qg.feedback || 'אין משוב').substring(0, 200)),
                        escapeCsv(baseData.gradedBy),
                        escapeCsv(baseData.examId)
                    ].join(','));
                    
                    totalRows++;
                });
            }
        });
        
        // Write CSV file
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `URGENT_GRADING_EXPORT_${timestamp}.csv`;
        const csvContent = csvRows.join('\n');
        
        fs.writeFileSync(filename, '\ufeff' + csvContent, 'utf8'); // UTF-8 BOM for Hebrew support
        
        console.log(`\n🎉 URGENT EXPORT COMPLETED! 🎉`);
        console.log(`📄 File: ${filename}`);
        console.log(`📊 Students: ${gradedExams.length}`);
        console.log(`📝 Total question responses: ${totalRows}`);
        console.log(`💾 File size: ${(csvContent.length / 1024).toFixed(1)} KB`);
        console.log(`📍 Location: ${process.cwd()}/${filename}`);
        
        // Create summary file
        const summary = {
            timestamp: new Date().toISOString(),
            filename: filename,
            studentsCount: gradedExams.length,
            questionResponsesCount: totalRows,
            fileSizeKB: Math.round(csvContent.length / 1024),
            columns: [
                'Student Email', 'Student Name', 'Student ID', 'Exam Date',
                'Total Score', 'Max Score', 'Percentage', 'Question ID',
                'Question Index', 'Question Text', 'Question Difficulty', 'Question Points',
                'Student Answer', 'Grade', 'Max Grade', 'Feedback', 'Graded By', 'Exam ID'
            ]
        };
        
        fs.writeFileSync(`EXPORT_SUMMARY_${timestamp}.json`, JSON.stringify(summary, null, 2));
        
        console.log(`\n✅ Summary saved: EXPORT_SUMMARY_${timestamp}.json`);
        console.log(`\n💡 To open in Excel:`);
        console.log(`   1. Open Excel`);
        console.log(`   2. File > Open > ${filename}`);
        console.log(`   3. Choose "UTF-8" encoding when prompted`);
        console.log(`   4. Hebrew text should display correctly`);
        
        return filename;
        
    } catch (error) {
        console.error('❌ URGENT EXPORT FAILED:', error);
        throw error;
    }
}

async function main() {
    await createUrgentExport();
}

if (require.main === module) {
    main();
}

module.exports = { createUrgentExport };