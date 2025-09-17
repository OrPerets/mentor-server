
// ⚠️  MIGRATION NOTICE: This file has been partially migrated from XLSX to ExcelJS
// for security reasons. Please review and test the Excel export functionality.
// Complete migration guide: https://github.com/exceljs/exceljs#interface
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Database configuration
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
    const client = new MongoClient(connectionString, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000
    });
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    return client.db(DB_NAME);
}

async function exportFinalExamsToExcel() {
    console.log('🚀 Starting Final Exams Excel Export...\n');
    
    try {
        const db = await connectToDatabase();
        
        // Get all final exams
        console.log('📊 Getting final exams data...');
        const finalExams = await db.collection('finalExams').find({}).toArray();
        console.log(`✅ Found ${finalExams.length} final exams`);
        
        // Get all questions for reference
        console.log('📚 Loading questions...');
        const questions = await db.collection('questions').find({}).toArray();
        const questionsMap = new Map();
        questions.forEach(q => {
            questionsMap.set(q.id, q);
        });
        console.log(`✅ Loaded ${questions.length} questions`);
        
        // Prepare Sheet 1 data: Student Summary
        console.log('\n📋 Preparing Student Summary sheet...');
        const studentSummaryData = [];
        
        // Headers for Sheet 1
        studentSummaryData.push([
            'Student ID',
            'Student Name', 
            'Student Email',
            'Grade',
            'Max Score',
            'Percentage',
            'Exam Status',
            'Start Time',
            'End Time',
            'Total Questions',
            'Graded Questions',
            'Has Retake',
            'Exam ID'
        ]);
        
        // Prepare Sheet 2 data: Detailed Questions
        console.log('📋 Preparing Detailed Questions sheet...');
        const detailedQuestionsData = [];
        
        // Headers for Sheet 2
        detailedQuestionsData.push([
            'Student ID',
            'Student Name',
            'Student Email',
            'Exam ID',
            'Question ID',
            'Question Index',
            'Question Text',
            'Question Difficulty',
            'Question Points',
            'Student Answer',
            'Is Correct',
            'Grade Received',
            'Max Grade',
            'Feedback',
            'Time Spent (seconds)',
            'Answer Timestamp',
            'Source Session',
            'Graded By',
            'Graded At'
        ]);
        
        // Process each final exam
        finalExams.forEach((exam, index) => {
            console.log(`   Processing exam ${index + 1}/${finalExams.length}: ${exam.studentEmail || exam.email || 'Unknown'}`);
            
            const studentId = exam.studentId || 'N/A';
            const studentName = exam.studentName || 'N/A';
            const studentEmail = exam.studentEmail || exam.email || 'N/A';
            const examId = exam._id.toString();
            const startTime = exam.startTime ? new Date(exam.startTime).toLocaleString('he-IL') : 'N/A';
            const endTime = exam.endTime ? new Date(exam.endTime).toLocaleString('he-IL') : 'N/A';
            const examStatus = exam.status || 'unknown';
            const hasRetake = exam.retakeInfo?.hasRetake || false;
            
            // Calculate grade information
            let totalScore = 0;
            let maxScore = 0;
            let percentage = 0;
            let totalQuestions = 0;
            let gradedQuestions = 0;
            
            if (exam.review && exam.review.questionGrades) {
                totalScore = exam.review.totalScore || 0;
                maxScore = exam.review.maxScore || 0;
                percentage = exam.review.percentage || 0;
                gradedQuestions = exam.review.questionGrades.length;
            } else if (exam.score !== undefined) {
                totalScore = exam.score;
            }
            
            if (exam.mergedAnswers) {
                totalQuestions = exam.mergedAnswers.length;
            }
            
            // Add to Student Summary sheet
            studentSummaryData.push([
                studentId,
                studentName,
                studentEmail,
                totalScore,
                maxScore,
                percentage + '%',
                examStatus,
                startTime,
                endTime,
                totalQuestions,
                gradedQuestions,
                hasRetake ? 'Yes' : 'No',
                examId
            ]);
            
            // Process detailed questions
            if (exam.mergedAnswers && exam.mergedAnswers.length > 0) {
                exam.mergedAnswers.forEach(answer => {
                    const questionId = answer.questionId;
                    const questionDetails = questionsMap.get(parseInt(questionId)) || questionsMap.get(questionId);
                    
                    // Get grading information for this question
                    let gradeReceived = 'Not Graded';
                    let maxGrade = 'N/A';
                    let feedback = 'No feedback';
                    let gradedBy = 'N/A';
                    let gradedAt = 'N/A';
                    
                    if (exam.review && exam.review.questionGrades) {
                        const questionGrade = exam.review.questionGrades.find(qg => qg.questionIndex === answer.questionIndex);
                        if (questionGrade) {
                            gradeReceived = questionGrade.score || 0;
                            maxGrade = questionGrade.maxScore || 0;
                            feedback = questionGrade.feedback || 'No feedback';
                            gradedBy = exam.review.gradedBy || 'admin';
                            gradedAt = questionGrade.gradedAt ? new Date(questionGrade.gradedAt).toLocaleString('he-IL') : 'N/A';
                        }
                    }
                    
                    // Prepare question text and answer (truncate if too long)
                    const questionText = (answer.questionText || questionDetails?.question || 'Question not found').substring(0, 500);
                    const studentAnswer = (answer.studentAnswer || answer.answer || 'No answer').substring(0, 1000);
                    const answerTimestamp = answer.timestamp ? new Date(answer.timestamp).toLocaleString('he-IL') : 'N/A';
                    
                    // Add to Detailed Questions sheet
                    detailedQuestionsData.push([
                        studentId,
                        studentName,
                        studentEmail,
                        examId,
                        questionId || 'N/A',
                        answer.questionIndex || 'N/A',
                        questionText,
                        answer.difficulty || questionDetails?.difficulty || 'N/A',
                        questionDetails?.points || answer.points || 'N/A',
                        studentAnswer,
                        answer.isCorrect ? 'Yes' : 'No',
                        gradeReceived,
                        maxGrade,
                        feedback,
                        answer.timeSpent || 0,
                        answerTimestamp,
                        answer.sourceSession || 'N/A',
                        gradedBy,
                        gradedAt
                    ]);
                });
            }
        });
        
        console.log(`✅ Processed ${studentSummaryData.length - 1} students and ${detailedQuestionsData.length - 1} question responses`);
        
        // Create Excel workbook
        console.log('\n📊 Creating Excel workbook...');
        const workbook = new ExcelJS.Workbook();
        
        // Create Sheet 1: Student Summary
        const studentSummarySheet = XLSX.utils.aoa_to_sheet(studentSummaryData);
        
        // Auto-width for columns in Sheet 1
        const studentSummaryColumnWidths = [
            { wch: 15 }, // Student ID
            { wch: 25 }, // Student Name
            { wch: 30 }, // Student Email
            { wch: 10 }, // Grade
            { wch: 12 }, // Max Score
            { wch: 12 }, // Percentage
            { wch: 15 }, // Exam Status
            { wch: 20 }, // Start Time
            { wch: 20 }, // End Time
            { wch: 15 }, // Total Questions
            { wch: 15 }, // Graded Questions
            { wch: 12 }, // Has Retake
            { wch: 30 }  // Exam ID
        ];
        studentSummarySheet['!cols'] = studentSummaryColumnWidths;
        
        // Create Sheet 2: Detailed Questions
        const detailedQuestionsSheet = XLSX.utils.aoa_to_sheet(detailedQuestionsData);
        
        // Auto-width for columns in Sheet 2
        const detailedQuestionsColumnWidths = [
            { wch: 15 }, // Student ID
            { wch: 25 }, // Student Name
            { wch: 30 }, // Student Email
            { wch: 30 }, // Exam ID
            { wch: 12 }, // Question ID
            { wch: 15 }, // Question Index
            { wch: 50 }, // Question Text
            { wch: 15 }, // Question Difficulty
            { wch: 15 }, // Question Points
            { wch: 50 }, // Student Answer
            { wch: 12 }, // Is Correct
            { wch: 12 }, // Grade Received
            { wch: 12 }, // Max Grade
            { wch: 30 }, // Feedback
            { wch: 15 }, // Time Spent
            { wch: 20 }, // Answer Timestamp
            { wch: 15 }, // Source Session
            { wch: 15 }, // Graded By
            { wch: 20 }  // Graded At
        ];
        detailedQuestionsSheet['!cols'] = detailedQuestionsColumnWidths;
        
        // Add sheets to workbook
        workbook.addWorksheet(workbook, studentSummarySheet, 'Student Summary');
        workbook.addWorksheet(workbook, detailedQuestionsSheet, 'Detailed Questions');
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `FinalExams_Export_${timestamp}.xlsx`;
        
        // Write Excel file
        console.log('💾 Writing Excel file...');
        await workbook.xlsx.writeFile(workbook, filename);
        
        // Create summary report
        const summary = {
            timestamp: new Date().toISOString(),
            filename: filename,
            totalExams: finalExams.length,
            studentsCount: studentSummaryData.length - 1, // Exclude header
            questionResponsesCount: detailedQuestionsData.length - 1, // Exclude header
            sheets: [
                {
                    name: 'Student Summary',
                    columns: studentSummaryData[0],
                    rows: studentSummaryData.length - 1
                },
                {
                    name: 'Detailed Questions', 
                    columns: detailedQuestionsData[0],
                    rows: detailedQuestionsData.length - 1
                }
            ]
        };
        
        const summaryFilename = `Export_Summary_${timestamp}.json`;
        fs.writeFileSync(summaryFilename, JSON.stringify(summary, null, 2));
        
        console.log('\n🎉 Excel Export Completed Successfully! 🎉');
        console.log(`📄 Excel File: ${filename}`);
        console.log(`📊 Summary File: ${summaryFilename}`);
        console.log(`📈 Statistics:`);
        console.log(`   • Total Exams: ${finalExams.length}`);
        console.log(`   • Students: ${studentSummaryData.length - 1}`);
        console.log(`   • Question Responses: ${detailedQuestionsData.length - 1}`);
        console.log(`   • File Size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📍 Location: ${process.cwd()}/${filename}`);
        
        console.log('\n📋 Sheet Information:');
        console.log('   Sheet 1 - Student Summary:');
        console.log('     • Student ID, Name, Email, Grades, Status, Timing');
        console.log('   Sheet 2 - Detailed Questions:');
        console.log('     • All questions, answers, grades, and feedback');
        
        return filename;
        
    } catch (error) {
        console.error('❌ Export Failed:', error);
        throw error;
    }
}

async function main() {
    try {
        await exportFinalExamsToExcel();
    } catch (error) {
        console.error('❌ Fatal Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { exportFinalExamsToExcel };