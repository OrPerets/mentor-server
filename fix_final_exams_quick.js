const { MongoClient, ObjectId } = require('mongodb');

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

async function quickAnalyze(db) {
    console.log('🔍 Quick analysis of the maxScore issue...');
    
    // Count exams with review data
    const totalExams = await db.collection('finalExams').countDocuments();
    const examsWithReview = await db.collection('finalExams').countDocuments({
        'review.questionGrades': { $exists: true, $ne: [] }
    });
    
    console.log(`📊 Total finalExams: ${totalExams}`);
    console.log(`📊 Exams with review data: ${examsWithReview}`);
    
    // Count question grades with maxScore = 1
    const badMaxScoreCount = await db.collection('finalExams').aggregate([
        { $match: { 'review.questionGrades': { $exists: true } } },
        { $unwind: '$review.questionGrades' },
        { $match: { 'review.questionGrades.maxScore': 1 } },
        { $count: 'total' }
    ]).toArray();
    
    const incorrectCount = badMaxScoreCount.length > 0 ? badMaxScoreCount[0].total : 0;
    console.log(`⚠️ Question grades with maxScore=1: ${incorrectCount}`);
    
    // Get a few sample exams to see the structure
    const sampleExams = await db.collection('finalExams').find({
        'review.questionGrades': { $exists: true }
    }).limit(2).toArray();
    
    console.log('\n📋 Sample exam structures:');
    sampleExams.forEach((exam, index) => {
        console.log(`Sample ${index + 1}: ${exam.studentEmail}`);
        console.log(`  Current total: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
        console.log(`  Question grades: ${exam.review.questionGrades.length}`);
        if (exam.review.questionGrades.length > 0) {
            const sample = exam.review.questionGrades[0];
            console.log(`  Sample question grade: score=${sample.score}, maxScore=${sample.maxScore}`);
        }
    });
    
    return { totalExams, examsWithReview, incorrectCount };
}

async function loadQuestionPoints(db) {
    console.log('\n📚 Loading question points...');
    
    const questions = await db.collection('questions').find({}, {
        projection: { id: 1, points: 1, difficulty: 1 }
    }).toArray();
    
    const questionPointsMap = new Map();
    questions.forEach(q => {
        questionPointsMap.set(q.id, { points: q.points, difficulty: q.difficulty });
    });
    
    console.log(`✅ Loaded ${questions.length} questions`);
    
    // Show distribution
    const pointsDistribution = {};
    questions.forEach(q => {
        const key = `${q.difficulty}: ${q.points}pts`;
        pointsDistribution[key] = (pointsDistribution[key] || 0) + 1;
    });
    
    console.log('📈 Points by difficulty:');
    Object.entries(pointsDistribution).forEach(([key, count]) => {
        console.log(`  ${key} (${count} questions)`);
    });
    
    return questionPointsMap;
}

async function fixInBatches(db, questionPointsMap) {
    console.log('\n🔧 Fixing maxScore values in small batches...');
    
    // Get all exam IDs with review data
    const examIds = await db.collection('finalExams').find({
        'review.questionGrades': { $exists: true, $ne: [] }
    }, { projection: { _id: 1 } }).toArray();
    
    console.log(`📋 Found ${examIds.length} exams to process`);
    
    let totalFixed = 0;
    let examsUpdated = 0;
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < examIds.length; i += BATCH_SIZE) {
        const batch = examIds.slice(i, i + BATCH_SIZE);
        console.log(`\n🔄 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(examIds.length/BATCH_SIZE)} (${batch.length} exams)...`);
        
        for (const { _id } of batch) {
            const exam = await db.collection('finalExams').findOne({ _id });
            let examNeedsUpdate = false;
            let questionsFixed = 0;
            
            // Process each question grade
            for (const questionGrade of exam.review.questionGrades) {
                let correctMaxScore = null;
                let questionId = null;
                
                // Get questionId from mergedAnswers
                if (exam.mergedAnswers) {
                    const answer = exam.mergedAnswers.find(a => a.questionIndex === questionGrade.questionIndex);
                    if (answer) {
                        questionId = parseInt(answer.questionId) || answer.questionId;
                        
                        // Look up correct points
                        if (questionId && questionPointsMap.has(questionId)) {
                            correctMaxScore = questionPointsMap.get(questionId).points;
                        }
                    }
                }
                
                // Update if we found a correct maxScore and it's different
                if (correctMaxScore && correctMaxScore !== questionGrade.maxScore) {
                    questionGrade.maxScore = correctMaxScore;
                    examNeedsUpdate = true;
                    questionsFixed++;
                }
            }
            
            // Update exam if changed
            if (examNeedsUpdate) {
                // Recalculate totals
                exam.review.maxScore = exam.review.questionGrades.reduce((sum, qg) => sum + qg.maxScore, 0);
                exam.review.percentage = exam.review.maxScore > 0 ? 
                    Math.round((exam.review.totalScore / exam.review.maxScore) * 100) : 0;
                
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
                
                console.log(`  ✅ Fixed exam ${exam._id.toString().slice(-6)}: ${questionsFixed} questions, new total: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
                examsUpdated++;
                totalFixed += questionsFixed;
            }
        }
        
        console.log(`   Batch complete. Running total: ${examsUpdated} exams updated, ${totalFixed} questions fixed`);
    }
    
    return { examsUpdated, totalFixed };
}

async function verifyFix(db) {
    console.log('\n✅ Verifying the fix...');
    
    // Check maxScore distribution after fix
    const newStats = await db.collection('finalExams').aggregate([
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
    
    console.log('📊 Updated maxScore distribution:');
    newStats.forEach(stat => {
        console.log(`  MaxScore ${stat._id}: ${stat.count} question grades`);
    });
    
    // Show a few updated examples
    const updatedExams = await db.collection('finalExams').find({
        'lastMaxScoreFixAt': { $exists: true }
    }).limit(3).toArray();
    
    console.log('\n📋 Sample updated exams:');
    updatedExams.forEach((exam, index) => {
        console.log(`  ${index + 1}. ${exam.studentEmail}: ${exam.review.totalScore}/${exam.review.maxScore} (${exam.review.percentage}%)`);
    });
    
    return newStats;
}

async function main() {
    console.log('🚀 Quick finalExams maxScore fix (with progress)...\n');
    
    try {
        const db = await connectToDatabase();
        
        // Quick analysis
        const analysis = await quickAnalyze(db);
        
        if (analysis.incorrectCount === 0) {
            console.log('\n✅ No maxScore=1 issues found! System appears to be correct.');
            return;
        }
        
        console.log(`\n⚠️ Found ${analysis.incorrectCount} question grades that need fixing`);
        
        // Load question points
        const questionPointsMap = await loadQuestionPoints(db);
        
        // Fix in batches with progress
        const results = await fixInBatches(db, questionPointsMap);
        
        // Verify
        await verifyFix(db);
        
        console.log('\n🎉 Fix completed successfully!');
        console.log(`   Updated ${results.examsUpdated} exams`);
        console.log(`   Fixed ${results.totalFixed} question grades`);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}