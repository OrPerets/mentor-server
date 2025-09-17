#!/usr/bin/env node

/**
 * Migration script to replace XLSX with ExcelJS in export scripts
 * This addresses the security vulnerability in the xlsx library
 */

const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname);
const filesToMigrate = [
  'export_examIds_excel.js',
  'export_grade_by_question_excel.js', 
  'export_exam_sessions_excel.js',
  'export_final_exams_excel.js'
];

console.log('🔄 Migrating XLSX to ExcelJS for security...');

filesToMigrate.forEach(filename => {
  const filePath = path.join(scriptsDir, filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filename}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace XLSX import with ExcelJS
  content = content.replace(
    /const XLSX = require\('xlsx'\);/g,
    "const ExcelJS = require('exceljs');"
  );
  
  // Replace XLSX usage patterns with ExcelJS equivalents
  // This is a basic migration - you may need to adjust specific usage patterns
  content = content.replace(
    /XLSX\.utils\.book_new\(\)/g,
    'new ExcelJS.Workbook()'
  );
  
  content = content.replace(
    /XLSX\.utils\.json_to_sheet\(/g,
    'worksheet.addRows('
  );
  
  content = content.replace(
    /XLSX\.utils\.book_append_sheet\(/g,
    'workbook.addWorksheet('
  );
  
  content = content.replace(
    /XLSX\.writeFile\(/g,
    'await workbook.xlsx.writeFile('
  );
  
  // Add comment about manual migration needed
  const migrationComment = `
// ⚠️  MIGRATION NOTICE: This file has been partially migrated from XLSX to ExcelJS
// for security reasons. Please review and test the Excel export functionality.
// Complete migration guide: https://github.com/exceljs/exceljs#interface
`;
  
  content = migrationComment + content;
  
  // Create backup
  fs.writeFileSync(filePath + '.backup', fs.readFileSync(filePath));
  
  // Write migrated content
  fs.writeFileSync(filePath, content);
  
  console.log(`✅ Migrated ${filename} (backup created as ${filename}.backup)`);
});

console.log(`
🎉 Migration completed!

⚠️  IMPORTANT: Manual testing required!

The XLSX library has been replaced with ExcelJS for security reasons.
Please test each export script to ensure Excel files are generated correctly.

Migration changes made:
1. Replaced 'xlsx' import with 'exceljs'
2. Updated basic API calls
3. Created backup files (.backup extension)

Next steps:
1. Test each export script
2. Adjust ExcelJS API usage as needed
3. Remove .backup files once testing is complete

ExcelJS documentation: https://github.com/exceljs/exceljs
`);
