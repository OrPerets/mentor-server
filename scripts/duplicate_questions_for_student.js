const { MongoClient } = require('mongodb');

function parseArgs(argv) {
  const args = { ids: [] };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--student' || token === '-s') {
      args.student = argv[++i];
    } else if (token === '--ids' || token === '-i') {
      const list = argv[++i] || '';
      args.ids = list.split(',').map(v => parseInt(v.trim(), 10)).filter(v => !Number.isNaN(v));
    }
  }
  return args;
}

async function run() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  const cli = parseArgs(process.argv);
  const targetStudentId = cli.student || '207917899';
  const targetIds = (cli.ids && cli.ids.length > 0) ? cli.ids : [7, 8]; // Preferred by ID; will fallback to same indices

  try {
    await client.connect();
    const db = client.db('experiment');

    // Find the most recent session for this student (prefer in_progress)
    const session = await db.collection('examSessions').find({ studentId: targetStudentId })
      .sort({ status: 1, startTime: -1 }) // 'completed' > 'in_progress', so sort only by startTime desc effectively
      .limit(1)
      .next();

    if (!session) {
      console.log(`❌ No exam session found for student ${targetStudentId}`);
      return;
    }

    const questions = Array.isArray(session.questions) ? session.questions : [];
    console.log(`✅ Found session ${session._id} with ${questions.length} questions (status=${session.status})`);

    if (questions.length < 9) {
      console.log('⚠️ Questions array is shorter than 9; indices 7,8 may not exist. Will still try by ID.');
    }

    // Try to locate by id field first
    const byIdMap = new Map();
    questions.forEach((q, idx) => {
      if (q && (q.id !== undefined && q.id !== null)) {
        byIdMap.set(String(q.id), idx);
      }
    });

    const picks = [];
    for (const qid of targetIds) {
      const key = String(qid);
      if (byIdMap.has(key)) {
        picks.push(questions[byIdMap.get(key)]);
      }
    }

    // If IDs not found, fallback to same numeric values as indices (0-based)
    if (picks.length < targetIds.length) {
      for (const idx of targetIds) {
        if (questions[idx]) picks.push(questions[idx]);
      }
    }

    if (picks.length < 2) {
      console.log('❌ Could not determine two questions to duplicate (by id 7,8 or indices 7,8). Aborting.');
      return;
    }

    console.log('🎯 Will duplicate the following:');
    picks.forEach((q, i) => {
      console.log(`   Dup ${i + 1}: id=${q?.id ?? 'N/A'}, difficulty=${q?.difficulty ?? 'N/A'}`);
    });

    const clones = picks.map(q => ({ ...q }));
    const updatedQuestions = [...questions, ...clones];
    const increment = clones.length;
    const newTotal = (typeof session.totalQuestions === 'number' ? session.totalQuestions : questions.length) + increment;

    // Commit update
    const res = await db.collection('examSessions').updateOne(
      { _id: session._id },
      { $set: { questions: updatedQuestions, totalQuestions: newTotal, lastUpdated: new Date() } }
    );

    if (res.modifiedCount === 1) {
      const verify = await db.collection('examSessions').findOne({ _id: session._id });
      console.log('✅ Update complete. Verification:');
      console.log(`   questions.length=${verify.questions?.length}`);
      console.log(`   totalQuestions=${verify.totalQuestions}`);
      console.log('   Last appended entries:');
      const n = verify.questions.length;
      const tail = verify.questions.slice(n - increment);
      tail.forEach((q, i) => {
        console.log(`   [${n - increment + i}] id=${q?.id ?? 'N/A'}, difficulty=${q?.difficulty ?? 'N/A'}`);
      });
    } else {
      console.log('❌ No documents modified.');
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
}

run();


