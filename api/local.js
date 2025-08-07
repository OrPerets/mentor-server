const { MongoClient } = require("mongodb");
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const { finished } = require("stream/promises");  // 🆕 await gzip.end

const uri = "mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net";
const dbName = "experiment";
const collectionName = "finalExams";
const outputPath = path.join(__dirname, "finalExams_all.json.gz");

async function exportCollection() {
  console.time("⏱ Export duration");
  console.log(`🚀 Starting export from ${dbName}.${collectionName}...`);

  const client = new MongoClient(uri);
  const output = fs.createWriteStream(outputPath);
  const gzip = zlib.createGzip();
  gzip.pipe(output);

  try {
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);

    const totalCount = await collection.countDocuments();
    console.log(`📦 Found ${totalCount} documents to export`);

    const cursor = collection
      .find({}, { projection: { _id: 1, examTitle: 1, date: 1, questions: 1 } })
      .batchSize(10);

    let count = 0;
    let first = true;

    gzip.write("[\n");

    for await (const doc of cursor) {
      const jsonLine = JSON.stringify(doc);
      gzip.write((first ? "" : ",\n") + jsonLine);
      first = false;
      count++;

      if (count % 10 === 0 || count === totalCount) {
        console.log(`📤 Exported ${count}/${totalCount}`);
      }
    }

    gzip.write("\n]");
    gzip.end();

    // 🔁 Ensure gzip stream fully flushed
    await finished(output);
    console.log("✅ Export complete! Output:", outputPath);
  } catch (err) {
    console.error("❌ Export failed:", err.message);
  } finally {
    await client.close();
    console.timeEnd("⏱ Export duration");
  }
}

exportCollection();
