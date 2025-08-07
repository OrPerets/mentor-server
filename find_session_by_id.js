const { MongoClient, ObjectId } = require('mongodb');

async function findSessionById() {
  const client = new MongoClient('mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor');
  
  try {
    await client.connect();
    console.log('🔍 Searching for session by ID...');
    
    // The session ID from the curl response
    const sessionId = "6894520ede0dd014cf9fcf29";
    
    // Try different database names
    const dbNames = ['finalExams', 'exam', 'default', 'test'];
    
    for (const dbName of dbNames) {
      console.log(`\n📂 Checking database: ${dbName}`);
      const db = client.db(dbName);
      
      // Check collections in this database
      const collections = await db.listCollections().toArray();
      console.log(`Collections:`, collections.map(c => c.name));
      
      // Try to find the session
      try {
        const session = await db.collection("examSessions").findOne({ 
          _id: new ObjectId(sessionId) 
        });
        
        if (session) {
          console.log(`✅ Found session in ${dbName}:`, {
            _id: session._id,
            studentId: session.studentId,
            status: session.status
          });
        } else {
          console.log(`❌ No session found in ${dbName}`);
        }
        
        // Also check total count
        const totalCount = await db.collection("examSessions").countDocuments();
        console.log(`Total sessions in ${dbName}: ${totalCount}`);
        
      } catch (error) {
        console.log(`❌ Error checking ${dbName}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

findSessionById();
