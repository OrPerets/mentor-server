
// ⚠️  MIGRATION NOTICE: This file has been partially migrated from XLSX to ExcelJS
// for security reasons. Please review and test the Excel export functionality.
// Complete migration guide: https://github.com/exceljs/exceljs#interface
const { MongoClient, ObjectId } = require('mongodb');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Reuse DB settings consistent with other export scripts
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
  const client = new MongoClient(connectionString, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  await client.connect();
  return { client, db: client.db(DB_NAME) };
}

function fmtDate(val) {
  if (!val) return 'N/A';
  try {
    return new Date(val).toLocaleString('he-IL');
  } catch {
    return String(val);
  }
}

function ensureArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function exportExamIdsToExcel(examIds) {
  if (!Array.isArray(examIds) || examIds.length === 0) {
    throw new Error('examIds must be a non-empty array of strings');
  }

  const { client, db } = await connectToDatabase();
  try {
    // Collections: examSessions, examAnswers, examGrades, finalExams
    const ids = examIds.map(String);
    const objectIds = ids.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean);

    // Load main session/final exam documents
    const [sessions, finals] = await Promise.all([
      db.collection('examSessions').find({ _id: { $in: objectIds } }).toArray(),
      db.collection('finalExams').find({ _id: { $in: objectIds } }).toArray()
    ]);

    // Answers and grades
    const [answers, grades] = await Promise.all([
      db.collection('examAnswers').find({ examId: { $in: ids } }).toArray(),
      db.collection('examGrades').find({ examId: { $in: ids } }).toArray()
    ]);

    // Optionally load questions to enrich
    const questions = await db.collection('questions').find({}).project({ id: 1, question: 1, difficulty: 1, points: 1 }).toArray();
    const qmap = new Map();
    for (const q of questions) qmap.set(q.id, q);

    // Build sheets
    // 1) Sessions/Finals Overview
    const overviewHeaders = [
      'Source',
      'Exam ID',
      'Student ID',
      'Student Name',
      'Student Email',
      'Status',
      'Start Time',
      'End Time',
      'Score/Total',
      'Percentage',
      'Total Questions',
      'Graded Questions'
    ];
    const overviewRows = [overviewHeaders];

    const pushOverview = (source, doc) => {
      const examId = String(doc._id || doc.examId || '');
      const studentId = doc.studentId || 'N/A';
      const studentName = doc.studentName || 'N/A';
      const studentEmail = doc.studentEmail || doc.email || 'N/A';
      const status = doc.status || (doc.review?.isGraded ? 'graded' : 'unknown');
      const startTime = fmtDate(doc.startTime);
      const endTime = fmtDate(doc.endTime);
      const totalQuestions = Array.isArray(doc.answers) ? doc.answers.length : Array.isArray(doc.mergedAnswers) ? doc.mergedAnswers.length : (doc.totalQuestions ?? 'N/A');

      let score = 'N/A';
      let percentage = 'N/A';
      let gradedQuestions = 0;
      if (doc.review && (Array.isArray(doc.review.questionGrades) || Number.isFinite(doc.review.totalScore))) {
        const totalScore = doc.review.totalScore ?? 0;
        const maxScore = doc.review.maxScore ?? 'N/A';
        score = maxScore !== 'N/A' ? `${totalScore}/${maxScore}` : totalScore;
        percentage = doc.review.percentage != null ? `${doc.review.percentage}%` : 'N/A';
        gradedQuestions = Array.isArray(doc.review.questionGrades) ? doc.review.questionGrades.length : 0;
      } else if (Number.isFinite(doc.score)) {
        score = doc.score;
      }

      overviewRows.push([
        source,
        examId,
        studentId,
        studentName,
        studentEmail,
        status,
        startTime,
        endTime,
        score,
        percentage,
        totalQuestions,
        gradedQuestions
      ]);
    };

    for (const s of sessions) pushOverview('examSessions', s);
    for (const f of finals) pushOverview('finalExams', f);

    // 2) Answers sheet (merged across sources)
    const answersHeaders = [
      'Exam ID',
      'Source',
      'Question Index',
      'Question ID',
      'Question Text',
      'Difficulty',
      'Points',
      'Student Answer',
      'Correct?',
      'Time Spent (sec)',
      'Submitted At'
    ];
    const answersRows = [answersHeaders];

    const byExamIdAnswers = new Map();
    for (const a of answers) {
      const list = byExamIdAnswers.get(a.examId) || [];
      list.push(a);
      byExamIdAnswers.set(a.examId, list);
    }

    // From examSessions.answers/questions
    const sessionsById = new Map(sessions.map(s => [String(s._id), s]));
    for (const id of ids) {
      const sess = sessionsById.get(id);
      if (sess) {
        const questionsArr = ensureArray(sess.questions);
        const answersForId = ensureArray(byExamIdAnswers.get(id)).sort((a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0));
        const indices = new Set([
          ...questionsArr.map((q, i) => (q?.questionIndex ?? i)),
          ...answersForId.map(a => a.questionIndex)
        ].filter(v => v != null));
        const sorted = Array.from(indices).sort((a, b) => a - b);
        for (const qi of sorted) {
          const q = questionsArr.find(x => (x?.questionIndex ?? -1) === qi) || {};
          let ans = answersForId.find(a => a.questionIndex === qi);
          // prefer non-autoSave latest
          const candidates = answersForId.filter(a => a.questionIndex === qi);
          if (candidates.length > 0) {
            candidates.sort((x, y) => new Date(x.submittedAt || 0) - new Date(y.submittedAt || 0));
            const last = candidates[candidates.length - 1];
            const best = candidates.find(c => !c.isAutoSave) || last;
            ans = best;
          }

          const qId = q.questionId ?? q.id ?? ans?.questionId ?? null;
          const qDetails = (qId != null ? qmap.get(Number(qId)) || qmap.get(String(qId)) : undefined);
          const qText = q.questionText || q.text || ans?.questionText || qDetails?.question || 'Question not found';
          const diff = q.difficulty ?? qDetails?.difficulty ?? 'N/A';
          const pts = q.points ?? qDetails?.points ?? 'N/A';

          answersRows.push([
            id,
            'examSessions',
            qi,
            qId ?? 'N/A',
            String(qText).substring(0, 500),
            diff,
            pts,
            String(ans?.studentAnswer ?? ans?.answer ?? ans?.finalAnswer ?? 'No answer').substring(0, 1000),
            ans?.isCorrect === true ? 'Yes' : ans?.isCorrect === false ? 'No' : 'N/A',
            ans?.timeSpent || 0,
            fmtDate(ans?.submittedAt)
          ]);
        }
      }
    }

    // From finalExams.mergedAnswers
    const finalsById = new Map(finals.map(f => [String(f._id), f]));
    for (const id of ids) {
      const fin = finalsById.get(id);
      if (fin && Array.isArray(fin.mergedAnswers)) {
        for (let i = 0; i < fin.mergedAnswers.length; i += 1) {
          const a = fin.mergedAnswers[i] || {};
          const qId = a.questionId ?? null;
          const qDetails = (qId != null ? qmap.get(Number(qId)) || qmap.get(String(qId)) : undefined);
          const qText = a.questionText || qDetails?.question || `Question ${i + 1}`;
          const diff = a.difficulty ?? qDetails?.difficulty ?? 'N/A';
          const pts = a.points ?? qDetails?.points ?? 'N/A';
          answersRows.push([
            id,
            'finalExams',
            a.questionIndex ?? i,
            qId ?? 'N/A',
            String(qText).substring(0, 500),
            diff,
            pts,
            String(a.studentAnswer ?? 'No answer').substring(0, 1000),
            a.isCorrect === true ? 'Yes' : a.isCorrect === false ? 'No' : 'N/A',
            a.timeSpent || 0,
            fmtDate(a.timestamp)
          ]);
        }
      }
    }

    // 3) Grades sheet
    const gradesHeaders = [
      'Exam ID',
      'Source',
      'Total Score',
      'Max Score',
      'Percentage',
      'Graded By',
      'Graded At',
      'Question Index',
      'Score',
      'Max Score (Q)',
      'Feedback'
    ];
    const gradesRows = [gradesHeaders];

    // examGrades collection (primary for regular exams)
    for (const g of grades) {
      const base = [
        g.examId,
        'examGrades',
        g.totalScore ?? 'N/A',
        g.maxScore ?? 'N/A',
        g.percentage != null ? `${g.percentage}%` : 'N/A',
        g.gradedBy || 'N/A',
        fmtDate(g.gradedAt)
      ];
      if (Array.isArray(g.questionGrades) && g.questionGrades.length > 0) {
        for (const qg of g.questionGrades) {
          gradesRows.push([
            ...base,
            qg.questionIndex,
            qg.score ?? 'N/A',
            qg.maxScore ?? 'N/A',
            qg.feedback || ''
          ]);
        }
      } else {
        gradesRows.push([...base, 'N/A', 'N/A', 'N/A', '']);
      }
    }

    // finalExams.review (primary for finals)
    for (const f of finals) {
      const rev = f.review || {};
      const base = [
        String(f._id),
        'finalExams.review',
        rev.totalScore ?? 'N/A',
        rev.maxScore ?? 'N/A',
        rev.percentage != null ? `${rev.percentage}%` : 'N/A',
        rev.gradedBy || 'N/A',
        fmtDate(rev.gradedAt)
      ];
      if (Array.isArray(rev.questionGrades) && rev.questionGrades.length > 0) {
        for (const qg of rev.questionGrades) {
          gradesRows.push([
            ...base,
            qg.questionIndex,
            qg.score ?? 'N/A',
            qg.maxScore ?? 'N/A',
            qg.feedback || ''
          ]);
        }
      } else {
        gradesRows.push([...base, 'N/A', 'N/A', 'N/A', '']);
      }
    }

    // Build workbook
    const wb = new ExcelJS.Workbook();
    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
    overviewSheet['!cols'] = [
      { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 18 }
    ];
    const answersSheet = XLSX.utils.aoa_to_sheet(answersRows);
    answersSheet['!cols'] = [
      { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 12 }, { wch: 60 }, { wch: 10 }, { wch: 16 }, { wch: 20 }
    ];
    const gradesSheet = XLSX.utils.aoa_to_sheet(gradesRows);
    gradesSheet['!cols'] = [
      { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 50 }
    ];

    workbook.addWorksheet(wb, overviewSheet, 'Overview');
    workbook.addWorksheet(wb, answersSheet, 'Answers');
    workbook.addWorksheet(wb, gradesSheet, 'Grades');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `ExamIds_Export_${timestamp}.xlsx`;
    await workbook.xlsx.writeFile(wb, filename);

    console.log(`Exported ${ids.length} exam IDs to ${filename}`);
    return filename;
  } finally {
    await client.close();
  }
}

async function main() {
  // Accept IDs from CLI or default to none
  const args = process.argv.slice(2);
  const examIds = args.length > 0 ? args : [];
  if (examIds.length === 0) {
    console.error('Usage: node export_examIds_excel.js <examId1> <examId2> ...');
    process.exit(1);
  }

  try {
    const file = await exportExamIdsToExcel(examIds);
    console.log(`File created: ${file}`);
  } catch (err) {
    console.error('Export failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { exportExamIdsToExcel };
