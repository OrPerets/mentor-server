const { MongoClient } = require('mongodb');

const dbUserName = process.env.dbUserName || "sql-admin";
const dbPassword = process.env.dbPassword || "SMff5PqhhoVbX6z7";
const connectionString = `mongodb+srv://${dbUserName}:${dbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DATABASE_NAME = 'experiment';

async function addFinalExamsIndex() {
    let client;
    
    try {
        console.log('Connecting to MongoDB...');
        client = new MongoClient(connectionString);
        await client.connect();
        
        const db = client.db(DATABASE_NAME);
        const collection = db.collection('finalExams');
        
        console.log('Adding index on startTime field...');
        
        // Create index on startTime (descending order for newest first)
        const indexResult = await collection.createIndex(
            { startTime: -1 },
            { 
                name: 'startTime_desc',
                background: true // Build index in background to avoid blocking
            }
        );
        
        console.log('Index created successfully:', indexResult);
        
        // Also add compound index for status queries if needed
        const statusIndexResult = await collection.createIndex(
            { status: 1, startTime: -1 },
            { 
                name: 'status_startTime_desc',
                background: true
            }
        );
        
        console.log('Status compound index created:', statusIndexResult);
        
        // List all indexes to verify
        const indexes = await collection.listIndexes().toArray();
        console.log('\nAll indexes on finalExams collection:');
        indexes.forEach(index => {
            console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
        });
        
    } catch (error) {
        console.error('Error adding indexes:', error);
        process.exit(1);
    } finally {
        if (client) {
            await client.close();
            console.log('\nDatabase connection closed.');
        }
    }
}

// Run the script
addFinalExamsIndex()
    .then(() => {
        console.log('Index creation completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('Script failed:', error);
        process.exit(1);
    }); 