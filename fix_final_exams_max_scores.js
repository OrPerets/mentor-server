const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');

// Database configuration
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
    const client = new MongoClient(connectionString);
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    return client.db(DB_NAME);
}

async function createBackup(db) {
    console.log('🔄 Creating backup of finalExams collection...');
    
    const finalExams = await db.collection('finalExams').find({}).toArray();
    const backupFileName = `finalExams_backup_max_score_fix_${new Date().toISOString().split('T')[0]}.json`;
    
    // Convert ObjectIds to strings for JSON serialization
    const backupData = finalExams.map(exam => ({
        ...exam,
        _id: exam._id.toString(),
        originalSessionId: exam.originalSessionId?.toString(),
        retakeSessionId: exam.retakeSessionId?.toString()
    }));
    
    fs.writeFileSync(backupFileName, JSON.stringify(backupData, null, 2));
    console.log(`✅ Backup created: ${backupFileName} (${finalExams.length} exams)`);
    
    return backupFileName;
}

async function loadQuestionPoints(db) {
    console.log('📚 Loading question points from questions collection...');
    
    const questions = await db.collection('questions').find({}, {
        projection: { id: 1, points: 1, difficulty: 1 }
    }).toArray();
    
    const questionPointsMap = new Map();
    questions.forEach(q => {
        questionPointsMap.set(q.id, { points: q.points, difficulty: q.difficulty });
    });
    
    console.log(`✅ Loaded ${questions.length} questions with points mapping`);
    return questionPointsMap;
}

async function analyzeCurrentMaxScores(db) {
    console.log('🔍 Analyzing current maxScore issues...');
    
    const pipeline = [
        { $match: { 'review.questionGrades': { $exists: true } } },
        { $unwind: '$review.questionGrades' },
        {
            $group: {
                _id: '$review.questionGrades.maxScore',
                count: { $sum: 1 },
                exams: { $addToSet: '$_id' }
            }
        },
        { $sort: { _id: 1 } }
    ];
    
    const maxScoreStats = await db.collection('finalExams').aggregate(pipeline).toArray();
    
    console.log('📊 Current maxScore distribution:');
    let incorrectCount = 0;
    maxScoreStats.forEach(stat => {
        console.log(`  MaxScore ${stat._id}: ${stat.count} question grades`);
        if (stat._id === 1) {
            incorrectCount = stat.count;
        }
    });
    
    console.log(`⚠️ Found ${incorrectCount} question grades with maxScore=1 that likely need fixing`);
    
    return { maxScoreStats, incorrectCount };
}

async function fixExamMaxScores(db, questionPointsMap) {
    console.log('🔧 Fixing maxScore values in finalExams...');
    
    // Get all final exams with review data
    const finalExams = await db.collection('finalExams').find({
        'review.questionGrades': { $exists: true, $ne: [] }
    }).toArray();
    
    console.log(`📋 Processing ${finalExams.length} exams with review data...`);
    
    let examsUpdated = 0;
    let questionsFixed = 0;
    let questionsCouldNotFix = 0;
    const unfixableQuestions = new Set();
    
    for (const exam of finalExams) {
        let examNeedsUpdate = false;
        let examQuestionsFixed = 0;
        
        // Process each question grade
        for (const questionGrade of exam.review.questionGrades) {
            let correctMaxScore = null;
            let questionId = null;
            
            // Method 1: Get questionId from mergedAnswers
            if (exam.mergedAnswers) {
                const answer = exam.mergedAnswers.find(a => a.questionIndex === questionGrade.questionIndex);
                if (answer) {
                    questionId = parseInt(answer.questionId) || answer.questionId;
                    
                    // Check if answer already has correct questionDetails.points
                    if (answer.questionDetails && answer.questionDetails.points) {
                        correctMaxScore = answer.questionDetails.points;
                    }
                }
            }
            
            // Method 2: Look up in questions collection
            if (!correctMaxScore && questionId && questionPointsMap.has(questionId)) {
                correctMaxScore = questionPointsMap.get(questionId).points;
            }
            
            // Update if we found a correct maxScore and it's different
            if (correctMaxScore && correctMaxScore !== questionGrade.maxScore) {
                console.log(`  📝 Exam ${exam._id}: Q${questionGrade.questionIndex} (ID:${questionId}) ${questionGrade.maxScore} → ${correctMaxScore}`);
                questionGrade.maxScore = correctMaxScore;
                examNeedsUpdate = true;
                examQuestionsFixed++;
                questionsFixed++;
            } else if (!correctMaxScore) {
                questionsCouldNotFix++;
                unfixableQuestions.add(questionId || 'unknown');
                console.log(`  ⚠️ Exam ${exam._id}: Q${questionGrade.questionIndex} - could not determine correct maxScore (questionId: ${questionId})`);
            }
        }
        
        // Recalculate totals if anything changed
        if (examNeedsUpdate) {
            exam.review.maxScore = exam.review.questionGrades.reduce((sum, qg) => sum + qg.maxScore, 0);
            exam.review.percentage = exam.review.maxScore > 0 ? Math.round((exam.review.totalScore / exam.review.maxScore) * 100) : 0;
            
            // Update in database
            await db.collection('finalExams').updateOne(
                { _id: exam._id },
                { 
                    $set: { 
                        'review.questionGrades': exam.review.questionGrades,
                        'review.maxScore': exam.review.maxScore,
                        'review.percentage': exam.review.percentage,
                        'lastMaxScoreFixAt': new Date()
                    }
                }
            );
            
            examsUpdated++;
            console.log(`  ✅ Updated exam ${exam._id}: Fixed ${examQuestionsFixed} questions, new total: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
        }
    }
    
    console.log(`\n📊 Fixing Summary:`);
    console.log(`  Exams processed: ${finalExams.length}`);
    console.log(`  Exams updated: ${examsUpdated}`);
    console.log(`  Questions fixed: ${questionsFixed}`);
    console.log(`  Questions could not fix: ${questionsCouldNotFix}`);
    
    if (unfixableQuestions.size > 0) {
        console.log(`  Unfixable question IDs: ${Array.from(unfixableQuestions).join(', ')}`);
    }
    
    return {
        examsProcessed: finalExams.length,
        examsUpdated,
        questionsFixed,
        questionsCouldNotFix,
        unfixableQuestions: Array.from(unfixableQuestions)
    };
}

async function validateFix(db) {
    console.log('🔍 Validating the fix...');
    
    const pipeline = [
        { $match: { 'review.questionGrades': { $exists: true } } },
        { $unwind: '$review.questionGrades' },
        {
            $group: {
                _id: '$review.questionGrades.maxScore',
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ];
    
    const newMaxScoreStats = await db.collection('finalExams').aggregate(pipeline).toArray();
    
    console.log('📊 Updated maxScore distribution:');
    newMaxScoreStats.forEach(stat => {
        console.log(`  MaxScore ${stat._id}: ${stat.count} question grades`);
    });
    
    // Check some sample exams
    const sampleExams = await db.collection('finalExams').find({
        'review.questionGrades': { $exists: true },
        'lastMaxScoreFixAt': { $exists: true }
    }).limit(3).toArray();
    
    console.log('\n📋 Sample updated exams:');
    sampleExams.forEach((exam, index) => {
        console.log(`  Sample ${index + 1}: ${exam.studentEmail}`);
        console.log(`    Total: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
        console.log(`    Questions: ${exam.review.questionGrades.length}`);
        console.log(`    Sample maxScores: ${exam.review.questionGrades.slice(0, 3).map(qg => qg.maxScore).join(', ')}`);
    });
    
    return newMaxScoreStats;
}

async function generateReport(backupFileName, beforeStats, afterStats, fixResults) {
    const report = {
        timestamp: new Date().toISOString(),
        operation: 'Fix finalExams maxScore values based on questions collection',
        backupFile: backupFileName,
        beforeStats: {
            maxScoreDistribution: beforeStats.maxScoreStats,
            incorrectMaxScoresCount: beforeStats.incorrectCount
        },
        fixResults,
        afterStats: {
            maxScoreDistribution: afterStats
        },
        improvement: {
            questionsFixed: fixResults.questionsFixed,
            examsUpdated: fixResults.examsUpdated,
            successRate: `${((fixResults.questionsFixed / (fixResults.questionsFixed + fixResults.questionsCouldNotFix)) * 100).toFixed(1)}%`
        }
    };
    
    const reportFileName = `final_exams_max_score_fix_report_${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
    
    console.log(`\n📋 Fix Report saved: ${reportFileName}`);
    return report;
}

async function main() {
    console.log('🚀 Starting finalExams maxScore fix...\n');
    console.log('This script will fix maxScore values in review.questionGrades based on the questions collection\n');
    
    try {
        const db = await connectToDatabase();
        
        // Create backup
        const backupFileName = await createBackup(db);
        
        // Load question points mapping
        const questionPointsMap = await loadQuestionPoints(db);
        
        // Analyze current state
        const beforeStats = await analyzeCurrentMaxScores(db);
        
        if (beforeStats.incorrectCount === 0) {
            console.log('✅ All maxScore values appear to be correct! No fix needed.');
            return;
        }
        
        console.log(`\n⚠️ Found ${beforeStats.incorrectCount} question grades with potentially incorrect maxScore=1`);
        console.log('Proceeding with fix...\n');
        
        // Fix the maxScore values
        const fixResults = await fixExamMaxScores(db, questionPointsMap);
        
        // Validate the fix
        const afterStats = await validateFix(db);
        
        // Generate report
        const report = await generateReport(backupFileName, beforeStats, afterStats, fixResults);
        
        console.log('\n🎉 finalExams maxScore fix completed successfully!');
        console.log(`   Backup: ${backupFileName}`);
        console.log(`   Fixed: ${fixResults.questionsFixed} question grades in ${fixResults.examsUpdated} exams`);
        console.log(`   Report: final_exams_max_score_fix_report_${new Date().toISOString().split('T')[0]}.json`);
        
    } catch (error) {
        console.error('❌ Error during maxScore fix:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };