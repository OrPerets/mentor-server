const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Database configuration
const remoteDbPassword = "SMff5PqhhoVbX6z7";
const dbUserName = "sql-admin";
const connectionString = `mongodb+srv://${dbUserName}:${remoteDbPassword}@sqlmentor.ydqmecv.mongodb.net/?retryWrites=true&w=majority&appName=SQLMentor`;
const DB_NAME = 'experiment';

async function connectToDatabase() {
    const client = new MongoClient(connectionString);
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');
    return client.db(DB_NAME);
}

async function backupCommentBank(db) {
    console.log('🔄 Creating backup of commentBank collection...');
    
    const comments = await db.collection('commentBank').find({}).toArray();
    const backupFileName = `commentBank_backup_admin_cleanup_${new Date().toISOString().split('T')[0]}.json`;
    
    fs.writeFileSync(backupFileName, JSON.stringify(comments, null, 2));
    console.log(`✅ Backup created: ${backupFileName} (${comments.length} comments)`);
    
    return comments;
}

async function analyzeComments(db) {
    console.log('🔍 Analyzing comments by gradedBy field...');
    
    // Get statistics of comments by gradedBy field
    const gradedByStats = await db.collection('commentBank').aggregate([
        {
            $group: {
                _id: '$gradedBy',
                count: { $sum: 1 },
                avgScore: { $avg: '$score' },
                zeroScoreCount: {
                    $sum: {
                        $cond: [{ $eq: ['$score', 0] }, 1, 0]
                    }
                }
            }
        },
        { $sort: { count: -1 } }
    ]).toArray();

    console.log('📊 Comments breakdown by gradedBy:');
    gradedByStats.forEach(stat => {
        console.log(`   ${stat._id || 'NULL'}: ${stat.count} comments (${stat.zeroScoreCount} with score 0, avg score: ${stat.avgScore?.toFixed(2) || 'N/A'})`);
    });

    // Get total counts
    const totalComments = await db.collection('commentBank').countDocuments();
    const adminComments = await db.collection('commentBank').countDocuments({ gradedBy: 'admin' });
    const nonAdminComments = totalComments - adminComments;

    console.log(`\n📋 Summary:`);
    console.log(`   Total comments: ${totalComments}`);
    console.log(`   Admin comments: ${adminComments}`);
    console.log(`   Non-admin comments: ${nonAdminComments}`);

    return {
        totalComments,
        adminComments, 
        nonAdminComments,
        gradedByStats
    };
}

async function findNonAdminComments(db) {
    console.log('🔍 Finding comments that are NOT graded by admin...');
    
    // Find all comments where gradedBy is not "admin"
    const nonAdminComments = await db.collection('commentBank').find({
        gradedBy: { $ne: 'admin' }
    }).toArray();

    console.log(`📋 Found ${nonAdminComments.length} comments not graded by admin:`);
    
    // Group by gradedBy value for better understanding
    const groupedNonAdmin = {};
    nonAdminComments.forEach(comment => {
        const gradedBy = comment.gradedBy || 'NULL';
        if (!groupedNonAdmin[gradedBy]) {
            groupedNonAdmin[gradedBy] = [];
        }
        groupedNonAdmin[gradedBy].push(comment);
    });

    Object.entries(groupedNonAdmin).forEach(([gradedBy, comments]) => {
        console.log(`   ${gradedBy}: ${comments.length} comments`);
        
        // Show sample comments for each group
        if (comments.length > 0) {
            const sampleComment = comments[0];
            console.log(`     Sample: Q${sampleComment.questionId}, Score: ${sampleComment.score}, Feedback: "${sampleComment.feedback?.substring(0, 50)}..."`);
        }
    });

    return nonAdminComments;
}

async function removeNonAdminComments(db, nonAdminComments) {
    console.log('🧹 Removing non-admin comments...');
    
    if (nonAdminComments.length === 0) {
        console.log('✅ No non-admin comments to remove!');
        return { removedCount: 0 };
    }

    console.log(`⚠️  About to remove ${nonAdminComments.length} comments that are not graded by admin.`);
    console.log('   This action cannot be undone (except from backup).');

    // Remove all comments where gradedBy is not "admin"
    const result = await db.collection('commentBank').deleteMany({
        gradedBy: { $ne: 'admin' }
    });

    console.log(`✅ Removed ${result.deletedCount} non-admin comments`);
    
    return { removedCount: result.deletedCount };
}

async function generateReport(db, originalStats, removedCount) {
    console.log('📋 Generating cleanup report...');
    
    const finalCount = await db.collection('commentBank').countDocuments();
    const finalStats = await analyzeComments(db);

    const report = {
        timestamp: new Date().toISOString(),
        operation: 'Remove all comments not graded by admin',
        summary: {
            originalTotal: originalStats.totalComments,
            originalAdmin: originalStats.adminComments,
            originalNonAdmin: originalStats.nonAdminComments,
            removedCount,
            finalTotal: finalCount,
            reductionPercentage: ((removedCount / originalStats.totalComments) * 100).toFixed(1)
        },
        originalGradedByStats: originalStats.gradedByStats,
        finalGradedByStats: finalStats.gradedByStats
    };
    
    const reportFileName = `comment_bank_admin_cleanup_report_${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 CLEANUP SUMMARY:`);
    console.log(`   Original total comments: ${originalStats.totalComments}`);
    console.log(`   Original admin comments: ${originalStats.adminComments}`);
    console.log(`   Original non-admin comments: ${originalStats.nonAdminComments}`);
    console.log(`   Removed comments: ${removedCount}`);
    console.log(`   Final total comments: ${finalCount}`);
    console.log(`   Reduction: ${report.summary.reductionPercentage}%`);
    console.log(`   Report saved: ${reportFileName}`);
    
    // Verify all remaining comments are admin
    const remainingNonAdmin = await db.collection('commentBank').countDocuments({
        gradedBy: { $ne: 'admin' }
    });
    
    if (remainingNonAdmin === 0) {
        console.log(`   ✅ Success: All remaining comments are graded by admin`);
    } else {
        console.log(`   ⚠️  Warning: ${remainingNonAdmin} non-admin comments still remain!`);
    }
    
    return report;
}

async function main() {
    console.log('🚀 Starting Comment Bank Admin-Only Cleanup...\n');
    console.log('This script will remove ALL comments that are not graded by "admin"\n');
    
    try {
        // Connect to database
        const db = await connectToDatabase();
        
        // Create backup
        await backupCommentBank(db);
        
        // Analyze current state
        const originalStats = await analyzeComments(db);
        
        if (originalStats.totalComments === 0) {
            console.log('❌ No comments found in commentBank collection');
            return;
        }
        
        if (originalStats.nonAdminComments === 0) {
            console.log('✅ All comments are already graded by admin! No cleanup needed.');
            return;
        }
        
        // Find non-admin comments 
        const nonAdminComments = await findNonAdminComments(db);
        
        if (nonAdminComments.length === 0) {
            console.log('✅ No non-admin comments found! Collection is already clean.');
            return;
        }
        
        // Show what will be removed
        console.log(`\n⚠️  This will remove ${nonAdminComments.length} comments that are not graded by admin.`);
        console.log('   Proceeding with cleanup...\n');
        
        // Remove non-admin comments
        const { removedCount } = await removeNonAdminComments(db, nonAdminComments);
        
        // Generate report
        await generateReport(db, originalStats, removedCount);
        
        console.log('\n🎉 Comment Bank admin-only cleanup completed successfully!');
        console.log('   Only comments graded by "admin" remain in the collection.');
        
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { main };