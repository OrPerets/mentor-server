const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const config = require('../api/config');

// Database connection configuration
const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;

async function connectToDatabase() {
    const client = new MongoClient(connectionString, {
        serverApi: {
            version: '1',
            strict: true,
            deprecationErrors: true,
        },
        maxPoolSize: 1,
        serverSelectionTimeoutMS: 15000,
        heartbeatFrequencyMS: 60000,
        minPoolSize: 0,
    });

    await client.connect();
    await client.db("experiment").command({ ping: 1 });
    console.log("✅ Successfully connected to MongoDB!");
    
    return { client, db: client.db("experiment") };
}

async function exportSample() {
    let client;
    
    try {
        // Connect to database
        const connection = await connectToDatabase();
        client = connection.client;
        const db = connection.db;
        
        console.log("📊 Starting sample export...");
        
        // Get first 3 chat sessions
        console.log("🔍 Fetching sample chat sessions...");
        const sessions = await db.collection("chatSessions").find({}).limit(3).toArray();
        console.log(`📋 Found ${sessions.length} sample sessions`);
        
        // Get messages for these sessions
        const sessionIds = sessions.map(s => s._id);
        const messages = await db.collection("chatMessages").find({ 
            chatId: { $in: sessionIds } 
        }).toArray();
        console.log(`💬 Found ${messages.length} messages for sample sessions`);
        
        // Create sample data structure
        const sampleData = {
            exportDate: new Date().toISOString(),
            note: "This is a sample export showing the data structure",
            totalSessions: sessions.length,
            totalMessages: messages.length,
            sessions: []
        };
        
        // Group messages by chatId
        const messagesByChatId = {};
        messages.forEach(message => {
            if (!message.chatId) return;
            const chatId = message.chatId.toString();
            if (!messagesByChatId[chatId]) {
                messagesByChatId[chatId] = [];
            }
            messagesByChatId[chatId].push(message);
        });
        
        // Create sample session objects
        sessions.forEach(session => {
            const sessionId = session._id.toString();
            const sessionMessages = messagesByChatId[sessionId] || [];
            
            // Sort messages by timestamp
            sessionMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            const sampleSession = {
                sessionId: sessionId,
                userId: session.userId,
                title: session.title,
                createdAt: session.createdAt,
                lastMessageTimestamp: session.lastMessageTimestamp,
                messageCount: sessionMessages.length,
                messages: sessionMessages.map(msg => ({
                    messageId: msg._id.toString(),
                    role: msg.role,
                    text: msg.text,
                    timestamp: msg.timestamp
                }))
            };
            
            sampleData.sessions.push(sampleSession);
        });
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'exports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Save sample file
        const sampleFilepath = path.join(outputDir, 'chat-export-sample.json');
        fs.writeFileSync(sampleFilepath, JSON.stringify(sampleData, null, 2));
        
        console.log(`✅ Sample export completed!`);
        console.log(`📁 Sample file saved to: ${sampleFilepath}`);
        
        // Show structure
        console.log(`\n📋 Data Structure:`);
        console.log(`├── exportDate: ISO timestamp`);
        console.log(`├── totalSessions: number of sessions`);
        console.log(`├── totalMessages: number of messages`);
        console.log(`└── sessions: array of session objects`);
        console.log(`    ├── sessionId: unique session identifier`);
        console.log(`    ├── userId: user identifier`);
        console.log(`    ├── title: session title`);
        console.log(`    ├── createdAt: session creation timestamp`);
        console.log(`    ├── lastMessageTimestamp: last message timestamp`);
        console.log(`    ├── messageCount: number of messages in session`);
        console.log(`    └── messages: array of message objects`);
        console.log(`        ├── messageId: unique message identifier`);
        console.log(`        ├── role: message role (user/assistant)`);
        console.log(`        ├── text: message content`);
        console.log(`        └── timestamp: message timestamp`);
        
    } catch (error) {
        console.error("❌ Sample export failed:", error);
        throw error;
    } finally {
        if (client) {
            await client.close();
            console.log("🔌 Database connection closed");
        }
    }
}

// Run the sample export
if (require.main === module) {
    exportSample()
        .then(() => {
            console.log("🎉 Sample export completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("💥 Sample export failed:", error);
            process.exit(1);
        });
}

module.exports = { exportSample };
