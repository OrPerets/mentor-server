const { MongoClient } = require('mongodb');

async function testCreateSession() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  
  try {
    await client.connect();
    const db = client.db('finalExams');
    
    console.log('🔍 Testing session creation...');
    
    // Test creating a session directly
    const examSession = {
      studentEmail: 'test@exam.local',
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
    
    console.log('📝 Inserting test session...');
    const result = await db.collection("examSessions").insertOne(examSession);
    console.log('✅ Session created with ID:', result.insertedId);
    
    // Verify it was created
    const createdSession = await db.collection("examSessions").findOne({ _id: result.insertedId });
    console.log('🔍 Retrieved session:', {
      _id: createdSession._id,
      studentId: createdSession.studentId,
      status: createdSession.status,
      totalQuestions: createdSession.totalQuestions
    });
    
    // Clean up - delete the test session
    await db.collection("examSessions").deleteOne({ _id: result.insertedId });
    console.log('🧹 Test session cleaned up');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testCreateSession();
