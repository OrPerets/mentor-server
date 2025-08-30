const https = require('https');
const fs = require('fs');

// Use the deployed mentor-server API to get data
const MENTOR_SERVER_URL = 'https://database-mentor.vercel.app';

async function fetchFromAPI(endpoint) {
    return new Promise((resolve, reject) => {
        const url = `${MENTOR_SERVER_URL}${endpoint}`;
        console.log(`🔄 Fetching: ${url}`);
        
        https.get(url, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            });
            
        }).on('error', (error) => {
            reject(error);
        });
    });
}

async function createUrgentAPIExport() {
    console.log('🚨 URGENT API EXPORT STARTED 🚨\n');
    
    try {
        // Get final exams data
        console.log('📊 Getting final exams from API...');
        const examData = await fetchFromAPI('/admin/final-exams?limit=100');
        const examSessions = examData.examSessions || [];
        
        console.log(`✅ Found ${examSessions.length} total exams`);
        
        // Filter for graded exams
        const gradedExams = examSessions.filter(exam => exam.graded);
        console.log(`📊 Found ${gradedExams.length} graded exams`);
        
        if (gradedExams.length === 0) {
            console.log('❌ No graded exams found!');
            return;
        }
        
        // Get questions data
        console.log('📚 Getting questions from API...');
        const questionsData = await fetchFromAPI('/api/admin/questions-optimized?page=1&limit=100');
        const questions = questionsData.questions || [];
        
        console.log(`✅ Found ${questions.length} questions`);
        
        // Create questions map
        const questionsMap = new Map();
        questions.forEach(q => {
            questionsMap.set(q.id, q);
        });
        
        // Process exam data and create CSV
        console.log('\n📋 Processing grading data...');
        const csvRows = [];
        
        // CSV Header
        csvRows.push([
            'Student Email',
            'Student Name',
            'Student ID',
            'Exam Date',
            'Total Score',
            'Max Score',
            'Percentage',
            'Status',
            'Exam ID',
            'Start Time',
            'End Time'
        ].join(','));
        
        // Process each exam for summary data
        gradedExams.forEach((exam, index) => {
            console.log(`   Processing exam ${index + 1}/${gradedExams.length}: ${exam.studentEmail}`);
            
            const escapeCsv = (str) => {
                if (str === null || str === undefined) return '';
                const strValue = str.toString();
                if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                    return `"${strValue.replace(/"/g, '""')}"`;
                }
                return strValue;
            };
            
            csvRows.push([
                escapeCsv(exam.studentEmail || exam.email || 'לא זמין'),
                escapeCsv(exam.studentName || 'לא זמין'),
                escapeCsv(exam.studentId || 'לא זמין'),
                exam.startTime ? new Date(exam.startTime).toLocaleDateString('he-IL') : 'לא זמין',
                exam.score || 0,
                exam.totalQuestions ? exam.totalQuestions * 10 : 100, // Estimate max score
                exam.score && exam.totalQuestions ? Math.round((exam.score / (exam.totalQuestions * 10)) * 100) + '%' : '0%',
                escapeCsv(exam.status || 'completed'),
                escapeCsv(exam._id || 'לא זמין'),
                exam.startTime ? new Date(exam.startTime).toLocaleString('he-IL') : 'לא זמין',
                exam.endTime ? new Date(exam.endTime).toLocaleString('he-IL') : 'לא זמין'
            ].join(','));
        });
        
        // Write CSV file
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `URGENT_GRADING_SUMMARY_${timestamp}.csv`;
        const csvContent = csvRows.join('\n');
        
        fs.writeFileSync(filename, '\ufeff' + csvContent, 'utf8'); // UTF-8 BOM for Hebrew support
        
        console.log(`\n🎉 URGENT EXPORT COMPLETED! 🎉`);
        console.log(`📄 File: ${filename}`);
        console.log(`📊 Students: ${gradedExams.length}`);
        console.log(`💾 File size: ${(csvContent.length / 1024).toFixed(1)} KB`);
        console.log(`📍 Location: ${process.cwd()}/${filename}`);
        
        // Try to get detailed question data for one exam as sample
        console.log('\n🔍 Trying to get detailed question data...');
        
        if (gradedExams.length > 0) {
            try {
                const sampleExamId = gradedExams[0]._id;
                console.log(`📋 Getting detailed data for exam: ${sampleExamId}`);
                
                const detailedData = await fetchFromAPI(`/admin/final-exam/${sampleExamId}/for-grading`);
                
                if (detailedData && detailedData.answers) {
                    console.log(`✅ Found detailed data with ${detailedData.answers.length} answers`);
                    
                    // Create detailed CSV for this exam
                    const detailedRows = [];
                    
                    detailedRows.push([
                        'Student Email',
                        'Question Index',
                        'Question Text',
                        'Student Answer',
                        'Grade',
                        'Max Score',
                        'Feedback',
                        'Question ID'
                    ].join(','));
                    
                    detailedData.answers.forEach(answer => {
                        const escapeCsv = (str) => {
                            if (str === null || str === undefined) return '';
                            const strValue = str.toString();
                            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                                return `"${strValue.replace(/"/g, '""')}"`;
                            }
                            return strValue;
                        };
                        
                        detailedRows.push([
                            escapeCsv(detailedData.session.studentEmail),
                            answer.questionIndex,
                            escapeCsv((answer.questionText || 'לא זמין').substring(0, 100)),
                            escapeCsv((answer.studentAnswer || 'לא זמין').substring(0, 200)),
                            answer.grade || 0,
                            answer.maxScore || 0,
                            escapeCsv((answer.feedback || 'אין משוב').substring(0, 100)),
                            answer.questionId || 'לא זמין'
                        ].join(','));
                    });
                    
                    const detailedFilename = `SAMPLE_DETAILED_EXPORT_${timestamp}.csv`;
                    const detailedCsvContent = detailedRows.join('\n');
                    
                    fs.writeFileSync(detailedFilename, '\ufeff' + detailedCsvContent, 'utf8');
                    
                    console.log(`📄 Sample detailed file: ${detailedFilename}`);
                    console.log(`📝 Sample answers: ${detailedData.answers.length}`);
                }
            } catch (detailError) {
                console.log(`⚠️ Could not get detailed data: ${detailError.message}`);
            }
        }
        
        // Create summary
        const summary = {
            timestamp: new Date().toISOString(),
            summaryFile: filename,
            studentsCount: gradedExams.length,
            totalExamsFound: examSessions.length,
            questionsAvailable: questions.length,
            fileSizeKB: Math.round(csvContent.length / 1024),
            dataSource: 'mentor-server API',
            note: 'This is a summary export. For detailed question-by-question data, use the grade-by-question interface when the system is working.'
        };
        
        fs.writeFileSync(`EXPORT_SUMMARY_${timestamp}.json`, JSON.stringify(summary, null, 2));
        
        console.log(`\n✅ Summary saved: EXPORT_SUMMARY_${timestamp}.json`);
        console.log(`\n💡 Files created:`);
        console.log(`   📊 ${filename} - Student summary data`);
        console.log(`   📋 EXPORT_SUMMARY_${timestamp}.json - Export details`);
        if (fs.existsSync(`SAMPLE_DETAILED_EXPORT_${timestamp}.csv`)) {
            console.log(`   📝 SAMPLE_DETAILED_EXPORT_${timestamp}.csv - Sample detailed answers`);
        }
        console.log(`\n💡 To open in Excel:`);
        console.log(`   1. Open Excel`);
        console.log(`   2. File > Open > ${filename}`);
        console.log(`   3. Choose "UTF-8" encoding`);
        console.log(`   4. Hebrew text should display correctly`);
        
        return filename;
        
    } catch (error) {
        console.error('❌ URGENT API EXPORT FAILED:', error);
        throw error;
    }
}

async function main() {
    await createUrgentAPIExport();
}

if (require.main === module) {
    main();
}

module.exports = { createUrgentAPIExport };