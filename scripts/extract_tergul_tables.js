const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

/**
 * Goal: Extract SQL table schemas from PDF practice files named `tergul*.pdf` under `files/`.
 * Output: JSON mapping per file of discovered CREATE TABLE statements and parsed schema fields.
 */

const INPUT_DIR = path.join(__dirname, 'files');
const OUTPUT_PATH = path.join(__dirname, 'tergul_tables_schema.json');

/**
 * Normalize whitespace and fix common PDF hyphenation line-break issues.
 */
function normalizePdfText(text) {
	// Join hyphenated line breaks (e.g., "VAR-\N CHAR" across lines)
	let cleaned = text.replace(/-\n\s*/g, '');
	// Replace newlines within parentheses where PDFs break columns definitions oddly
	cleaned = cleaned.replace(/\n+/g, '\n');
	// Collapse multiple spaces but keep newlines
	cleaned = cleaned.replace(/[ \t\f\r]+/g, ' ');
	return cleaned;
}

/**
 * Extract CREATE TABLE blocks from text.
 */
function extractCreateTableBlocks(text) {
	const blocks = [];
	const re = /CREATE\s+TABLE/gi;
	let m;
	while ((m = re.exec(text)) !== null) {
		let startIdx = m.index;
		let i = m.index + m[0].length;
		const len = text.length;
		const skipSpaces = () => { while (i < len && /\s/.test(text[i])) i++; };
		skipSpaces();
		// Optional IF NOT EXISTS
		const ifNotExists = /^IF\s+NOT\s+EXISTS/i.exec(text.slice(i));
		if (ifNotExists) {
			i += ifNotExists[0].length;
			skipSpaces();
		}
		// Parse table identifier possibly quoted and/or schema-qualified
		const readQuoted = (open, close) => {
			i++; // skip open
			let s = '';
			while (i < len) {
				const ch = text[i];
				if (ch === close) { i++; break; }
				s += ch; i++;
			}
			return s;
		};
		let tokens = [];
		let token = '';
		let foundParen = false;
		while (i < len) {
			const ch = text[i];
			if (ch === '(') { foundParen = true; break; }
			if (/\s/.test(ch)) { if (token) { tokens.push(token); token = ''; } i++; continue; }
			if (ch === '.') { if (token) { tokens.push(token); token = ''; } tokens.push('.'); i++; continue; }
			if (ch === '"') { if (token) { tokens.push(token); token = ''; } tokens.push(readQuoted('"','"')); continue; }
			if (ch === '`') { if (token) { tokens.push(token); token = ''; } tokens.push(readQuoted('`','`')); continue; }
			if (ch === '[') { if (token) { tokens.push(token); token = ''; } tokens.push(readQuoted('[',']')); continue; }
			token += ch; i++;
		}
		if (token) tokens.push(token);
		if (!foundParen) { // malformed; continue search
			re.lastIndex = i;
			continue;
		}
		// Rebuild table name without whitespace around dots
		let tableName = '';
		for (let t = 0; t < tokens.length; t++) {
			const part = tokens[t];
			if (part === '.') { tableName += '.'; continue; }
			// Strip wrapping quotes already removed by readQuoted
			tableName += String(part).trim();
		}
		// Now i is at '(' – scan balanced parentheses
		if (text[i] !== '(') {
			// move to the next '(' just in case
			while (i < len && text[i] !== '(') i++;
			if (i >= len) { re.lastIndex = i; continue; }
		}
		let depth = 0;
		const bodyStart = i + 1;
		while (i < len) {
			const ch = text[i];
			if (ch === '(') depth++;
			else if (ch === ')') {
				if (depth === 0) { break; }
				depth--;
			}
			i++;
		}
		if (i >= len || text[i] !== ')') { re.lastIndex = i; continue; }
		const bodyEnd = i;
		i++; // move past ')'
		// Optional whitespace + semicolon
		let j = i;
		while (j < len && /\s/.test(text[j])) j++;
		if (j < len && text[j] === ';') j++;
		const body = text.slice(bodyStart, bodyEnd);
		const fullSql = text.slice(startIdx, j);
		blocks.push({ tableName: tableName.replace(/[\u200f\u200e]/g, ''), body, fullSql });
		re.lastIndex = j; // continue after this statement
	}
	return blocks;
}

/**
 * Parse column definitions and constraints from a CREATE TABLE body.
 */
function parseTableBody(body) {
	// Split by commas that are not inside parentheses (for types like DECIMAL(10,2))
	const parts = [];
	let current = '';
	let depth = 0;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '(') depth++;
		if (ch === ')') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current.trim());

	const columns = [];
	const constraints = [];
	for (const p of parts) {
		const upper = p.toUpperCase();
		if (upper.startsWith('PRIMARY KEY') || upper.startsWith('FOREIGN KEY') || upper.startsWith('UNIQUE') || upper.startsWith('CHECK') || upper.startsWith('CONSTRAINT')) {
			constraints.push(p);
			continue;
		}
		// Column pattern: <name> <type>(...)? [constraints...]
		const m = p.match(/^(\"?[A-Za-z_][A-Za-z0-9_]*\"?)\s+([A-Za-z][A-Za-z0-9_]*(?:\s*\(.*?\))?)([\s\S]*)$/);
		if (m) {
			const colName = m[1].replace(/[\"]/g, '');
			const dataType = m[2].trim();
			const remainder = (m[3] || '').trim();
			const notNull = /NOT\s+NULL/i.test(remainder);
			const isPrimaryKey = /PRIMARY\s+KEY/i.test(remainder);
			const unique = /\bUNIQUE\b/i.test(remainder);
			const autoIncrement = /AUTO_INCREMENT|AUTOINCREMENT/i.test(remainder);
			const defaultMatch = remainder.match(/DEFAULT\s+((?:'[^']*'|\"[^\"]*\"|[^\s,]+)(?:\s*\([^\)]*\))?)/i);
			const defaultValue = defaultMatch ? defaultMatch[1] : undefined;
			let references = undefined;
			const refMatch = remainder.match(/REFERENCES\s+([A-Za-z0-9_\.\"`\[\]]+)\s*\(([^\)]*)\)/i);
			if (refMatch) {
				const refTable = refMatch[1].replace(/[\"`\[\]]/g, '');
				const refCols = refMatch[2].split(',').map(s => s.trim().replace(/[\"`\[\]]/g, ''));
				references = { table: refTable, columns: refCols };
			}
			columns.push({ name: colName, type: dataType, notNull, primaryKey: isPrimaryKey, unique, autoIncrement, default: defaultValue, references, raw: p });
		} else {
			// Fallback: treat as raw if unparsable
			columns.push({ name: undefined, type: undefined, notNull: undefined, primaryKey: undefined, default: undefined, raw: p });
		}
	}
	return { columns, constraints };
}

async function extractFromPdf(filePath) {
	const dataBuffer = fs.readFileSync(filePath);
	const parsed = await pdf(dataBuffer);
	const cleaned = normalizePdfText(parsed.text || '');
	const blocks = extractCreateTableBlocks(cleaned);
	return blocks.map(b => ({
		table: b.tableName,
		...parseTableBody(b.body),
		fullSql: b.fullSql
	}));
}

async function main() {
	const entries = fs.readdirSync(INPUT_DIR).filter(f => /^tergul\d+.*\.pdf$/i.test(f));
	entries.sort();
	const result = {};
	for (const f of entries) {
		const abs = path.join(INPUT_DIR, f);
		try {
			const tables = await extractFromPdf(abs);
			if (tables.length > 0) {
				result[path.parse(f).name] = tables;
			} else {
				result[path.parse(f).name] = [];
			}
			console.log(`Parsed ${f}: ${tables.length} tables`);
		} catch (err) {
			console.error(`Failed to parse ${f}:`, err.message);
			result[path.parse(f).name] = { error: err.message };
		}
	}
	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');
	console.log(`\n✅ Wrote ${OUTPUT_PATH}`);
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}


