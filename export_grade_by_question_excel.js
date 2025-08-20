const { MongoClient } = require('mongodb');
const XLSX = require('xlsx');
const fs = require('fs');

// Database configuration (aligned with other export scripts)
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
    const client = new MongoClient(connectionString, {
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000
    });
    await client.connect();
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

async function loadQuestionsMap(db) {
    const questions = await db.collection('questions')
        .find({})
        .project({ id: 1, question: 1, difficulty: 1, points: 1 })
        .toArray();
    const map = new Map();
    for (const q of questions) {
        map.set(q.id, q);
        map.set(String(q.id), q);
    }
    return map;
}

function pushRow(rows, row) {
    // Normalize and truncate verbose fields for Excel readability
    row.questionText = String(row.questionText || 'Question not found').substring(0, 500);
    row.studentAnswer = String(row.studentAnswer || 'No answer').substring(0, 1000);
    rows.push(row);
}

async function loadFromFinalExams(db, questionsMap) {
    const rows = [];
    const cursor = db.collection('finalExams')
        .find({ mergedAnswers: { $exists: true, $ne: [] } })
        .project({
            studentId: 1,
            studentName: 1,
            studentEmail: 1,
            email: 1,
            startTime: 1,
            endTime: 1,
            status: 1,
            mergedAnswers: 1,
            review: 1
        });

    while (await cursor.hasNext()) {
        const exam = await cursor.next();
        const examId = exam._id?.toString();
        const studentId = exam.studentId || 'N/A';
        const studentName = exam.studentName || 'N/A';
        const studentEmail = exam.studentEmail || exam.email || 'N/A';

        const grades = Array.isArray(exam.review?.questionGrades) ? exam.review.questionGrades : [];

        for (const ans of (exam.mergedAnswers || [])) {
            const qIndex = ans.questionIndex;
            const qId = ans.questionId != null ? ans.questionId : (ans.questionDetails?.id);
            const q = (qId != null ? (questionsMap.get(qId) || questionsMap.get(String(qId))) : undefined);

            const qText = ans.questionText || q?.question || 'Question not found';
            const difficulty = ans.difficulty || q?.difficulty || 'N/A';
            const points = (q?.points != null ? q.points : (ans.points != null ? ans.points : 'N/A'));

            // Grade and feedback from review.questionGrades by questionIndex
            const qg = grades.find(g => g.questionIndex === qIndex);
            const grade = qg?.score;
            const maxScore = qg?.maxScore != null ? qg.maxScore : (points !== 'N/A' ? points : undefined);
            const feedback = qg?.feedback;
            const gradedBy = exam.review?.gradedBy || (qg ? 'admin' : undefined);
            const gradedAt = qg?.gradedAt ? formatDateTime(qg.gradedAt) : undefined;

            pushRow(rows, {
                source: 'finalExams',
                studentId,
                studentName,
                studentEmail,
                examId,
                questionIndex: qIndex,
                questionId: qId ?? 'N/A',
                questionText: qText,
                difficulty,
                points,
                studentAnswer: ans.studentAnswer || ans.answer || 'No answer',
                isCorrect: ans.isCorrect === true ? 'Yes' : (ans.isCorrect === false ? 'No' : 'N/A'),
                grade: grade != null ? grade : 'Not Graded',
                maxScore: maxScore != null ? maxScore : 'N/A',
                feedback: feedback || 'No feedback',
                timeSpentSec: ans.timeSpent || 0,
                answerTimestamp: ans.timestamp ? formatDateTime(ans.timestamp) : (ans.submittedAt ? formatDateTime(ans.submittedAt) : 'N/A'),
                answerTimestampRaw: ans.timestamp ? new Date(ans.timestamp).getTime() : (ans.submittedAt ? new Date(ans.submittedAt).getTime() : 0),
                gradedBy: gradedBy || 'N/A',
                gradedAt: gradedAt || 'N/A'
            });
        }
    }

    return rows;
}

async function loadFromExamSessions(db, questionsMap) {
    const rows = [];

    const sessions = await db.collection('examSessions')
        .find({})
        .project({ studentId: 1, studentName: 1, studentEmail: 1, email: 1, startTime: 1, endTime: 1, status: 1, questions: 1 })
        .toArray();
    if (sessions.length === 0) return rows;

    const examIds = sessions.map(s => s._id?.toString()).filter(Boolean);

    // Preload grades
    const gradesArr = await db.collection('examGrades')
        .find({ examId: { $in: examIds } })
        .project({ examId: 1, gradedBy: 1, questionGrades: 1 })
        .toArray();
    const gradesByExamId = new Map(gradesArr.map(g => [g.examId, g]));

    // Preload answers
    const answers = await db.collection('examAnswers')
        .find({ examId: { $in: examIds } })
        .project({ examId: 1, questionIndex: 1, questionId: 1, questionText: 1, studentAnswer: 1, answer: 1, isCorrect: 1, timeSpent: 1, submittedAt: 1, isAutoSave: 1 })
        .toArray();
    const bestByExamAndIndex = new Map(); // `${examId}:${questionIndex}` -> answer
    const bestByExamAndQid = new Map();   // `${examId}:${questionId}` -> answer
    // choose latest non-autoSave if available
    answers.sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));
    for (const a of answers) {
        const eid = a.examId;
        const idxKey = `${eid}:${a.questionIndex}`;
        const existingIdx = bestByExamAndIndex.get(idxKey);
        const betterIdx = (!existingIdx) || (existingIdx.isAutoSave && !a.isAutoSave) || (new Date(a.submittedAt || 0) >= new Date(existingIdx.submittedAt || 0));
        if (betterIdx) bestByExamAndIndex.set(idxKey, a);
        if (a.questionId != null) {
            const qKey = `${eid}:${a.questionId}`;
            const existingQ = bestByExamAndQid.get(qKey);
            const betterQ = (!existingQ) || (existingQ.isAutoSave && !a.isAutoSave) || (new Date(a.submittedAt || 0) >= new Date(existingQ.submittedAt || 0));
            if (betterQ) bestByExamAndQid.set(qKey, a);
        }
    }

    for (const session of sessions) {
        const examId = session._id?.toString();
        const studentId = session.studentId || 'N/A';
        const studentName = session.studentName || 'N/A';
        const studentEmail = session.studentEmail || session.email || 'N/A';
        const gradeDoc = gradesByExamId.get(examId);

        // Build union of indices from session.questions and answers map
        const indices = new Set();
        if (Array.isArray(session.questions)) {
            for (let i = 0; i < session.questions.length; i += 1) {
                const qi = session.questions[i]?.questionIndex ?? i;
                indices.add(qi);
            }
        }
        for (const key of bestByExamAndIndex.keys()) {
            if (key.startsWith(`${examId}:`)) {
                const qi = parseInt(key.split(':')[1], 10);
                if (!Number.isNaN(qi)) indices.add(qi);
            }
        }

        const sorted = Array.from(indices).sort((a, b) => a - b);
        for (const qIndex of sorted) {
            const ans = bestByExamAndIndex.get(`${examId}:${qIndex}`) || {};
            // Prefer questionId from session.questions when available
            const fromQuestions = Array.isArray(session.questions) ? (session.questions[qIndex] || {}) : {};
            const qId = fromQuestions.questionId ?? fromQuestions.id ?? ans.questionId ?? null;
            const q = (qId != null ? (questionsMap.get(qId) || questionsMap.get(String(qId))) : undefined);
            const qText = fromQuestions.questionText || fromQuestions.text || ans.questionText || q?.question || 'Question not found';
            const difficulty = fromQuestions.difficulty ?? q?.difficulty ?? 'N/A';
            const points = fromQuestions.points ?? q?.points ?? 'N/A';

            // Grade by questionIndex
            let grade, maxScore, feedback, gradedBy, gradedAt;
            if (gradeDoc && Array.isArray(gradeDoc.questionGrades)) {
                const qg = gradeDoc.questionGrades.find(g => g.questionIndex === qIndex);
                if (qg) {
                    grade = qg.score;
                    maxScore = qg.maxScore;
                    feedback = qg.feedback;
                    gradedBy = gradeDoc.gradedBy || 'admin';
                    gradedAt = qg.gradedAt ? formatDateTime(qg.gradedAt) : undefined;
                }
            }

            pushRow(rows, {
                source: 'examSessions',
                studentId,
                studentName,
                studentEmail,
                examId,
                questionIndex: qIndex,
                questionId: qId ?? 'N/A',
                questionText: qText,
                difficulty,
                points,
                studentAnswer: ans.studentAnswer ?? ans.answer ?? 'No answer',
                isCorrect: ans.isCorrect === true ? 'Yes' : (ans.isCorrect === false ? 'No' : 'N/A'),
                grade: grade != null ? grade : 'Not Graded',
                maxScore: maxScore != null ? maxScore : (points !== 'N/A' ? points : 'N/A'),
                feedback: feedback || 'No feedback',
                timeSpentSec: ans.timeSpent || 0,
                answerTimestamp: formatDateTime(ans.submittedAt),
                answerTimestampRaw: ans.submittedAt ? new Date(ans.submittedAt).getTime() : 0,
                gradedBy: gradedBy || 'N/A',
                gradedAt: gradedAt || 'N/A'
            });
        }
    }

    return rows;
}

async function exportGradeByQuestionExcel() {
    const { client, db } = await connectToDatabase();
    try {
        const questionsMap = await loadQuestionsMap(db);

        // Load data from both sources
        const [finalRows, sessionRows] = await Promise.all([
            loadFromFinalExams(db, questionsMap),
            loadFromExamSessions(db, questionsMap)
        ]);

        // Combine and sort by student then by question
        const allRows = [...finalRows, ...sessionRows]
            .sort((a, b) => {
                const se = (a.studentEmail || '').localeCompare(b.studentEmail || '');
                if (se !== 0) return se;
                const src = (a.source || '').localeCompare(b.source || '');
                if (src !== 0) return src;
                const q = (a.questionIndex ?? -1) - (b.questionIndex ?? -1);
                if (q !== 0) return q;
                return String(a.questionId || '').localeCompare(String(b.questionId || ''));
            });

        // Build Excel sheets
        const headers = [
            'Student ID',
            'Student Name',
            'Student Email',
            'Source',
            'Exam ID',
            'Question Index',
            'Question ID',
            'Question Text',
            'Difficulty',
            'Points',
            'Student Answer',
            'Grade',
            'Max Score',
            'Feedback',
            'Is Correct',
            'Time Spent (sec)',
            'Answer Timestamp',
            'Graded By',
            'Graded At'
        ];

        const aoa = [headers];
        for (const r of allRows) {
            aoa.push([
                r.studentId,
                r.studentName,
                r.studentEmail,
                r.source,
                r.examId,
                r.questionIndex,
                r.questionId,
                r.questionText,
                r.difficulty,
                r.points,
                r.studentAnswer,
                r.grade,
                r.maxScore,
                r.feedback,
                r.isCorrect,
                r.timeSpentSec,
                r.answerTimestamp,
                r.gradedBy,
                r.gradedAt
            ]);
        }

        const wb = XLSX.utils.book_new();
        const sheetAll = XLSX.utils.aoa_to_sheet(aoa);
        sheetAll['!cols'] = [
            { wch: 14 }, // Student ID
            { wch: 22 }, // Student Name
            { wch: 32 }, // Student Email
            { wch: 14 }, // Source
            { wch: 28 }, // Exam ID
            { wch: 14 }, // Question Index
            { wch: 14 }, // Question ID
            { wch: 60 }, // Question Text
            { wch: 14 }, // Difficulty
            { wch: 10 }, // Points
            { wch: 60 }, // Student Answer
            { wch: 12 }, // Grade
            { wch: 12 }, // Max Score
            { wch: 30 }, // Feedback
            { wch: 10 }, // Is Correct
            { wch: 16 }, // Time Spent
            { wch: 22 }, // Answer Timestamp
            { wch: 14 }, // Graded By
            { wch: 22 }  // Graded At
        ];
        XLSX.utils.book_append_sheet(wb, sheetAll, 'By Student (All)');

        // Also provide separate sheets per source for convenience
        const toSheet = (rows, name) => {
            const arr = [headers];
            for (const r of rows) {
                arr.push([
                    r.studentId, r.studentName, r.studentEmail, r.source, r.examId, r.questionIndex,
                    r.questionId, r.questionText, r.difficulty, r.points, r.studentAnswer, r.grade,
                    r.maxScore, r.feedback, r.isCorrect, r.timeSpentSec, r.answerTimestamp, r.gradedBy, r.gradedAt
                ]);
            }
            const sh = XLSX.utils.aoa_to_sheet(arr);
            sh['!cols'] = sheetAll['!cols'];
            XLSX.utils.book_append_sheet(wb, sh, name);
        };
        toSheet(finalRows, 'From FinalExams');
        // Keep only questions graded by Admin in ExamSessions data
        const sessionRowsFiltered = sessionRows.filter(r => {
            const hasGrade = r.grade !== 'Not Graded' && r.grade != null && r.grade !== '';
            const grader = String(r.gradedBy || '').toLowerCase();
            const isAdmin = grader.includes('admin');
            return hasGrade && isAdmin;
        });
        // Duplicate detection signature (by normalized question text)
        const makeSig = (text) => {
            const t = String(text || '').toLowerCase().replace(/[\s\W]+/g, ' ').trim();
            return t.substring(0, 200);
        };
        // Group by exam+student
        const grouped = new Map(); // key: examId|email -> rows[]
        for (const r of sessionRowsFiltered) {
            const key = `${r.examId || 'noexam'}|${r.studentEmail || r.studentId || 'unknown'}`;
            const list = grouped.get(key) || [];
            list.push(r);
            grouped.set(key, list);
        }
        // Determine latest per signature for marking duplicates and for summary computation
        const latestByGroupAndSig = new Map(); // key -> Map(sig -> row)
        for (const [key, list] of grouped.entries()) {
            const latestBySig = new Map();
            for (const r of list) {
                const sig = makeSig(r.questionText);
                const prev = latestBySig.get(sig);
                const time = Number.isFinite(r.answerTimestampRaw) ? r.answerTimestampRaw : 0;
                if (!prev || time >= (Number.isFinite(prev.answerTimestampRaw) ? prev.answerTimestampRaw : 0)) {
                    latestBySig.set(sig, r);
                }
            }
            latestByGroupAndSig.set(key, latestBySig);
        }
        // Mark duplicates (do NOT drop any rows in the ExamSessions sheet)
        for (const [key, list] of grouped.entries()) {
            const latestBySig = latestByGroupAndSig.get(key) || new Map();
            for (const r of list) {
                const sig = makeSig(r.questionText);
                const latest = latestBySig.get(sig);
                r.duplicate = latest === r ? 'No' : 'Yes';
            }
        }
        // Build ExamSessions sheet with a Duplicate column
        const sessionHeaders = [
            ...headers,
            'Duplicate'
        ];
        const sessionArr = [sessionHeaders];
        for (const r of sessionRowsFiltered) {
            sessionArr.push([
                r.studentId,
                r.studentName,
                r.studentEmail,
                r.source,
                r.examId,
                r.questionIndex,
                r.questionId,
                r.questionText,
                r.difficulty,
                r.points,
                r.studentAnswer,
                r.grade,
                r.maxScore,
                r.feedback,
                r.isCorrect,
                r.timeSpentSec,
                r.answerTimestamp,
                r.gradedBy,
                r.gradedAt,
                r.duplicate || 'No'
            ]);
        }
        const sessionSheet = XLSX.utils.aoa_to_sheet(sessionArr);
        sessionSheet['!cols'] = [...sheetAll['!cols'], { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, sessionSheet, 'From ExamSessions');

        // Build a deduplicated view for summary (unique latest per signature)
        const sessionRowsDeduped = [];
        const totalsIssues = [];
        const totalsCheckRows = [];
        for (const [key, list] of grouped.entries()) {
            const latestBySig = latestByGroupAndSig.get(key) || new Map();
            const uniqueRows = Array.from(latestBySig.values());
            sessionRowsDeduped.push(...uniqueRows);
            // Check totals per exam-student
            let totalMax = 0;
            let totalPoints = 0;
            for (const r of uniqueRows) {
                const maxNum = typeof r.maxScore === 'number' ? r.maxScore : parseFloat(r.maxScore);
                if (Number.isFinite(maxNum)) totalMax += maxNum;
                const ptsNum = typeof r.points === 'number' ? r.points : parseFloat(r.points);
                if (Number.isFinite(ptsNum)) totalPoints += ptsNum;
            }
            const [examId, email] = key.split('|');
            const equals100Points = Math.abs(totalPoints - 100) <= 1e-6;
            const equals100Max = Math.abs(totalMax - 100) <= 1e-6;
            if (!equals100Points || !equals100Max) {
                totalsIssues.push({ examId, studentEmail: email, totalPoints, totalMax });
            }
            totalsCheckRows.push({ examId, studentEmail: email, uniqueQuestions: uniqueRows.length, totalPoints, totalMax, equals100Points, equals100Max });
        }
        if (totalsIssues.length > 0) {
            console.warn(`⚠️ ExamSessions: ${totalsIssues.length} student-exam groups have totals != 100 (by Points and/or Max Score)`);
        }
        // Add a worksheet with totals per exam-student
        const totalsHeaders = ['Exam ID', 'Student Email', 'Unique Questions', 'Sum Points', 'Sum Max Score', 'Points == 100', 'Max == 100'];
        const totalsAoa = [totalsHeaders];
        for (const row of totalsCheckRows.sort((a,b) => (a.studentEmail||'').localeCompare(b.studentEmail||'') || String(a.examId||'').localeCompare(String(b.examId||'')))) {
            totalsAoa.push([
                row.examId,
                row.studentEmail,
                row.uniqueQuestions,
                row.totalPoints,
                row.totalMax,
                row.equals100Points ? 'Yes' : 'No',
                row.equals100Max ? 'Yes' : 'No'
            ]);
        }
        const totalsSheet = XLSX.utils.aoa_to_sheet(totalsAoa);
        totalsSheet['!cols'] = [
            { wch: 28 },
            { wch: 32 },
            { wch: 18 },
            { wch: 14 },
            { wch: 16 },
            { wch: 14 },
            { wch: 12 }
        ];
        XLSX.utils.book_append_sheet(wb, totalsSheet, 'ExamSessions Totals');

        // Build ExamSessions summary grouped by student (sum points)
        const summaryMap = new Map(); // key: email
        for (const r of sessionRowsDeduped) {
            const key = r.studentEmail || r.studentId || 'unknown';
            const current = summaryMap.get(key) || {
                studentId: r.studentId,
                studentName: r.studentName,
                studentEmail: r.studentEmail,
                gradedQuestions: 0,
                totalPoints: 0,
                totalMaxScore: 0,
                exams: new Set()
            };
            const gradeNum = typeof r.grade === 'number' ? r.grade : parseFloat(r.grade);
            const maxNum = typeof r.maxScore === 'number' ? r.maxScore : parseFloat(r.maxScore);
            current.gradedQuestions += 1;
            current.totalPoints += Number.isFinite(gradeNum) ? gradeNum : 0;
            current.totalMaxScore += Number.isFinite(maxNum) ? maxNum : 0;
            if (r.examId) current.exams.add(String(r.examId));
            summaryMap.set(key, current);
        }

        const summaryHeaders = [
            'Student ID',
            'Student Name',
            'Student Email',
            'Exams Count',
            'Graded Questions',
            'Sum Points',
            'Sum Max Score',
            'Percentage'
        ];
        const summaryAoa = [summaryHeaders];
        const summaryRows = Array.from(summaryMap.values()).sort((a, b) => (a.studentEmail || '').localeCompare(b.studentEmail || ''));
        for (const s of summaryRows) {
            const percentage = s.totalMaxScore > 0 ? Math.round((s.totalPoints / s.totalMaxScore) * 100) : 0;
            summaryAoa.push([
                s.studentId,
                s.studentName,
                s.studentEmail,
                s.exams.size,
                s.gradedQuestions,
                s.totalPoints,
                s.totalMaxScore,
                `${percentage}%`
            ]);
        }
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa);
        summarySheet['!cols'] = [
            { wch: 14 }, // Student ID
            { wch: 22 }, // Student Name
            { wch: 32 }, // Student Email
            { wch: 14 }, // Exams Count
            { wch: 18 }, // Graded Questions
            { wch: 12 }, // Sum Points
            { wch: 14 }, // Sum Max Score
            { wch: 12 }  // Percentage
        ];
        XLSX.utils.book_append_sheet(wb, summarySheet, 'ExamSessions Summary');

        const datePart = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `GradeByQuestion_ByStudent_${datePart}.xlsx`;
        XLSX.writeFile(wb, filename);

        const summary = {
            timestamp: new Date().toISOString(),
            filename,
            totalRows: allRows.length,
            finalExamRows: finalRows.length,
            examSessionRows: sessionRows.length,
            examSessionRowsFiltered: sessionRowsFiltered.length,
            examSessionRowsDeduped: sessionRowsDeduped.length,
            examSessionSummaryStudents: summaryRows.length,
            examSessionSummaryTotalPoints: summaryRows.reduce((sum, r) => sum + r.totalPoints, 0),
            examSessionTotalsNot100Count: totalsIssues.length
        };
        fs.writeFileSync(`GradeByQuestion_ByStudent_Summary_${datePart}.json`, JSON.stringify(summary, null, 2));

        console.log('✅ Export complete');
        console.log(`📄 Excel File: ${filename}`);
        console.log(`📊 Total Rows: ${allRows.length} (FinalExams: ${finalRows.length}, ExamSessions: ${sessionRows.length})`);
        return filename;
    } finally {
        await client.close();
    }
}

async function main() {
    try {
        await exportGradeByQuestionExcel();
    } catch (err) {
        console.error('❌ Export failed:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { exportGradeByQuestionExcel };


