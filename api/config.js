module.exports = {
    dbUserName: process.env.dbUserName || "sql-admin",
    dbPassword: process.env.dbPassword || "SMff5PqhhoVbX6z7",
    serverPort: process.env.PORT || 5000,
    // Alternative connection string format for Vercel
    mongoUri: process.env.MONGODB_URI || null
}
