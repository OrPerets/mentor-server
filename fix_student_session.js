const { MongoClient } = require('mongodb');

async function fixStudentSession() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  
  try {
    await client.connect();
    const db = client.db('finalExams');
    
    // Replace with your student ID
    const studentId = "207917899"; // Update this with your actual student ID
    
    console.log(`🔧 Fixing session for student: ${studentId}`);
    
    // Find the most recent session for this student
    const latestSession = await db.collection("examSessions").findOne(
      { studentId: studentId },
      { sort: { startTime: -1 } }
    );
    
    if (!latestSession) {
      console.log('❌ No session found for student');
      return;
    }
    
    console.log(`📋 Found session:`, {
      examId: latestSession._id,
      status: latestSession.status,
      startTime: latestSession.startTime,
      totalQuestions: latestSession.totalQuestions
    });
    
    // Get answers for this session
    const answers = await db.collection("examAnswers").find({ 
      examId: latestSession._id.toString()
    }).sort({ questionIndex: 1 }).toArray();
    
    console.log(`💭 Found ${answers.length} answers`);
    
    // Calculate the correct current question index
    const currentQuestionIndex = answers.length;
    const canResume = currentQuestionIndex < latestSession.totalQuestions;
    
    console.log(`📊 Analysis:`, {
      answeredQuestions: answers.length,
      currentQuestionIndex: currentQuestionIndex,
      totalQuestions: latestSession.totalQuestions,
      canResume: canResume,
      shouldBeStatus: canResume ? 'in_progress' : 'completed'
    });
    
    // Fix the session status if needed
    if (canResume && latestSession.status !== 'in_progress') {
      console.log(`🔄 Fixing session status from '${latestSession.status}' to 'in_progress'`);
      
      const updateResult = await db.collection("examSessions").updateOne(
        { _id: latestSession._id },
        { 
          $set: { 
            status: 'in_progress',
            currentQuestionIndex: currentQuestionIndex,
            lastUpdated: new Date()
          },
          $unset: {
            endTime: ""  // Remove endTime since exam is not completed
          }
        }
      );
      
      console.log(`✅ Update result:`, updateResult);
    } else if (!canResume && latestSession.status !== 'completed') {
      console.log(`🏁 Setting session status to 'completed' (all questions answered)`);
      
      const updateResult = await db.collection("examSessions").updateOne(
        { _id: latestSession._id },
        { 
          $set: { 
            status: 'completed',
            endTime: new Date(),
            currentQuestionIndex: currentQuestionIndex,
            lastUpdated: new Date()
          }
        }
      );
      
      console.log(`✅ Update result:`, updateResult);
    } else {
      console.log(`✅ Session status is already correct: ${latestSession.status}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

fixStudentSession();
