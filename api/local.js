const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');
const config = require('./config');

const remoteDbPassword = config.dbPassword;
const dbUserName = config.dbUserName;
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;

async function exportData() {
  const client = new MongoClient(connectionString, {
    serverApi: ServerApiVersion.v1
  });

  try {
    await client.connect();
    const db = client.db("experiment");
    const collections = await db.listCollections().toArray();
    console.log("📁 Collections in DB:", collections.map(c => c.name));

    // 1. Export userForms collection
    const userForms = await db.collection("UserForms").find({}).toArray();
    fs.writeFileSync("userForms_export.json", JSON.stringify(userForms, null, 2));
    console.log("✅ userForms exported!");

    // 2. Merge chatMessages with chatSessions (March 2025 to today)
    const chatMessages = await db.collection("chatMessages").aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date("2025-03-01T00:00:00.000Z"),
            $lte: new Date()
          }
        }
      },
      {
        $addFields: {
          chatIdObject: { $toObjectId: "$chatId" }
        }
      },
      {
        $lookup: {
          from: "chatSessions",
          localField: "chatIdObject",
          foreignField: "_id",
          as: "session"
        }
      },
      { $unwind: "$session" }
    ]).toArray();
    
    console.log("✅ Merged & filtered messages:", chatMessages.length);

    fs.writeFileSync("chatMessages_with_sessions.json", JSON.stringify(chatMessages, null, 2));
    console.log("✅ chatMessages merged and exported!");

  } catch (err) {
    console.error("❌ Error exporting data:", err);
  } finally {
    await client.close();
  }
}

exportData();
