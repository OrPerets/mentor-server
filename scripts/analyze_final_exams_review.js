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

async function analyzeFinalExamsReview(db) {
    console.log('🔍 Analyzing finalExams review structure...');
    
    // Get sample final exams with review data
    const sampleExams = await db.collection('finalExams').find({
        review: { $exists: true, $ne: null }
    }).limit(3).toArray();
    
    console.log(`📊 Found ${sampleExams.length} exams with review data. Sample structure:`);
    
    sampleExams.forEach((exam, index) => {
        console.log(`\n--- Sample Exam ${index + 1} ---`);
        console.log(`Student: ${exam.studentEmail}`);
        console.log(`Exam ID: ${exam._id}`);
        console.log(`Total Score: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
        console.log(`Question Grades: ${exam.review.questionGrades?.length || 0} questions`);
        
        if (exam.review.questionGrades && exam.review.questionGrades.length > 0) {
            console.log(`Sample question grades:`);
            exam.review.questionGrades.slice(0, 3).forEach(qg => {
                console.log(`  Q${qg.questionIndex}: Score=${qg.score}, MaxScore=${qg.maxScore}, Feedback="${qg.feedback?.substring(0, 40)}..."`);
            });
        }
        
        // Check merged answers for question details
        if (exam.mergedAnswers && exam.mergedAnswers.length > 0) {
            console.log(`Merged Answers: ${exam.mergedAnswers.length} questions`);
            const sampleAnswer = exam.mergedAnswers[0];
            console.log(`Sample answer: QuestionId=${sampleAnswer.questionId}, QuestionIndex=${sampleAnswer.questionIndex}`);
            if (sampleAnswer.questionDetails) {
                console.log(`  Question details: Points=${sampleAnswer.questionDetails.points}, Difficulty=${sampleAnswer.questionDetails.difficulty}`);
            } else {
                console.log(`  ⚠️ No questionDetails found`);
            }
        }
    });
    
    // Get statistics about maxScore values
    const maxScoreStats = await db.collection('finalExams').aggregate([
        { $match: { 'review.questionGrades': { $exists: true } } },
        { $unwind: '$review.questionGrades' },
        {
            $group: {
                _id: '$review.questionGrades.maxScore',
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();
    
    console.log(`\n📈 MaxScore distribution in questionGrades:`);
    maxScoreStats.forEach(stat => {
        console.log(`  MaxScore ${stat._id}: ${stat.count} instances`);
    });
    
    // Count exams with review data
    const totalExams = await db.collection('finalExams').countDocuments();
    const examsWithReview = await db.collection('finalExams').countDocuments({
        review: { $exists: true, $ne: null }
    });
    
    console.log(`\n📋 Summary:`);
    console.log(`  Total finalExams: ${totalExams}`);
    console.log(`  Exams with review: ${examsWithReview}`);
    console.log(`  Exams without review: ${totalExams - examsWithReview}`);
    
    return {
        totalExams,
        examsWithReview,
        maxScoreStats,
        sampleExams: sampleExams.map(exam => ({
            _id: exam._id,
            studentEmail: exam.studentEmail,
            reviewExists: !!exam.review,
            questionGradesCount: exam.review?.questionGrades?.length || 0,
            mergedAnswersCount: exam.mergedAnswers?.length || 0
        }))
    };
}

async function checkQuestionPoints(db) {
    console.log('\n🔍 Checking question points in questions collection...');
    
    // Get question points distribution
    const questionPointsStats = await db.collection('questions').aggregate([
        { $match: { approved: true } },
        {
            $group: {
                _id: {
                    difficulty: '$difficulty',
                    points: '$points'
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.difficulty': 1, '_id.points': 1 } }
    ]).toArray();
    
    console.log(`📊 Question points by difficulty:`);
    questionPointsStats.forEach(stat => {
        console.log(`  ${stat._id.difficulty}: ${stat._id.points} points (${stat.count} questions)`);
    });
    
    return questionPointsStats;
}

async function main() {
    console.log('🚀 Analyzing finalExams review structure and question points...\n');
    
    try {
        const db = await connectToDatabase();
        
        // Analyze current review structure
        const reviewAnalysis = await analyzeFinalExamsReview(db);
        
        // Check question points
        const questionPointsAnalysis = await checkQuestionPoints(db);
        
        // Save analysis report
        const report = {
            timestamp: new Date().toISOString(),
            analysis: 'finalExams review structure and question points',
            reviewAnalysis,
            questionPointsAnalysis
        };
        
        const reportFileName = `final_exams_review_analysis_${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
        
        console.log(`\n📋 Analysis complete. Report saved: ${reportFileName}`);
        
    } catch (error) {
        console.error('❌ Error during analysis:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };