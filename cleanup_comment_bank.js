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
    const backupFileName = `commentBank_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    fs.writeFileSync(backupFileName, JSON.stringify(comments, null, 2));
    console.log(`✅ Backup created: ${backupFileName} (${comments.length} comments)`);
    
    return comments;
}

async function findDuplicates(comments) {
    console.log('🔍 Analyzing duplicates...');
    
    // Group comments by questionId + feedback + score + difficulty
    const groups = {};
    
    comments.forEach(comment => {
        // Normalize feedback text (trim whitespace, normalize line endings)
        const normalizedFeedback = comment.feedback.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Create a more comprehensive key for exact duplicates
        const key = `${comment.questionId}_${comment.score}_${comment.maxScore}_${comment.difficulty}_${normalizedFeedback}`;
        
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(comment);
    });
    
    // Find groups with duplicates
    const duplicateGroups = {};
    let totalDuplicates = 0;
    
    Object.entries(groups).forEach(([key, commentGroup]) => {
        if (commentGroup.length > 1) {
            duplicateGroups[key] = commentGroup;
            totalDuplicates += commentGroup.length - 1; // subtract 1 to keep one
            
            // Log details for debugging
            console.log(`  📋 Found ${commentGroup.length} duplicates for key: ${key.substring(0, 50)}...`);
            commentGroup.forEach((comment, index) => {
                console.log(`    ${index + 1}. ID: ${comment._id}, UsageCount: ${comment.usageCount || 0}, GradedAt: ${comment.gradedAt}`);
            });
        }
    });
    
    console.log(`📊 Found ${Object.keys(duplicateGroups).length} duplicate groups with ${totalDuplicates} extra comments`);
    
    return duplicateGroups;
}

function selectBestComment(commentGroup) {
    // Sort by usage count (descending), then by gradedAt (most recent)
    return commentGroup.sort((a, b) => {
        // First priority: usage count
        if ((b.usageCount || 0) !== (a.usageCount || 0)) {
            return (b.usageCount || 0) - (a.usageCount || 0);
        }
        // Second priority: most recent
        return new Date(b.gradedAt) - new Date(a.gradedAt);
    })[0];
}

async function deduplicateComments(db, duplicateGroups) {
    console.log('🧹 Removing duplicates...');
    
    let removedCount = 0;
    let mergedUsageCount = 0;
    
    for (const [key, commentGroup] of Object.entries(duplicateGroups)) {
        const bestComment = selectBestComment(commentGroup);
        const duplicatesToRemove = commentGroup.filter(c => c._id.toString() !== bestComment._id.toString());
        
        // Calculate total usage count from all duplicates
        const totalUsageCount = commentGroup.reduce((sum, comment) => sum + (comment.usageCount || 0), 0);
        
        console.log(`  🔄 Processing Question ${bestComment.questionId}:`);
        console.log(`    Keeping: ${bestComment._id} (Usage: ${bestComment.usageCount || 0})`);
        console.log(`    Removing: ${duplicatesToRemove.length} duplicates`);
        
        // Update the best comment with merged usage count
        if (totalUsageCount > (bestComment.usageCount || 0)) {
            await db.collection('commentBank').updateOne(
                { _id: bestComment._id },
                { 
                    $set: { 
                        usageCount: totalUsageCount,
                        lastUsed: new Date() // Update as recently cleaned
                    }
                }
            );
            mergedUsageCount += totalUsageCount - (bestComment.usageCount || 0);
            console.log(`    Updated usage count: ${bestComment.usageCount || 0} → ${totalUsageCount}`);
        }
        
        // Remove duplicates
        for (const duplicate of duplicatesToRemove) {
            const result = await db.collection('commentBank').deleteOne({ _id: duplicate._id });
            if (result.deletedCount === 1) {
                removedCount++;
                console.log(`    ✓ Removed: ${duplicate._id}`);
            } else {
                console.log(`    ❌ Failed to remove: ${duplicate._id}`);
            }
        }
        
        console.log(`    ✅ Question ${bestComment.questionId}: Kept 1, removed ${duplicatesToRemove.length} duplicates\n`);
    }
    
    console.log(`✅ Cleanup complete: Removed ${removedCount} duplicate comments`);
    console.log(`📈 Merged usage count: +${mergedUsageCount} total usages preserved`);
    
    return { removedCount, mergedUsageCount };
}

async function generateReport(db, originalCount, removedCount) {
    console.log('📋 Generating cleanup report...');
    
    const finalCount = await db.collection('commentBank').countDocuments();
    const questionStats = await db.collection('commentBank').aggregate([
        {
            $group: {
                _id: '$questionId',
                count: { $sum: 1 },
                totalUsage: { $sum: '$usageCount' },
                avgScore: { $avg: '$score' }
            }
        },
        { $sort: { count: -1 } }
    ]).toArray();
    
    // Check for remaining duplicates
    const duplicateCheck = await db.collection('commentBank').aggregate([
        {
            $group: {
                _id: {
                    questionId: '$questionId',
                    feedback: '$feedback',
                    score: '$score',
                    maxScore: '$maxScore',
                    difficulty: '$difficulty'
                },
                count: { $sum: 1 },
                ids: { $push: '$_id' }
            }
        },
        {
            $match: { count: { $gt: 1 } }
        }
    ]).toArray();
    
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            originalCount,
            finalCount,
            removedCount,
            reductionPercentage: ((removedCount / originalCount) * 100).toFixed(1),
            remainingDuplicates: duplicateCheck.length
        },
        questionStats: questionStats.slice(0, 10), // Top 10 questions by comment count
        remainingDuplicateGroups: duplicateCheck.slice(0, 5) // Show first 5 remaining duplicate groups if any
    };
    
    const reportFileName = `comment_bank_cleanup_report_${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 CLEANUP SUMMARY:`);
    console.log(`   Original comments: ${originalCount}`);
    console.log(`   Final comments: ${finalCount}`);
    console.log(`   Removed duplicates: ${removedCount}`);
    console.log(`   Reduction: ${report.summary.reductionPercentage}%`);
    console.log(`   Remaining duplicates: ${duplicateCheck.length}`);
    console.log(`   Report saved: ${reportFileName}`);
    
    if (duplicateCheck.length > 0) {
        console.log(`\n⚠️  Warning: ${duplicateCheck.length} duplicate groups still remain!`);
        duplicateCheck.slice(0, 3).forEach((group, index) => {
            console.log(`   ${index + 1}. Question ${group._id.questionId}: ${group.count} duplicates`);
        });
    }
    
    return report;
}

async function main() {
    console.log('🚀 Starting Comment Bank Cleanup...\n');
    
    try {
        // Connect to database
        const db = await connectToDatabase();
        
        // Create backup
        const originalComments = await backupCommentBank(db);
        const originalCount = originalComments.length;
        
        if (originalCount === 0) {
            console.log('❌ No comments found in commentBank collection');
            return;
        }
        
        console.log(`📝 Found ${originalCount} total comments in the database`);
        
        // Find duplicates
        const duplicateGroups = await findDuplicates(originalComments);
        
        if (Object.keys(duplicateGroups).length === 0) {
            console.log('✅ No duplicates found! Comment bank is already clean.');
            return;
        }
        
        // Show what will be removed
        const totalToRemove = Object.values(duplicateGroups).reduce((sum, group) => sum + group.length - 1, 0);
        console.log(`\n⚠️  This will remove ${totalToRemove} duplicate comments.`);
        console.log('   Proceeding with cleanup...\n');
        
        // Remove duplicates
        const { removedCount } = await deduplicateComments(db, duplicateGroups);
        
        // Generate report
        await generateReport(db, originalCount, removedCount);
        
        console.log('\n🎉 Comment Bank cleanup completed successfully!');
        
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