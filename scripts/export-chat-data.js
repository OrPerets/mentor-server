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

async function exportChatData() {
    let client;
    
    try {
        // Connect to database
        const connection = await connectToDatabase();
        client = connection.client;
        const db = connection.db;
        
        console.log("📊 Starting chat data export...");
        
        // Get all chat sessions
        console.log("🔍 Fetching all chat sessions...");
        const sessions = await db.collection("practiceQueries").find({}).toArray();
        // console.log(`📋 Found ${sessions.length} chat sessions`);
        
        // Get all chat messages
        // console.log("🔍 Fetching all chat messages...");
        // const messages = await db.collection("chatMessages").find({}).toArray();
        // console.log(`💬 Found ${messages.length} chat messages`);
        
        // Group messages by chatId
        const messagesByChatId = {};
        const orphanedMessages = [];
        
        // // Create unified data structure
        // const unifiedData = {
        //     exportDate: new Date().toISOString(),
        //     totalSessions: sessions.length,
        //     totalMessages: messages.length,
        //     orphanedMessages: orphanedMessages.length,
        //     sessions: []
        // };
        // messages.forEach(message => {
        //     if (!message.chatId) {
        //         orphanedMessages.push(message);
        //         return;
        //     }
        //     const chatId = message.chatId.toString();
        //     if (!messagesByChatId[chatId]) {
        //         messagesByChatId[chatId] = [];
        //     }
        //     messagesByChatId[chatId].push(message);
        // });
        
        // if (orphanedMessages.length > 0) {
        //     console.log(`⚠️  Found ${orphanedMessages.length} messages without chatId (orphaned messages)`);
        // }
        
        // // Create unified session objects with their messages
        // sessions.forEach(session => {
        //     const sessionId = session._id.toString();
        //     const sessionMessages = messagesByChatId[sessionId] || [];
            
        //     // Sort messages by timestamp
        //     sessionMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
        //     const unifiedSession = {
        //         sessionId: sessionId,
        //         userId: session.userId,
        //         title: session.title,
        //         createdAt: session.createdAt,
        //         lastMessageTimestamp: session.lastMessageTimestamp,
        //         messageCount: sessionMessages.length,
        //         messages: sessionMessages.map(msg => ({
        //             messageId: msg._id.toString(),
        //             role: msg.role,
        //             text: msg.text,
        //             timestamp: msg.timestamp
        //         }))
        //     };
            
        //     unifiedData.sessions.push(unifiedSession);
        // });
        
        // // Sort sessions by creation date (newest first)
        // unifiedData.sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Create output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'exports');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `queries-${timestamp}.json`;
        const filepath = path.join(outputDir, filename);
        
        // Write to file
        fs.writeFileSync(filepath, JSON.stringify(sessions, null, 2));
        
        console.log(`✅ Export completed successfully!`);
        // console.log(`📁 File saved to: ${filepath}`);
        // console.log(`📊 Summary:`);
        // console.log(`   - Total sessions: ${unifiedData.totalSessions}`);
        // console.log(`   - Total messages: ${unifiedData.totalMessages}`);
        // console.log(`   - Orphaned messages (no chatId): ${orphanedMessages.length}`);
        // console.log(`   - Sessions with messages: ${unifiedData.sessions.filter(s => s.messageCount > 0).length}`);
        // console.log(`   - Sessions without messages: ${unifiedData.sessions.filter(s => s.messageCount === 0).length}`);
        
        // // Show some statistics
        // const sessionsWithMessages = unifiedData.sessions.filter(s => s.messageCount > 0);
        // if (sessionsWithMessages.length > 0) {
        //     const avgMessages = sessionsWithMessages.reduce((sum, s) => sum + s.messageCount, 0) / sessionsWithMessages.length;
        //     console.log(`   - Average messages per session: ${avgMessages.toFixed(2)}`);
            
        //     const maxMessages = Math.max(...sessionsWithMessages.map(s => s.messageCount));
        //     const minMessages = Math.min(...sessionsWithMessages.map(s => s.messageCount));
        //     console.log(`   - Max messages in a session: ${maxMessages}`);
        //     console.log(`   - Min messages in a session: ${minMessages}`);
        // }
        
    } catch (error) {
        console.error("❌ Export failed:", error);
        throw error;
    } finally {
        if (client) {
            await client.close();
            console.log("🔌 Database connection closed");
        }
    }
}

// Run the export if this script is executed directly
if (require.main === module) {
    exportChatData()
        .then(() => {
            console.log("🎉 Export process completed!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("💥 Export process failed:", error);
            process.exit(1);
        });
}

module.exports = { exportChatData };
