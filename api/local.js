const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./config');
const fs = require('fs');
const xlsx = require('xlsx');
const { flatten } = require('flat');

const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;

async function downloadAll() {
  const client = new MongoClient(connectionString, {
    serverApi: ServerApiVersion.v1
  });

  try {
    await client.connect();
    const db = client.db("experiment");

    // 1. Export UserForms (with flatten)
    const userForms = await db.collection("UserForms").find().toArray();
    const flattenedForms = userForms.map(doc => flatten(doc));
    saveAsExcel(flattenedForms, 'UserForms.xlsx');

    // 2. Export chatSessions
    const chatSessions = await db.collection("chatSessions").find().toArray();
    saveAsExcel(chatSessions, 'ChatSessions.xlsx');

    // 3. Export chatMessages as one big flat file: userId, role, text, timestamp
    const chatMessages = await db.collection("chatMessages").find().toArray();
    const sessionMap = {};
    chatSessions.forEach(session => {
      sessionMap[session._id.toString()] = session.userId;
    });

    const formattedMessages = chatMessages.map(msg => ({
      userId: sessionMap[msg.chatId?.toString()] || 'unknown',
      role: msg.role,
      message: msg.text,
      timestamp: msg.timestamp,
    }));

    saveAsExcel(formattedMessages, 'ChatMessages_Flat.xlsx');

    console.log("✅ All collections exported successfully!");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
  }
}

function saveAsExcel(data, fileName) {
  const worksheet = xlsx.utils.json_to_sheet(data);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  xlsx.writeFile(workbook, fileName);
}

downloadAll();
