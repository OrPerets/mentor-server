const fs = require('fs');
const path = require('path');
const { getDb } = require('./api/db');

// List of student names to check (exact names as provided)
const studentNames = [
  'אילאיל שמאי',
  'אורן פדלון',
  'נוי מדר',
  'עומר רייפנברג',
  'יואב מלמוד',
  'עדי לסקו',
  'אלמוג שמש',
  'דון תירוש',
  'יובל שירי',
  'עודד מורבסקי',
  'דנה ליבר',
  'עילי מיכאלי',
  'עדי לרר',
  'ליאם קירקפטריק',
  'נדב רוז',
  'נגה רם'
];

// Helper: regex for exact, case-insensitive match
function exactNameRegex(name) {
  return { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
}

async function fetchSessionsForStudent(db, studentName) {
  const originalFilter = { studentName: exactNameRegex(studentName) };
  const reversedName = studentName
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .join(' ');
  const backupFilter = {
    $or: [
      { studentName: exactNameRegex(studentName) },
      { studentName: exactNameRegex(reversedName) }
    ]
  };

  // Pull from both active and backup collections
  const [sessions, sessionsBackup] = await Promise.all([
    db.collection('examSessions').find(originalFilter).toArray(),
    db.collection('examSessions_backup').find(backupFilter).toArray().catch(() => [])
  ]);

  // Tag origin collection for traceability
  const tagged = [
    ...sessions.map(s => ({ ...s, __collection: 'examSessions' })),
    ...sessionsBackup.map(s => ({ ...s, __collection: 'examSessions_backup' }))
  ];
  return tagged;
}

async function fetchAnswersForExam(db, examIdString) {
  // Only project the fields relevant to academic integrity/suspicion
  const projection = {
    examId: 1,
    questionIndex: 1,
    questionId: 1,
    questionText: 1,
    difficulty: 1,
    isCorrect: 1,
    timeSpent: 1,
    typingSpeed: 1,
    typingEvents: 1,
    isAutoSave: 1,
    studentAnswer: 1,
    submittedAt: 1,
    startTime: 1,
    endTime: 1,
    behaviorAnalytics: 1,
    comprehensiveMetrics: 1
  };
  return db.collection('examAnswers')
    .find({ examId: examIdString }, { projection })
    .sort({ questionIndex: 1 })
    .toArray();
}

async function buildSuspiciousReport() {
  const db = await getDb();

  const report = [];
  let totalSessions = 0;
  let totalAnswers = 0;

  for (const studentName of studentNames) {
    const studentEntry = { studentName, sessions: [] };
    const sessions = await fetchSessionsForStudent(db, studentName);

    for (const session of sessions) {
      const examIdString = session._id?.toString();

      const sessionInfo = {
        _id: examIdString,
        collection: session.__collection,
        studentEmail: session.studentEmail,
        studentId: session.studentId,
        examTitle: session.examTitle,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        score: session.score,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        // Security / access tracing
        clientIp: session.clientIp,
        browserFingerprint: session.browserFingerprint,
        accessAttempts: session.accessAttempts || []
      };

      let answers = [];
      if (examIdString) {
        answers = await fetchAnswersForExam(db, examIdString);
      }

      studentEntry.sessions.push({ session: sessionInfo, answers });
      totalSessions += 1;
      totalAnswers += answers.length;
    }

    report.push(studentEntry);
  }

  return { report, totals: { students: studentNames.length, sessions: totalSessions, answers: totalAnswers } };
}

async function main() {
  try {
    const { report, totals } = await buildSuspiciousReport();
    const outPath = path.join(__dirname, 'suspicious_activity_export.json');
    fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date(), totals, report }, null, 2), 'utf8');

    console.log('✅ Suspicious activity export completed');
    console.log(`👩‍🎓 Students: ${totals.students}`);
    console.log(`📝 Sessions: ${totals.sessions}`);
    console.log(`📄 Answers: ${totals.answers}`);
    console.log(`📦 Output: ${outPath}`);

    // Also print a compact per-student summary to stdout
    for (const s of report) {
      const sessionCount = s.sessions.length;
      const answerCount = s.sessions.reduce((sum, x) => sum + (x.answers?.length || 0), 0);
      console.log(` - ${s.studentName}: ${sessionCount} sessions, ${answerCount} answers`);
    }
  } catch (err) {
    console.error('❌ Export failed:', err?.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}


