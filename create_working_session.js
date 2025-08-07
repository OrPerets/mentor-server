const { MongoClient } = require('mongodb');

async function createWorkingSession() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  
  try {
    await client.connect();
    const db = client.db('finalExams');
    
    console.log('🔧 Creating working session for student...');
    
    // Create a proper session that will work with the resume logic
    const examSession = {
      studentEmail: 'student_207917899@exam.local',
      examTitle: 'בחינת מיומנות SQL',
      studentId: '207917899',
      studentName: 'תומר ששון',
      startTime: new Date(),
      endTime: null,
      status: 'in_progress',
      currentQuestionIndex: 0,
      totalQuestions: 13,
      questions: [],
      score: 0,
      createdAt: new Date(),
      clientIp: '127.0.0.1',
      browserFingerprint: null,
      accessAttempts: [{
        timestamp: new Date(),
        clientIp: '127.0.0.1',
        browserFingerprint: null,
        success: true
      }]
    };
    
    // Check if a session already exists
    const existingSession = await db.collection("examSessions").findOne({
      studentId: '207917899'
    });
    
    if (existingSession) {
      console.log(`⚠️ Session already exists: ${existingSession._id}`);
      console.log(`Status: ${existingSession.status}`);
      
      // If it's marked as completed but shouldn't be, fix it
      const answers = await db.collection("examAnswers").find({ 
        examId: existingSession._id.toString()
      }).toArray();
      
      const currentQuestionIndex = answers.length;
      const shouldBeCompleted = currentQuestionIndex >= existingSession.totalQuestions;
      
      console.log(`Answered questions: ${answers.length}/${existingSession.totalQuestions}`);
      console.log(`Should be completed: ${shouldBeCompleted}`);
      
      if (!shouldBeCompleted && existingSession.status === 'completed') {
        console.log('🔄 Fixing session status to in_progress...');
        await db.collection("examSessions").updateOne(
          { _id: existingSession._id },
          { 
            $set: { 
              status: 'in_progress',
              currentQuestionIndex: currentQuestionIndex
            },
            $unset: { endTime: "" }
          }
        );
        console.log('✅ Session status fixed');
      }
      
    } else {
      console.log('📝 Creating new session...');
      const result = await db.collection("examSessions").insertOne(examSession);
      console.log('✅ Session created with ID:', result.insertedId);
    }
    
    // Verify the final state
    const finalSession = await db.collection("examSessions").findOne({
      studentId: '207917899'
    });
    
    console.log('🔍 Final session state:', {
      _id: finalSession._id,
      studentId: finalSession.studentId,
      status: finalSession.status,
      currentQuestionIndex: finalSession.currentQuestionIndex,
      totalQuestions: finalSession.totalQuestions
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

createWorkingSession();
