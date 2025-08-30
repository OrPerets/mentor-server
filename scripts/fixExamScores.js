const { MongoClient, ObjectId } = require('mongodb');

const dbUserName = process.env.dbUserName || "sql-admin";
const dbPassword = process.env.dbPassword || "SMff5PqhhoVbX6z7";
const connectionString = `mongodb+srv://${dbUserName}:${dbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DATABASE_NAME = 'experiment';

async function fixExamScores() {
    let client;
    let updatedCount = 0;
    try {
        console.log('Connecting to MongoDB...');
        client = new MongoClient(connectionString);
        await client.connect();
        const db = client.db(DATABASE_NAME);
        const grades = await db.collection('examGrades').find({}).toArray();
        console.log(`Found ${grades.length} graded exams.`);
        for (const grade of grades) {
            const deletedQuestions = grade.deletedQuestions || [];
            const questionGrades = grade.questionGrades || [];
            const nonDeletedGrades = questionGrades.filter(qg => !deletedQuestions.includes(qg.questionIndex));
            const newScore = nonDeletedGrades.reduce((sum, qg) => sum + (qg.score || 0), 0);
            // Update finalExams
            const res1 = await db.collection('finalExams').updateOne(
                { _id: new ObjectId(grade.examId) },
                { $set: { score: newScore } }
            );
            // Update examSessions
            const res2 = await db.collection('examSessions').updateOne(
                { _id: new ObjectId(grade.examId) },
                { $set: { score: newScore } }
            );
            if ((res1.modifiedCount || 0) > 0 || (res2.modifiedCount || 0) > 0) {
                updatedCount++;
                console.log(`Updated examId ${grade.examId} to score ${newScore}`);
            }
        }
        console.log(`\nBatch update complete. Updated ${updatedCount} exams.`);
    } catch (error) {
        console.error('Error during batch update:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('Database connection closed.');
        }
    }
}

fixExamScores()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); }); 