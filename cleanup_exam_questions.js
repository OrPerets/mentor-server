const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./api/config');

async function cleanupExamQuestions() {
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
        
        console.log('=== CLEANING UP EXAM QUESTIONS ===');
        
        // Get all final exams with mergedAnswers that have more than 13 questions
        const exams = await db.collection('finalExams').find({
            mergedAnswers: { $exists: true, $ne: [] },
            $expr: { $gt: [{ $size: "$mergedAnswers" }, 13] }
        }).toArray();
        
        console.log(`Found ${exams.length} exams with more than 13 questions to clean up`);
        
        let totalCleaned = 0;
        const cleanupResults = [];
        
        for (const exam of exams) {
            const originalAnswers = exam.mergedAnswers || [];
            const originalCount = originalAnswers.length;
            
            console.log(`\n🔧 Processing ${exam.studentId} - ${exam.studentName}`);
            console.log(`   Original questions: ${originalCount}`);
            
            // Clean up the questions
            const cleanedAnswers = cleanupQuestions(originalAnswers);
            const newCount = cleanedAnswers.length;
            
            console.log(`   After cleanup: ${newCount}`);
            
            if (newCount !== originalCount) {
                // Update the database
                const updateResult = await db.collection('finalExams').updateOne(
                    { _id: exam._id },
                    { 
                        $set: { 
                            mergedAnswers: cleanedAnswers,
                            originalAnswersCount: originalCount,
                            combinedAnswersCount: newCount,
                            cleanupTimestamp: new Date()
                        }
                    }
                );
                
                if (updateResult.modifiedCount === 1) {
                    totalCleaned++;
                    cleanupResults.push({
                        studentId: exam.studentId,
                        studentName: exam.studentName,
                        originalCount,
                        newCount,
                        questionsRemoved: originalCount - newCount
                    });
                    console.log(`   ✅ Successfully updated`);
                } else {
                    console.log(`   ❌ Failed to update`);
                }
            } else {
                console.log(`   ⏭️  No changes needed`);
            }
        }
        
        console.log('\n=== CLEANUP SUMMARY ===');
        console.log(`Total exams processed: ${exams.length}`);
        console.log(`Total exams cleaned: ${totalCleaned}`);
        
        if (cleanupResults.length > 0) {
            console.log('\n=== DETAILED CLEANUP RESULTS ===');
            cleanupResults.forEach(result => {
                console.log(`${result.studentId} - ${result.studentName}: ${result.originalCount} → ${result.newCount} (removed ${result.questionsRemoved})`);
            });
            
            const totalQuestionsRemoved = cleanupResults.reduce((sum, r) => sum + r.questionsRemoved, 0);
            console.log(`\nTotal questions removed: ${totalQuestionsRemoved}`);
        }
        
        console.log('\n=== CLEANUP COMPLETE ===');
        
    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        await client.close();
    }
}

function cleanupQuestions(answers) {
    const validQuestions = [];
    const seenQuestionTexts = new Set();
    
    // Invalid answer patterns
    const invalidPatterns = [
        /עשיתי בקובץ הקוד/i,
        /עשיתי בקובץ הקודם/i,
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
        
        // Skip if question text is empty
        if (!questionText) {
            continue;
        }
        
        // Check for invalid answers
        const isInvalidAnswer = invalidPatterns.some(pattern => pattern.test(studentAnswer));
        if (isInvalidAnswer) {
            continue;
        }
        
        // Check for duplicates by question text (case insensitive)
        const normalizedQuestionText = questionText.toLowerCase();
        if (seenQuestionTexts.has(normalizedQuestionText)) {
            continue;
        }
        
        // Valid question - add to results
        seenQuestionTexts.add(normalizedQuestionText);
        validQuestions.push(answer);
        
        // Stop at 13 questions max
        if (validQuestions.length >= 13) {
            break;
        }
    }
    
    // Re-index the questionIndex field to ensure continuity
    validQuestions.forEach((question, index) => {
        question.questionIndex = index;
    });
    
    return validQuestions;
}

// Ask for confirmation before proceeding
function askForConfirmation() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        console.log('\n⚠️  WARNING: This will modify exam data in the database!');
        console.log('📋 The following will happen:');
        console.log('   • Remove duplicate questions (by text)');
        console.log('   • Remove questions with invalid answers (X, עשיתי בקובץ הקוד, etc.)');
        console.log('   • Limit each exam to maximum 13 questions');
        console.log('   • Update mergedAnswers field for affected exams');
        
        rl.question('\n🤔 Do you want to proceed? (yes/no): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

// Main execution
async function main() {
    const confirmed = await askForConfirmation();
    
    if (confirmed) {
        console.log('\n🚀 Starting cleanup process...');
        await cleanupExamQuestions();
    } else {
        console.log('\n❌ Cleanup cancelled by user');
    }
}

main(); 