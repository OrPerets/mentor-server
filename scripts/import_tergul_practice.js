// Seed practiceTables and practiceQueries from tergul_tables_schema.json
// Usage: node import_tergul_practice.js

const fs = require('fs');
const path = require('path');
const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('../api/config');

const APP_NAME = 'SQLMentor';
const CLUSTER = 'sqlmentor.ydqmecv.mongodb.net';
const DB_NAME = 'experiment';
const PRACTICE_TABLES = 'practiceTables';
const PRACTICE_QUERIES = 'practiceQueries';

function buildMongoUri() {
  // Prefer env var if provided, otherwise construct from config defaults
  const fromEnv = process.env.MONGODB_URI || config.mongoUri;
  if (fromEnv) return fromEnv;
  const username = process.env.dbUserName || config.dbUserName;
  const password = process.env.dbPassword || config.dbPassword;
  return `mongodb+srv://${username}:${password}@${CLUSTER}/?retryWrites=true&w=majority&appName=${APP_NAME}`;
}

function isValidTableName(name) {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function extractTableNameFromSql(fullSql) {
  if (!fullSql || typeof fullSql !== 'string') return null;
  const match = fullSql.match(/create\s+table\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  return match ? match[1] : null;
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns)) return [];
  return columns
    .filter(c => c && typeof c === 'object' && c.name)
    .map(c => ({
      name: c.name,
      type: c.type || null,
      notNull: !!c.notNull,
      primaryKey: !!c.primaryKey,
      unique: !!c.unique,
      autoIncrement: !!c.autoIncrement,
      raw: c.raw || null
    }));
}

function pickColumnsByType(columns) {
  const toLower = v => (v || '').toString().toLowerCase();
  const isText = t => /text|char|varchar|string/.test(toLower(t));
  const isNumeric = t => /int|float|double|decimal|numeric/.test(toLower(t));
  const isDate = t => /date|time|timestamp/.test(toLower(t));
  const text = columns.filter(c => isText(c.type));
  const numeric = columns.filter(c => isNumeric(c.type));
  const date = columns.filter(c => isDate(c.type));
  return { text, numeric, date };
}

function generateQueriesForTable(tableDoc) {
  const tableName = tableDoc.table;
  const cols = Array.isArray(tableDoc.columns) ? tableDoc.columns : [];
  const { text, numeric, date } = pickColumnsByType(cols);

  const queries = [];

  // Q1: List all rows
  queries.push({
    question: `הצג את כל הרשומות מטבלה ${tableName}.`,
    answerSql: `SELECT * FROM ${tableName};`,
    difficulty: 'easy'
  });

  // Q2: Count rows
  queries.push({
    question: `כמה רשומות יש בטבלה ${tableName}?`,
    answerSql: `SELECT COUNT(*) AS total FROM ${tableName};`,
    difficulty: 'easy'
  });

  // Q3: Text filter or distinct
  if (text.length > 0) {
    const tcol = text[0].name;
    queries.push({
      question: `הצג את 10 הרשומות הראשונות בהן ${tcol} אינו ריק, ממוין לפי ${tcol}.`,
      answerSql: `SELECT * FROM ${tableName} WHERE ${tcol} IS NOT NULL ORDER BY ${tcol} ASC;`,
      difficulty: 'easy'
    });
  } else if (cols.length > 0) {
    queries.push({
      question: `הצג את 10 הרשומות הראשונות ממוין לפי העמודה הראשונה.`,
      answerSql: `SELECT * FROM ${tableName} ORDER BY ${cols[0].name} ASC;`,
      difficulty: 'easy'
    });
  }

  // Q4: Numeric filter
  if (numeric.length > 0) {
    const ncol = numeric[0].name;
    const threshold = /id/i.test(ncol) ? 100 : 30;
    queries.push({
      question: `מצא רשומות בהן ${ncol} גדול מ-${threshold}.`,
      answerSql: `SELECT * FROM ${tableName} WHERE ${ncol} > ${threshold};`,
      difficulty: 'medium'
    });
  }

  // Q5: Date ordering or LIKE on text
  if (date.length > 0) {
    const dcol = date[0].name;
    queries.push({
      question: `הצג את 10 הרשומות העדכניות ביותר לפי ${dcol}.`,
      answerSql: `SELECT * FROM ${tableName} WHERE ${dcol} IS NOT NULL ORDER BY ${dcol} DESC;`,
      difficulty: 'medium'
    });
  } else if (text.length > 0) {
    const tcol = text[0].name;
    queries.push({
      question: `מצא רשומות בהן ${tcol} מתחיל באות 'A'.`,
      answerSql: `SELECT * FROM ${tableName} WHERE ${tcol} LIKE 'A%';`,
      difficulty: 'medium'
    });
  }

  // Ensure at least 3 queries
  return queries.slice(0, Math.max(3, Math.min(5, queries.length)));
}

async function main() {
  const uri = buildMongoUri();
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    },
    maxPoolSize: 1
  });

  const schemaPath = path.join(__dirname, 'tergul_tables_schema.json');
  if (!fs.existsSync(schemaPath)) {
    console.error('Schema file not found:', schemaPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(schemaPath, 'utf8');
  let schemaJson;
  try {
    schemaJson = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse schema JSON:', e.message);
    process.exit(1);
  }

  await client.connect();
  const db = client.db(DB_NAME);

  // Indexes to prevent duplicates
  await db.collection(PRACTICE_TABLES).createIndex({ practiceId: 1, table: 1 }, { unique: true });
  await db.collection(PRACTICE_QUERIES).createIndex({ practiceId: 1, table: 1, question: 1 }, { unique: true });

  let tableUpserts = 0;
  let queryUpserts = 0;
  const skipped = [];

  const practiceIds = Object.keys(schemaJson);
  for (const practiceId of practiceIds) {
    const tables = schemaJson[practiceId];
    if (!Array.isArray(tables)) continue;

    for (let i = 0; i < tables.length; i++) {
      const entry = tables[i];
      if (!entry || typeof entry !== 'object') continue;

      // Determine table name (prefer clean name or extract from SQL)
      let tableName = entry.table;
      if (!isValidTableName(tableName)) {
        const fromSql = extractTableNameFromSql(entry.fullSql);
        if (isValidTableName(fromSql)) {
          tableName = fromSql;
        }
      }

      const columns = normalizeColumns(entry.columns);

      // Skip if we still don't have a valid table name or at least one column
      if (!isValidTableName(tableName) || columns.length === 0) {
        skipped.push({ practiceId, index: i, reason: 'invalid_table_or_no_columns', rawTable: entry.table || null });
        continue;
      }

      const tableDoc = {
        columns,
        constraints: Array.isArray(entry.constraints) ? entry.constraints : [],
        fullSql: typeof entry.fullSql === 'string' ? entry.fullSql : null,
        updatedAt: new Date()
      };

      // Upsert into practiceTables
      await db.collection(PRACTICE_TABLES).updateOne(
        { practiceId, table: tableName },
        { $set: tableDoc, $setOnInsert: { createdAt: new Date(), practiceId, table: tableName } },
        { upsert: true }
      );
      tableUpserts++;

      // Generate queries (3-5) and upsert per question
      const queries = generateQueriesForTable({ table: tableName, columns: tableDoc.columns });
      for (const q of queries) {
        const qDoc = {
          answerSql: q.answerSql,
          difficulty: q.difficulty,
          updatedAt: new Date()
        };
        await db.collection(PRACTICE_QUERIES).updateOne(
          { practiceId, table: tableName, question: q.question },
          { $set: qDoc, $setOnInsert: { createdAt: new Date(), practiceId, table: tableName, question: q.question } },
          { upsert: true }
        );
        queryUpserts++;
      }
    }
  }

  console.log(`✅ practiceTables upserts: ${tableUpserts}`);
  console.log(`✅ practiceQueries upserts: ${queryUpserts}`);
  if (skipped.length > 0) {
    console.log(`ℹ️ Skipped ${skipped.length} entries (no valid table/columns). Examples:`);
    console.log(skipped.slice(0, 5));
  }

  await client.close();
}

main().catch(err => {
  console.error('❌ Error seeding practice collections:', err);
  process.exit(1);
});


