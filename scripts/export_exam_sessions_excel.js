
// ⚠️  MIGRATION NOTICE: This file has been partially migrated from XLSX to ExcelJS
// for security reasons. Please review and test the Excel export functionality.
// Complete migration guide: https://github.com/exceljs/exceljs#interface
const { MongoClient } = require('mongodb');
const ExcelJS = require('exceljs');
const fs = require('fs');

// Database configuration (same as export_final_exams_excel.js)
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
  console.log('✅ Connected to MongoDB Atlas');
  return { client, db: client.db(DB_NAME) };
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString('he-IL');
  } catch (_) {
    return String(value);
  }
}

async function exportExamSessionsToExcel() {
  console.log('🚀 Starting ExamSessions Excel Export...\n');

  const { client, db } = await connectToDatabase();
  try {
    console.log('📊 Loading exam sessions...');
    const examSessions = await db.collection('examSessions').find({}).toArray();
    console.log(`✅ Found ${examSessions.length} exam sessions`);

    // Preload grades for sessions for richer export
    const examIds = examSessions.map((s) => s._id?.toString()).filter(Boolean);
    console.log('📚 Loading exam grades...');
    const grades = await db
      .collection('examGrades')
      .find({ examId: { $in: examIds } })
      .project({ examId: 1, totalScore: 1, maxScore: 1, percentage: 1, gradedBy: 1, questionGrades: 1, gradedAt: 1 })
      .toArray();
    const gradesByExamId = new Map(grades.map((g) => [g.examId, g]));
    console.log(`✅ Loaded ${grades.length} grade documents`);

    // Load answers for sessions for detailed sheet and scoring fallback
    console.log('📚 Loading exam answers...');
    const answers = await db
      .collection('examAnswers')
      .find({ examId: { $in: examIds } })
      .project({
        examId: 1,
        questionIndex: 1,
        questionId: 1,
        isCorrect: 1,
        studentAnswer: 1,
        answer: 1,
        finalAnswer: 1,
        questionText: 1,
        timeSpent: 1,
        submittedAt: 1,
        isAutoSave: 1,
      })
      .toArray();
    const answersByExamId = new Map();
    for (const a of answers) {
      const list = answersByExamId.get(a.examId) || [];
      list.push(a);
      answersByExamId.set(a.examId, list);
    }
    // Normalize: prefer non-autoSave answers per questionIndex
    const bestAnswerByExamAndIndex = new Map(); // key: `${examId}:${questionIndex}` -> answer
    const bestAnswerByExamAndQuestionId = new Map(); // key: `${examId}:${questionId}` -> answer
    for (const [eid, list] of answersByExamId) {
      // sort by submittedAt ascending to prefer last
      list.sort((x, y) => new Date(x.submittedAt || 0) - new Date(y.submittedAt || 0));
      for (const ans of list) {
        const key = `${eid}:${ans.questionIndex}`;
        const existing = bestAnswerByExamAndIndex.get(key);
        const isBetter = (!existing) || (existing.isAutoSave && !ans.isAutoSave) || (new Date(ans.submittedAt || 0) >= new Date(existing.submittedAt || 0));
        if (isBetter) bestAnswerByExamAndIndex.set(key, ans);

        // Also index by questionId when available
        if (ans.questionId != null) {
          const qKey = `${eid}:${ans.questionId}`;
          const existingByQ = bestAnswerByExamAndQuestionId.get(qKey);
          const isBetterByQ = (!existingByQ) || (existingByQ.isAutoSave && !ans.isAutoSave) || (new Date(ans.submittedAt || 0) >= new Date(existingByQ.submittedAt || 0));
          if (isBetterByQ) bestAnswerByExamAndQuestionId.set(qKey, ans);
        }
      }
    }
    console.log(`✅ Loaded ${answers.length} answers for ${answersByExamId.size} exams`);

    // Optionally load questions to enrich text/points if present
    console.log('📚 Loading questions (optional)...');
    const questions = await db.collection('questions').find({}).project({ id: 1, question: 1, difficulty: 1, points: 1 }).toArray();
    const questionsMap = new Map();
    for (const q of questions) {
      questionsMap.set(q.id, q);
    }
    console.log(`✅ Loaded ${questions.length} questions`);

    // Sheet 1: Student Summary
    const studentSummaryData = [];
    studentSummaryData.push([
      'Student ID',
      'Student Name',
      'Student Email',
      'Grade',
      'Max Score',
      'Percentage',
      'Exam Status',
      'Start Time',
      'End Time',
      'Total Questions',
      'Graded Questions',
      'Exam ID',
    ]);

    // Sheet 2: Detailed Questions (from examAnswers)
    const detailedQuestionsData = [];
    detailedQuestionsData.push([
      'Student ID',
      'Student Name',
      'Student Email',
      'Exam ID',
      'Question ID',
      'Question Index',
      'Question Text',
      'Question Difficulty',
      'Question Points',
      'Student Answer',
      'Is Correct',
      'Grade Received',
      'Max Grade',
      'Feedback',
      'Time Spent (seconds)',
      'Answer Timestamp',
      'Graded By',
      'Graded At',
    ]);

    // Sheet 3: Question Set (13) + Score per question
    const questionSetData = [];
    questionSetData.push([
      'Student ID',
      'Student Name',
      'Student Email',
      'Exam ID',
      'Question Index',
      'Question ID',
      'Question Text',
      'Difficulty',
      'Points',
      'Score',
      'Max Score',
      'Correct?',
    ]);

    for (let i = 0; i < examSessions.length; i += 1) {
      const session = examSessions[i];
      const examId = session._id?.toString() || 'N/A';
      const gradeDoc = gradesByExamId.get(examId);

      const studentId = session.studentId || 'N/A';
      const studentName = session.studentName || 'N/A';
      const studentEmail = session.studentEmail || session.email || 'N/A';
      const startTime = formatDateTime(session.startTime);
      const endTime = formatDateTime(session.endTime);
      const examStatus = (session.status || 'unknown');

      let totalScore = 0;
      let maxScore = undefined;
      let percentage = undefined;
      let gradedQuestions = 0;

      if (gradeDoc) {
        totalScore = gradeDoc.totalScore ?? session.score ?? 0;
        maxScore = gradeDoc.maxScore;
        percentage = gradeDoc.percentage;
        gradedQuestions = Array.isArray(gradeDoc.questionGrades) ? gradeDoc.questionGrades.length : 0;
      } else {
        totalScore = session.score ?? 0;
      }

      const totalQuestions = Array.isArray(session.answers) ? session.answers.length : 0;

      studentSummaryData.push([
        studentId,
        studentName,
        studentEmail,
        totalScore,
        maxScore ?? 'N/A',
        percentage != null ? `${percentage}%` : 'N/A',
        examStatus,
        startTime,
        endTime,
        totalQuestions,
        gradedQuestions,
        examId,
      ]);

      // Detailed answers: iterate the authoritative session.questions set to avoid duplicates
      const sessionQuestions = Array.isArray(session.questions) ? session.questions : null;
      if (sessionQuestions && sessionQuestions.length > 0) {
        // Build a map of questions by their intended index (first occurrence wins), and union with answer indices
        const questionsByIndex = new Map();
        for (let idx = 0; idx < sessionQuestions.length; idx += 1) {
          const q = sessionQuestions[idx] || {};
          const qi = q.questionIndex ?? idx;
          if (!questionsByIndex.has(qi)) {
            questionsByIndex.set(qi, { ...q, questionIndex: qi });
          }
        }

        // Union of indices: from session.questions and from answers we loaded
        const allIndices = new Set([
          ...Array.from(questionsByIndex.keys()),
          ...Array.from(bestAnswerByExamAndIndex.keys())
            .filter((k) => k.startsWith(`${examId}:`))
            .map((k) => parseInt(k.split(':')[1], 10))
        ]);

        const sortedIndices = Array.from(allIndices).sort((a, b) => a - b);
        for (const questionIndex of sortedIndices) {
          const q = questionsByIndex.get(questionIndex) || {};
          const qId = q.questionId ?? q.id ?? (bestAnswerByExamAndIndex.get(`${examId}:${questionIndex}`)?.questionId) ?? null;
          const qDetails = (qId != null ? questionsMap.get(Number(qId)) || questionsMap.get(String(qId)) : undefined);

          let bestAns = bestAnswerByExamAndIndex.get(`${examId}:${questionIndex}`) || {};
          if ((!bestAns || (bestAns.questionId != null && qId != null && String(bestAns.questionId) !== String(qId))) && qId != null) {
            const byQ = bestAnswerByExamAndQuestionId.get(`${examId}:${qId}`);
            if (byQ) bestAns = byQ;
          }

          const questionText = q.questionText || q.text || bestAns.questionText || qDetails?.question || 'Question not found';
          const studentAnswer = (bestAns.studentAnswer ?? bestAns.answer ?? bestAns.finalAnswer ?? 'No answer');
          const isCorrect = (bestAns.isCorrect === true) ? 'Yes' : (bestAns.isCorrect === false) ? 'No' : 'N/A';
          const timeSpent = bestAns.timeSpent || 0;
          const answerTimestamp = formatDateTime(bestAns.submittedAt);

          // Grade per question from examGrades by questionIndex
          let gradeReceived = 'Not Graded';
          let maxGrade = 'N/A';
          let feedback = 'No feedback';
          let gradedBy = gradeDoc?.gradedBy || 'N/A';
          let gradedAt = 'N/A';
          if (gradeDoc && Array.isArray(gradeDoc.questionGrades)) {
            const qg = gradeDoc.questionGrades.find((g) => g.questionIndex === questionIndex);
            if (qg) {
              gradeReceived = qg.score ?? gradeReceived;
              maxGrade = qg.maxScore ?? maxGrade;
              feedback = qg.feedback || feedback;
              gradedAt = formatDateTime(qg.gradedAt);
            }
          }

          detailedQuestionsData.push([
            studentId,
            studentName,
            studentEmail,
            examId,
            qId ?? 'N/A',
            questionIndex,
            String(questionText).substring(0, 500),
            (q.difficulty ?? qDetails?.difficulty ?? 'N/A'),
            (q.points ?? qDetails?.points ?? 'N/A'),
            String(studentAnswer).substring(0, 1000),
            isCorrect,
            gradeReceived,
            maxGrade,
            feedback,
            timeSpent,
            answerTimestamp,
            gradedBy,
            gradedAt,
          ]);
        }
      } else {
        // Fallback: use best answers if session.questions is missing
        const answersForExam = Array.from(bestAnswerByExamAndIndex.entries())
          .filter(([key]) => key.startsWith(`${examId}:`))
          .map(([, val]) => val)
          .sort((a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0));

        for (const ans of answersForExam) {
          const questionIndex = ans.questionIndex ?? null;
          const questionId = ans.questionId ?? null;
          const questionDetails = (questionId != null ? questionsMap.get(Number(questionId)) || questionsMap.get(String(questionId)) : undefined);

          const questionText = (ans.questionText || questionDetails?.question || 'Question not found');
          const studentAnswer = (ans.studentAnswer ?? ans.answer ?? ans.finalAnswer ?? 'No answer');
          const isCorrect = (ans.isCorrect === true) ? 'Yes' : (ans.isCorrect === false) ? 'No' : 'N/A';
          const timeSpent = ans.timeSpent || 0;
          const answerTimestamp = formatDateTime(ans.submittedAt);

          // Grade per question from examGrades by questionIndex
          let gradeReceived = 'Not Graded';
          let maxGrade = 'N/A';
          let feedback = 'No feedback';
          let gradedBy = gradeDoc?.gradedBy || 'N/A';
          let gradedAt = 'N/A';
          if (gradeDoc && Array.isArray(gradeDoc.questionGrades) && questionIndex != null) {
            const qg = gradeDoc.questionGrades.find((g) => g.questionIndex === questionIndex);
            if (qg) {
              gradeReceived = qg.score ?? gradeReceived;
              maxGrade = qg.maxScore ?? maxGrade;
              feedback = qg.feedback || feedback;
              gradedAt = formatDateTime(qg.gradedAt);
            }
          }

          detailedQuestionsData.push([
            studentId,
            studentName,
            studentEmail,
            examId,
            questionId ?? 'N/A',
            questionIndex ?? 'N/A',
            String(questionText).substring(0, 500),
            (questionDetails?.difficulty || 'N/A'),
            (questionDetails?.points || 'N/A'),
            String(studentAnswer).substring(0, 1000),
            isCorrect,
            gradeReceived,
            maxGrade,
            feedback,
            timeSpent,
            answerTimestamp,
            gradedBy,
            gradedAt,
          ]);
        }
      }

      // Question set (13) with score - authoritative from session.questions, fallback to best answers
      const questionSet = Array.isArray(session.questions) && session.questions.length > 0
        ? (() => {
            // Build union of indices from questions and answers
            const questionsByIndex = new Map();
            for (let idx = 0; idx < session.questions.length; idx += 1) {
              const q = session.questions[idx] || {};
              const qi = q.questionIndex ?? idx;
              if (!questionsByIndex.has(qi)) {
                questionsByIndex.set(qi, { ...q, questionIndex: qi });
              }
            }
            const allIndices = new Set([
              ...Array.from(questionsByIndex.keys()),
              ...Array.from(bestAnswerByExamAndIndex.keys())
                .filter((k) => k.startsWith(`${examId}:`))
                .map((k) => parseInt(k.split(':')[1], 10))
            ]);
            return Array.from(allIndices)
              .sort((a, b) => a - b)
              .map((qi) => ({ ...(questionsByIndex.get(qi) || {}), questionIndex: qi }));
          })()
        : Array.from(bestAnswerByExamAndIndex.entries())
            .filter(([key]) => key.startsWith(`${examId}:`))
            .map(([, a]) => a)
            .sort((a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0))
            .map(a => ({ questionIndex: a.questionIndex, questionId: a.questionId, questionText: a.questionText }));

      for (let idx = 0; idx < (questionSet?.length || 0); idx += 1) {
        const q = questionSet[idx];
        const qIndex = q.questionIndex ?? idx;
        const qId = q.questionId ?? q.id ?? null;
        const qDetails = (qId != null ? questionsMap.get(Number(qId)) || questionsMap.get(String(qId)) : undefined);
        const qText = q.questionText || q.text || qDetails?.question || 'Question not found';
        const qDifficulty = (q.difficulty ?? qDetails?.difficulty ?? 'N/A');
        const qPoints = (q.points ?? qDetails?.points ?? 'N/A');

        // Score from grades if available
        let score = 'N/A';
        let maxQScore = 'N/A';
        let correctFlag = 'N/A';
        if (gradeDoc && Array.isArray(gradeDoc.questionGrades)) {
          const qg = gradeDoc.questionGrades.find(g => g.questionIndex === qIndex);
          if (qg) {
            score = qg.score ?? score;
            maxQScore = qg.maxScore ?? maxQScore;
          }
        }
        // Fallback: compute from answer correctness
        if (score === 'N/A') {
          const bestAns = bestAnswerByExamAndIndex.get(`${examId}:${qIndex}`);
          if (bestAns) {
            correctFlag = bestAns.isCorrect ? 'Yes' : 'No';
            if (qPoints !== 'N/A') {
              score = bestAns.isCorrect ? qPoints : 0;
              maxQScore = qPoints;
            }
          }
        } else {
          const bestAns = bestAnswerByExamAndIndex.get(`${examId}:${qIndex}`);
          if (bestAns != null) correctFlag = bestAns.isCorrect ? 'Yes' : 'No';
        }

        questionSetData.push([
          studentId,
          studentName,
          studentEmail,
          examId,
          qIndex,
          qId ?? 'N/A',
          String(qText).substring(0, 500),
          qDifficulty,
          qPoints,
          score,
          maxQScore,
          correctFlag,
        ]);
      }
    }

    console.log(`✅ Prepared ${studentSummaryData.length - 1} student rows, ${detailedQuestionsData.length - 1} detailed answer rows, and ${questionSetData.length - 1} question-set rows`);

    // Build workbook
    console.log('\n📊 Creating Excel workbook...');
    const workbook = new ExcelJS.Workbook();

    const studentSummarySheet = XLSX.utils.aoa_to_sheet(studentSummaryData);
    studentSummarySheet['!cols'] = [
      { wch: 15 }, // Student ID
      { wch: 25 }, // Student Name
      { wch: 30 }, // Student Email
      { wch: 10 }, // Grade
      { wch: 12 }, // Max Score
      { wch: 12 }, // Percentage
      { wch: 15 }, // Exam Status
      { wch: 20 }, // Start Time
      { wch: 20 }, // End Time
      { wch: 15 }, // Total Questions
      { wch: 18 }, // Graded Questions
      { wch: 30 }, // Exam ID
    ];

    const detailedQuestionsSheet = XLSX.utils.aoa_to_sheet(detailedQuestionsData);
    detailedQuestionsSheet['!cols'] = [
      { wch: 15 }, // Student ID
      { wch: 25 }, // Student Name
      { wch: 30 }, // Student Email
      { wch: 30 }, // Exam ID
      { wch: 12 }, // Question ID
      { wch: 15 }, // Question Index
      { wch: 50 }, // Question Text
      { wch: 15 }, // Question Difficulty
      { wch: 15 }, // Question Points
      { wch: 50 }, // Student Answer
      { wch: 12 }, // Is Correct
      { wch: 14 }, // Grade Received
      { wch: 12 }, // Max Grade
      { wch: 30 }, // Feedback
      { wch: 18 }, // Time Spent
      { wch: 20 }, // Answer Timestamp
      { wch: 15 }, // Graded By
      { wch: 20 }, // Graded At
    ];

    workbook.addWorksheet(workbook, studentSummarySheet, 'Student Summary');
    workbook.addWorksheet(workbook, detailedQuestionsSheet, 'Detailed Questions');
    const questionSetSheet = XLSX.utils.aoa_to_sheet(questionSetData);
    questionSetSheet['!cols'] = [
      { wch: 15 }, // Student ID
      { wch: 25 }, // Student Name
      { wch: 30 }, // Student Email
      { wch: 30 }, // Exam ID
      { wch: 15 }, // Question Index
      { wch: 12 }, // Question ID
      { wch: 50 }, // Question Text
      { wch: 15 }, // Difficulty
      { wch: 12 }, // Points
      { wch: 12 }, // Score
      { wch: 12 }, // Max Score
      { wch: 10 }, // Correct?
    ];
    workbook.addWorksheet(workbook, questionSetSheet, 'Question Set (13)');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `ExamSessions_Export_${timestamp}.xlsx`;

    console.log('💾 Writing Excel file...');
    await workbook.xlsx.writeFile(workbook, filename);

    const summary = {
      timestamp: new Date().toISOString(),
      filename,
      totalSessions: examSessions.length,
      studentsCount: studentSummaryData.length - 1,
      questionResponsesCount: detailedQuestionsData.length - 1,
      sheets: [
        { name: 'Student Summary', columns: studentSummaryData[0], rows: studentSummaryData.length - 1 },
        { name: 'Detailed Questions', columns: detailedQuestionsData[0], rows: detailedQuestionsData.length - 1 },
        { name: 'Question Set (13)', columns: questionSetData[0], rows: questionSetData.length - 1 },
      ],
    };
    const summaryFilename = `ExamSessions_Export_Summary_${timestamp}.json`;
    fs.writeFileSync(summaryFilename, JSON.stringify(summary, null, 2));

    console.log('\n🎉 Excel Export Completed Successfully! 🎉');
    console.log(`📄 Excel File: ${filename}`);
    console.log(`📊 Summary File: ${summaryFilename}`);
    console.log(`📈 Statistics:`);
    console.log(`   • Total Sessions: ${examSessions.length}`);
    console.log(`   • Students: ${studentSummaryData.length - 1}`);
    console.log(`   • Question Responses: ${detailedQuestionsData.length - 1}`);
    console.log(`📍 Location: ${process.cwd()}/${filename}`);

    return filename;
  } catch (error) {
    console.error('❌ Export Failed:', error);
    throw error;
  } finally {
    await client.close();
  }
}

async function main() {
  try {
    await exportExamSessionsToExcel();
  } catch (error) {
    console.error('❌ Fatal Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { exportExamSessionsToExcel };


