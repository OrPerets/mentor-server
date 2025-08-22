const DB = require('./api/db');
const { ObjectId } = require('mongodb');
const fs = require('fs');

async function main() {
  const db = await DB.getDb();

  // Copy existing questions to questions2
  const questions = await db.collection('questions').find({}).toArray();
  const backup = db.collection('questions2');
  await backup.deleteMany({});
  if (questions.length) {
    await backup.insertMany(questions);
    console.log(`Copied ${questions.length} documents to questions2`);
  } else {
    console.log('No documents found in questions');
  }

  // Load new questions from JSON file
  const newQuestions = JSON.parse(fs.readFileSync('newQuestions.json', 'utf8'));
  const bulkOps = newQuestions.map(q => {
    const id = new ObjectId(q._id);
    delete q._id;
    return {
      updateOne: {
        filter: { _id: id },
        update: { $set: q },
        upsert: true
      }
    };
  });

  if (bulkOps.length) {
    const res = await db.collection('questions').bulkWrite(bulkOps);
    console.log('Questions updated:', res.modifiedCount + res.upsertedCount);
  } else {
    console.log('No new questions to update');
  }
}

main().then(() => {
  console.log('Done');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
