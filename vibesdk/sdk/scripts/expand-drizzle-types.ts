/**
 * Post-processes bundled .d.ts to expand Drizzle $inferSelect types.
 */

import { readFileSync, writeFileSync } from 'fs';

const DTS_PATH = './dist/index.d.ts';

interface ColumnInfo {
	name: string;
	dataType: string;
	notNull: boolean;
}

interface TableInfo {
	columns: Record<string, ColumnInfo>;
}

// Store expanded types for later reference
const expandedTypes = new Map<string, TableInfo>();

/**
 * Parse a table definition from the .d.ts content to extract column info
 */
function parseTableDefinition(content: string, tableName: string): TableInfo | null {
	// Match: declare const tableName: import("drizzle-orm/sqlite-core").SQLiteTableWithColumns<{
	const tableRegex = new RegExp(
		`declare const ${tableName}:\\s*import\\("drizzle-orm/sqlite-core"\\)\\.SQLiteTableWithColumns<\\{[^}]*columns:\\s*\\{`,
		's'
	);

	const tableMatch = content.match(tableRegex);
	if (!tableMatch) {
		return null;
	}

	const startIndex = tableMatch.index! + tableMatch[0].length;

	// Find the columns block by tracking brace depth
	let braceDepth = 1;
	let endIndex = startIndex;
	for (let i = startIndex; i < content.length && braceDepth > 0; i++) {
		if (content[i] === '{') braceDepth++;
		if (content[i] === '}') braceDepth--;
		endIndex = i;
	}

	const columnsBlock = content.slice(startIndex, endIndex);

	// Parse each column
	const columns: Record<string, ColumnInfo> = {};

	// Match column definitions: columnName: import("drizzle-orm/sqlite-core").SQLiteColumn<{...}>
	const columnRegex = /(\w+):\s*import\("drizzle-orm\/sqlite-core"\)\.SQLiteColumn<\{([^>]+)\}>/gs;
	let match;

	while ((match = columnRegex.exec(columnsBlock)) !== null) {
		const columnName = match[1];
		const columnDef = match[2];

		// Extract data type
		const dataMatch = columnDef.match(/data:\s*([^;]+);/);
		// Extract notNull
		const notNullMatch = columnDef.match(/notNull:\s*(true|false)/);

		if (dataMatch) {
			const dataType = dataMatch[1].trim();

			columns[columnName] = {
				name: columnName,
				dataType,
				notNull: notNullMatch ? notNullMatch[1] === 'true' : false,
			};
		}
	}

	return { columns };
}

/**
 * Generate an expanded type string from column info
 * @param serializeDates - if true, convert Date to string (for Serialized<T> types)
 */
function generateExpandedType(tableInfo: TableInfo, serializeDates = false): string {
	const fields = Object.entries(tableInfo.columns)
		.map(([name, col]) => {
			let dataType = col.dataType;
			
			// Convert Date to string for serialized types
			if (serializeDates && dataType === 'Date') {
				dataType = 'string';
			}
			
			const type = col.notNull ? dataType : `${dataType} | null`;
			return `\t${name}: ${type};`;
		})
		.join('\n');

	return `{\n${fields}\n}`;
}

/**
 * Find all tables referenced by $inferSelect in the content
 */
function findInferSelectReferences(content: string): Map<string, string[]> {
	const refs = new Map<string, string[]>();

	// Match: type TypeName = typeof tableName.$inferSelect;
	const regex = /type\s+(\w+)\s*=\s*typeof\s+(\w+)\.\$inferSelect;/g;
	let match;

	while ((match = regex.exec(content)) !== null) {
		const typeName = match[1];
		const tableName = match[2];

		if (!refs.has(tableName)) {
			refs.set(tableName, []);
		}
		refs.get(tableName)!.push(typeName);
	}

	return refs;
}

/**
 * Find Serialized<TypeName> patterns where TypeName is an expanded type
 */
function expandSerializedTypes(content: string): string {
	// Find patterns like: type Foo = Serialized<Bar>;
	// where Bar is one of our expanded types
	
	for (const [typeName, tableInfo] of expandedTypes) {
		// Match: Serialized<TypeName>
		const serializedRegex = new RegExp(`Serialized<${typeName}>`, 'g');
		
		if (serializedRegex.test(content)) {
			const serializedExpanded = generateExpandedType(tableInfo, true);
			content = content.replace(serializedRegex, serializedExpanded);
			console.log(`  Expanded Serialized<${typeName}>`);
		}
	}
	
	return content;
}

function main() {
	console.log('Expanding Drizzle $inferSelect types...');

	let content = readFileSync(DTS_PATH, 'utf-8');

	// Find all $inferSelect references
	const inferSelectRefs = findInferSelectReferences(content);
	console.log(`Found ${inferSelectRefs.size} tables with $inferSelect references`);

	// Process each table
	for (const [tableName, typeNames] of inferSelectRefs) {
		console.log(`  Processing table: ${tableName} (types: ${typeNames.join(', ')})`);

		const tableInfo = parseTableDefinition(content, tableName);
		if (!tableInfo) {
			console.warn(`    Warning: Could not parse table definition for ${tableName}`);
			continue;
		}

		const columnCount = Object.keys(tableInfo.columns).length;
		console.log(`    Found ${columnCount} columns`);

		const expandedType = generateExpandedType(tableInfo);

		// Replace each type alias with the expanded type
		for (const typeName of typeNames) {
			const oldDecl = `type ${typeName} = typeof ${tableName}.$inferSelect;`;
			const newDecl = `type ${typeName} = ${expandedType}`;

			if (content.includes(oldDecl)) {
				content = content.replace(oldDecl, newDecl);
				console.log(`    Replaced: ${typeName}`);
				
				// Store for Serialized expansion
				expandedTypes.set(typeName, tableInfo);
			}
		}
	}

	// Also remove $inferInsert references (replace with unknown for now)
	const inferInsertRegex = /type\s+(\w+)\s*=\s*typeof\s+(\w+)\.\$inferInsert;/g;
	content = content.replace(inferInsertRegex, (match, typeName, tableName) => {
		console.log(`  Removing $inferInsert reference: ${typeName}`);
		return `type ${typeName} = Record<string, unknown>;`;
	});

	// Now expand Serialized<T> types
	console.log('\nExpanding Serialized<T> types...');
	content = expandSerializedTypes(content);

	writeFileSync(DTS_PATH, content);
	console.log('\nDone!');
}

main();
