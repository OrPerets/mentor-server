const { MongoClient } = require('mongodb');

async function debugStudentSession() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  
  try {
    await client.connect();
    const db = client.db('finalExams');
    
    // First, let's see all exam sessions in the database
    console.log(`🔍 Checking all exam sessions in database...`);
    
    const allSessions = await db.collection("examSessions").find({}).toArray();
    console.log(`📊 Total sessions in database: ${allSessions.length}`);
    
    if (allSessions.length > 0) {
      console.log(`Recent sessions:`, allSessions.slice(-5).map(s => ({
        studentId: s.studentId,
        status: s.status,
        startTime: s.startTime,
        totalQuestions: s.totalQuestions
      })));
    }
    
    // Now check specific student
    const studentId = "207917899"; // Update this with your actual student ID
    console.log(`\n🔍 Debugging session for student: ${studentId}`);
    
    // Check active sessions
    const activeSessions = await db.collection("examSessions").find({ 
      studentId: studentId,
      status: 'in_progress'
    }).toArray();
    
    console.log(`📊 Active sessions (in_progress):`, activeSessions.length);
    activeSessions.forEach((session, index) => {
      console.log(`  Session ${index + 1}:`, {
        examId: session._id,
        status: session.status,
        startTime: session.startTime,
        totalQuestions: session.totalQuestions,
        currentQuestionIndex: session.currentQuestionIndex
      });
    });
    
    // Check completed sessions
    const completedSessions = await db.collection("examSessions").find({ 
      studentId: studentId,
      status: 'completed'
    }).toArray();
    
    console.log(`✅ Completed sessions:`, completedSessions.length);
    completedSessions.forEach((session, index) => {
      console.log(`  Session ${index + 1}:`, {
        examId: session._id,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime,
        totalQuestions: session.totalQuestions
      });
    });
    
    // Check all sessions for this student
    const studentSessions = await db.collection("examSessions").find({ 
      studentId: studentId
    }).toArray();
    
    console.log(`📋 All sessions for student:`, studentSessions.length);
    studentSessions.forEach((session, index) => {
      console.log(`  Session ${index + 1}:`, {
        examId: session._id,
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime || 'Not ended',
        totalQuestions: session.totalQuestions,
        currentQuestionIndex: session.currentQuestionIndex || 0
      });
    });
    
    // Check answers for the most recent session
    if (studentSessions.length > 0) {
      const latestSession = studentSessions[studentSessions.length - 1];
      const answers = await db.collection("examAnswers").find({ 
        examId: latestSession._id.toString()
      }).toArray();
      
      console.log(`💭 Answers for latest session (${latestSession._id}):`, answers.length);
      answers.forEach((answer, index) => {
        console.log(`  Answer ${index + 1}:`, {
          questionIndex: answer.questionIndex,
          difficulty: answer.difficulty,
          isCorrect: answer.isCorrect,
          isAutoSave: answer.isAutoSave,
          submittedAt: answer.submittedAt
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugStudentSession();
