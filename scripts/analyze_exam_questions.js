const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./api/config');

async function analyzeExamQuestions() {
    const remoteDbPassword = config.dbPassword;
    const dbUserName = config.dbUserName;
    const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
    
    const client = new MongoClient(connectionString, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });
    
    try {
        await client.connect();
        const db = client.db('experiment');
        
        console.log('=== EXAM QUESTIONS ANALYSIS ===');
        
        // Get all final exams with mergedAnswers
        const exams = await db.collection('finalExams').find({
            mergedAnswers: { $exists: true, $ne: [] }
        }).toArray();
        
        console.log(`Total exams with answers: ${exams.length}`);
        
        let totalIssues = 0;
        let examsWithMoreThan13 = 0;
        const issueDetails = [];
        
        for (const exam of exams) {
            const answers = exam.mergedAnswers || [];
            const questionCount = answers.length;
            
            if (questionCount > 13) {
                examsWithMoreThan13++;
                
                // Analyze the questions
                const analysis = analyzeQuestions(answers, exam);
                
                if (analysis.hasIssues) {
                    totalIssues++;
                    issueDetails.push({
                        examId: exam._id,
                        studentId: exam.studentId,
                        studentName: exam.studentName,
                        originalCount: questionCount,
                        ...analysis
                    });
                }
                
                console.log(`\n📊 Exam: ${exam.studentId} (${exam.studentName})`);
                console.log(`   Questions: ${questionCount}`);
                console.log(`   Duplicates: ${analysis.duplicates.length}`);
                console.log(`   Invalid answers: ${analysis.invalidAnswers.length}`);
                console.log(`   After cleanup: ${analysis.cleanedCount}`);
            }
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Exams with >13 questions: ${examsWithMoreThan13}`);
        console.log(`Exams needing cleanup: ${totalIssues}`);
        
        if (totalIssues > 0) {
            console.log('\n=== DETAILED ISSUES ===');
            issueDetails.forEach(issue => {
                console.log(`\n🔧 ${issue.studentId} - ${issue.studentName}`);
                console.log(`   Original: ${issue.originalCount} → Cleaned: ${issue.cleanedCount}`);
                
                if (issue.duplicates.length > 0) {
                    console.log(`   Duplicates to remove: ${issue.duplicates.length}`);
                    issue.duplicates.forEach((dup, i) => {
                        console.log(`     ${i + 1}. "${dup.questionText.substring(0, 60)}..."`);
                    });
                }
                
                if (issue.invalidAnswers.length > 0) {
                    console.log(`   Invalid answers to remove: ${issue.invalidAnswers.length}`);
                    issue.invalidAnswers.forEach((inv, i) => {
                        console.log(`     ${i + 1}. "${inv.questionText.substring(0, 40)}..." → "${inv.answer}"`);
                    });
                }
            });
        }
        
        console.log('\n=== END ANALYSIS ===');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

function analyzeQuestions(answers, exam) {
    const duplicates = [];
    const invalidAnswers = [];
    const validQuestions = [];
    const seenQuestionTexts = new Set();
    
    // Invalid answer patterns
    const invalidPatterns = [
        /עשיתי בקובץ הקוד/i,
        /^x$/i,
        /^x\s*$/i,
        /מוזג ממבחן קודם/i,
        /^-$/,
        /^\s*$/, // Empty or whitespace only
    ];
    
    for (let i = 0; i < answers.length; i++) {
        const answer = answers[i];
        const questionText = (answer.questionText || '').trim();
        const studentAnswer = (answer.studentAnswer || answer.answer || '').trim();
        
        // Check for invalid answers
        const isInvalidAnswer = invalidPatterns.some(pattern => pattern.test(studentAnswer));
        
        if (isInvalidAnswer) {
            invalidAnswers.push({
                index: i,
                questionText,
                answer: studentAnswer,
                questionIndex: answer.questionIndex
            });
            continue;
        }
        
        // Check for duplicates by question text
        if (seenQuestionTexts.has(questionText)) {
            duplicates.push({
                index: i,
                questionText,
                answer: studentAnswer,
                questionIndex: answer.questionIndex
            });
            continue;
        }
        
        // Valid question
        seenQuestionTexts.add(questionText);
        validQuestions.push(answer);
    }
    
    const cleanedCount = validQuestions.length;
    const hasIssues = duplicates.length > 0 || invalidAnswers.length > 0 || cleanedCount > 13;
    
    // If still more than 13, we need to keep only the first 13
    const finalCount = Math.min(cleanedCount, 13);
    const excessQuestions = Math.max(0, cleanedCount - 13);
    
    return {
        hasIssues,
        duplicates,
        invalidAnswers,
        cleanedCount,
        finalCount,
        excessQuestions,
        validQuestions: validQuestions.slice(0, 13) // Keep only first 13
    };
}

analyzeExamQuestions(); 