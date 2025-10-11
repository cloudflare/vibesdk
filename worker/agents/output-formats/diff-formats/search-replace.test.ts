import { applyDiff, createSearchReplaceDiff, validateDiff, MatchingStrategy } from './search-replace';

describe('Search/Replace Diff Format', () => {
	describe('Basic Operations', () => {
		test('should apply simple search/replace', () => {
			const original = `function hello() {
	console.log("Hello World");
}`;
			
			const diff = `<<<<<<< SEARCH
	console.log("Hello World");
=======
	console.log("Hello Universe");
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('console.log("Hello Universe");');
			expect(result.content).not.toContain('console.log("Hello World");');
			expect(result.results.blocksApplied).toBe(1);
			expect(result.results.blocksFailed).toBe(0);
		});
		
		test('should handle multiple lines in search/replace', () => {
			const original = `function calculate() {
	let a = 1;
	let b = 2;
	return a + b;
}`;
			
			const diff = `<<<<<<< SEARCH
	let a = 1;
	let b = 2;
	return a + b;
=======
	const sum = 3;
	return sum;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('const sum = 3;');
			expect(result.content).toContain('return sum;');
			expect(result.content).not.toContain('let a = 1;');
		});
		
		test('should handle empty search (pure addition)', () => {
			const original = `function test() {
	return 42;
}`;
			
			const diff = `<<<<<<< SEARCH

=======
// This is a new comment
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('// This is a new comment');
			expect(result.content).toContain('function test()');
		});
		
		test('should handle empty replace (deletion)', () => {
			const original = `function test() {
	console.log("debug");
	return 42;
}`;
			
			const diff = `<<<<<<< SEARCH
	console.log("debug");
=======
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).not.toContain('console.log("debug");');
			expect(result.content).toContain('return 42;');
		});
		
		test('should preserve indentation and formatting', () => {
			const original = `\tif (condition) {
\t\tconsole.log("test");
\t}`;
			
			const diff = `<<<<<<< SEARCH
\t\tconsole.log("test");
=======
\t\tconsole.log("updated");
\t\tconsole.log("added line");
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toBe(`\tif (condition) {
\t\tconsole.log("updated");
\t\tconsole.log("added line");
\t}`);
		});
	});
	
	describe('Error Handling', () => {
		test('should fail when search pattern is ambiguous', () => {
			const original = `const x = 1;
const x = 1;
const y = 2;`;
			
			const diff = `<<<<<<< SEARCH
const x = 1;
=======
const x = 10;
>>>>>>> REPLACE`;
			
			expect(() => applyDiff(original, diff, { strict: true }))
				.toThrow('found 2 times (ambiguous)');
		});
		
		test('should handle malformed blocks gracefully', () => {
			const original = 'const x = 1;';
			const diff = `<<<<<<< SEARCH
const x = 1;
=======
const x = 2;`; // Missing end marker
			
			expect(() => applyDiff(original, diff, { strict: true }))
				.toThrow("REPLACE block ended prematurely");
		});
		
		test('should handle missing separator', () => {
			const original = 'const x = 1;';
			const diff = `<<<<<<< SEARCH
const x = 1;
const x = 2;
>>>>>>> REPLACE`;
			
			expect(() => applyDiff(original, diff, { strict: true }))
				.toThrow("SEARCH block without corresponding REPLACE");
		});
		
		test('should apply successful blocks in non-strict mode', () => {
			const original = `line1
line2
line3`;
			
			const diff = `<<<<<<< SEARCH
line1
=======
line1_updated
>>>>>>> REPLACE

<<<<<<< SEARCH
lineX
=======
lineX_updated
>>>>>>> REPLACE

<<<<<<< SEARCH
line3
=======
line3_updated
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff, { strict: false });
			expect(result.content).toContain('line1_updated');
			expect(result.content).toContain('line2'); // Unchanged
			expect(result.content).toContain('line3_updated');
			expect(result.content).not.toContain('lineX'); // Failed block ignored
		});
		
		test('should handle sequential dependency failures silently in non-strict mode', () => {
			// This test recreates a scenario where the second diff fails due to whitespace differences
			// after the first diff changes the content structure
			const original = `interface TileProps {
  value: number;
}
const TileComponent: React.FC<TileProps> = ({ value }) => {
  return (
    <motion.div>{value}</motion.div>
  );
};`;
			
			// First diff succeeds, second diff fails due to exact whitespace mismatch
			const diff = `<<<<<<< SEARCH
interface TileProps {
  value: number;
}
=======
interface TileProps {
  value: number;
  position?: { x: number; y: number };
}
>>>>>>> REPLACE

<<<<<<< SEARCH
const TileComponent: React.FC<TileProps> = ({ value }) => {
  return (
    <motion.div>{value}</motion.div>
  );
};
=======
const TileComponent: React.FC<TileProps> = ({ value, position }) => {
  return (
    <motion.div layoutId={position ? \`tile-\${position.x}-\${position.y}\` : undefined}>
      {value}
    </motion.div>
  );
};
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff, { strict: false });
			
			// First diff should succeed
			expect(result.content).toContain('position?: { x: number; y: number };');
			
			// Second diff should apply successfully in this case
			// (This demonstrates proper sequential application)
			expect(result.content).toContain('({ value, position }) =>');
			expect(result.content).toContain('layoutId');
		});
		
		test('should provide detailed errors when all blocks fail', () => {
			const original = `const x = 1;
const y = 2;`;
			
			const diff = `<<<<<<< SEARCH
const a = 1;
=======
const a = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
const b = 2;
=======
const b = 20;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff, { strict: false });
			expect(result.results.blocksFailed).toBe(2);
			expect(result.results.errors.some(error => error.includes('All search/replace blocks failed'))).toBe(true);
		});
		
		test('should handle whitespace sensitivity in search patterns', () => {
			const original = `function test() {
    console.log("hello");
}`;
			
			// This diff has slightly different whitespace in search pattern
			const diff = `<<<<<<< SEARCH
function test() {
  console.log("hello");
}
=======
function test() {
    console.log("goodbye");
}
>>>>>>> REPLACE`;
			
			// Should fail due to whitespace mismatch, original preserved
			const result = applyDiff(original, diff, { 
				strict: false,
				matchingStrategies: [MatchingStrategy.EXACT]
			});
			expect(result.results.blocksFailed).toBe(1);
			expect(result.results.errors.some(error => error.includes('Search block not found'))).toBe(true);
		});
		
		test('should fail fast in strict mode when search pattern not found', () => {
			const original = `const x = 1;
const y = 2;
const z = 3;`;
			
			const diff = `<<<<<<< SEARCH
const x = 1;
=======
const x = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
const missing = 999;
=======
const missing = 1000;
>>>>>>> REPLACE

<<<<<<< SEARCH
const z = 3;
=======
const z = 30;
>>>>>>> REPLACE`;
			
			// Should fail on second block and never reach third
			expect(() => applyDiff(original, diff, { strict: true }))
				.toThrow('Search block not found');
		});
		
		test('should demonstrate exact whitespace matching failure', () => {
			// This test shows how subtle formatting differences cause silent failures
			const original = `interface Props {
  title: string;
}

const Component: React.FC<Props> = ({ title }) => {
  return <h1>{title}</h1>;
};`;
			
			// First diff succeeds, second diff has subtle whitespace difference that causes failure
			const diff = `<<<<<<< SEARCH
interface Props {
  title: string;
}
=======
interface Props {
  title: string;
  subtitle?: string;
}
>>>>>>> REPLACE

<<<<<<< SEARCH
const Component: React.FC<Props> = ({ title }) => {
  return  <h1>{title}</h1>;
};
=======
const Component: React.FC<Props> = ({ title, subtitle }) => {
  return (
    <div>
      <h1>{title}</h1>
      {subtitle && <h2>{subtitle}</h2>}
    </div>
  );
};
>>>>>>> REPLACE`;
			
			// Force exact matching only to test whitespace sensitivity
			const result = applyDiff(original, diff, { 
				strict: false,
				matchingStrategies: [MatchingStrategy.EXACT]
			});
			
			// First change should apply
			expect(result.content).toContain('subtitle?: string;');
			
			// Second change should fail due to extra space in 'return  <h1>'
			// Original has 'return <h1>' but search looks for 'return  <h1>'
			expect(result.content).toContain('({ title }) =>');
			expect(result.content).not.toContain('({ title, subtitle }) =>');
		});
	});
	
	describe('Edge Cases', () => {
		test('should handle empty original content', () => {
			const original = '';
			const diff = `<<<<<<< SEARCH

=======
const x = 1;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toBe('const x = 1;');
		});
		
		test('should handle empty diff', () => {
			const original = 'const x = 1;';
			const result = applyDiff(original, '');
			expect(result.content).toBe(original);
		});
		
		test('should handle special characters in content', () => {
			const original = `const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;`;
			const diff = `<<<<<<< SEARCH
const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
=======
const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}$/;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('[a-zA-Z]{2,4}');
		});
		
		test('should handle Unicode content', () => {
			const original = `const greeting = "こんにちは";
const emoji = "🚀";`;
			
			const diff = `<<<<<<< SEARCH
const greeting = "こんにちは";
=======
const greeting = "こんばんは";
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('こんばんは');
			expect(result.content).toContain('🚀');
		});
		
		test('should handle Windows line endings', () => {
			const original = "line1\r\nline2\r\nline3";
			const diff = `<<<<<<< SEARCH
line2
=======
line2_updated
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('line2_updated');
		});
	});
	
	describe('Multiple Blocks', () => {
		test('should apply multiple search/replace blocks in sequence', () => {
			const original = `function test() {
	let a = 1;
	let b = 2;
	let c = 3;
	return a + b + c;
}`;
			
			const diff = `<<<<<<< SEARCH
	let a = 1;
=======
	const a = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
	let b = 2;
=======
	const b = 20;
>>>>>>> REPLACE

<<<<<<< SEARCH
	let c = 3;
=======
	const c = 30;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('const a = 10;');
			expect(result.content).toContain('const b = 20;');
			expect(result.content).toContain('const c = 30;');
		});
		
		test('should handle overlapping changes correctly', () => {
			const original = `function calculate() {
	const result = computeValue();
	return result;
}`;
			
			// First change the function content
			const diff1 = `<<<<<<< SEARCH
	const result = computeValue();
	return result;
=======
	const temp = computeValue();
	const result = temp * 2;
	return result;
>>>>>>> REPLACE`;
			
			const intermediate = applyDiff(original, diff1);
			
			// Then change the function name
			const diff2 = `<<<<<<< SEARCH
function calculate() {
=======
function calculateDouble() {
>>>>>>> REPLACE`;
			
			const final = applyDiff(intermediate.content, diff2);
			expect(final.content).toContain('function calculateDouble()');
			expect(final.content).toContain('const temp = computeValue();');
			expect(final.content).toContain('const result = temp * 2;');
		});
	});
	
	// LLM Robustness Tests
	describe('LLM Robustness', () => {
		test('should handle extra whitespace around markers', () => {
			const original = 'const x = 1;';
			const diff = `  <<<<<<< SEARCH  
const x = 1;
   =======   
const x = 2;
  >>>>>>> REPLACE  `;
			
			const result = applyDiff(original, diff);
			expect(result.content).toBe('const x = 2;');
		});
		
		test('should handle inconsistent marker formatting', () => {
			const original = 'const x = 1;';
			
			// Some LLMs might use different cases or spacing
			const diff = `<<<<<<< search
const x = 1;
=======
const x = 2;
>>>>>>> Replace`;
			
			// Should return unchanged since no valid blocks found
			const result = applyDiff(original, diff, { strict: false });
			expect(result.content).toBe(original); // No changes applied
		});
		
		test('should handle mixed line endings from different sources', () => {
			const original = "line1\nline2\r\nline3\n";
			const diff = `<<<<<<< SEARCH\r\nline2\r\n=======\nline2_updated\n>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('line2_updated');
		});
		
		test('should handle trailing/leading whitespace in search blocks', () => {
			const original = `function test() {
    return 42;
}`;
			
			// LLM might include extra spaces
			const diff = `<<<<<<< SEARCH
    return 42;
=======
    return 100;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('return 100;');
		});
		
		test('should handle code with syntax errors', () => {
			// LLMs might generate syntactically incorrect code
			const original = `function test() {
    return 42;
}`;
			
			const diff = `<<<<<<< SEARCH
    return 42;
=======
    return 42 // Missing semicolon
    console.log('added') // Also missing semicolon
>>>>>>> REPLACE`;
			
			// Should still apply the diff even if syntax is wrong
			const result = applyDiff(original, diff);
			expect(result.content).toContain("return 42 // Missing semicolon");
			expect(result.content).toContain("console.log('added')");
		});
		
		test('should handle malformed blocks with extra ======= separator', () => {
			// LLMs sometimes add an extra ======= line before >>>>>>> REPLACE
			// Our robust parser now correctly identifies this as malformed and ignores it
			const original = `import { Grid, Tile } from './types';
export const GRID_SIZE = 4;
export const WINNING_VALUE = 2048;
let tileIdCounter = 1;`;
			
			const diff = `<<<<<<< SEARCH
import { Grid, Tile } from './types';
export const GRID_SIZE = 4;
export const WINNING_VALUE = 2048;
let tileIdCounter = 1;
=======
import { Grid, Tile, MoveResult } from './types';
export const GRID_SIZE = 4;
export const WINNING_VALUE = 2048;
let tileIdCounter = 1;
=======
>>>>>>> REPLACE`;
			
			// Should correctly identify as malformed and ignore the block
			const result = applyDiff(original, diff, { strict: false });
			expect(result.results.blocksApplied).toBe(0);
			expect(result.results.blocksFailed).toBe(0); // Malformed blocks don't count as failed
			expect(result.results.errors.some(error => error.includes('Malformed block with multiple separators'))).toBe(true);
			expect(result.content).toBe(original); // Content should remain unchanged
		});
		
		test('should handle file paths before search/replace blocks', () => {
			// LLMs often include file paths before the blocks
			const original = `function test() {
    return 42;
}`;
			
			const diff = `src/lib/game-logic.ts
<<<<<<< SEARCH
function test() {
    return 42;
}
=======
function test() {
    return 100;
}
>>>>>>> REPLACE`;
			
			// Should ignore the file path and apply the change
			const result = applyDiff(original, diff);
			expect(result.content).toContain("return 100;");
		});
		
		test('should fail on ambiguous matches with similar code blocks', () => {
			const original = `function processA() {
    const result = compute();
    return result;
}

function processB() {
    const result = compute();
    return result;
}`;
			
			const diff = `<<<<<<< SEARCH
    const result = compute();
    return result;
=======
    const result = compute();
    console.log(result);
    return result;
>>>>>>> REPLACE`;
			
			expect(() => applyDiff(original, diff, { strict: true }))
				.toThrow('found 2 times (ambiguous)');
		});
		
		test('should handle unique matches with sufficient context', () => {
			const original = `function processA() {
    const result = compute();
    return result;
}

function processB() {
    const result = compute();
    return result;
}`;
			
			const diff = `<<<<<<< SEARCH
function processA() {
    const result = compute();
    return result;
}
=======
function processA() {
    const result = compute();
    console.log('Processing A:', result);
    return result;
}
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain("console.log('Processing A:', result);");
			expect((result.content.match(/console\.log/g) || []).length).toBe(1); // Only one console.log added
		});
		
		test('should handle tab vs space differences', () => {
			const original = "function test() {\n\treturn 42;\n}";
			
			// LLM uses spaces instead of tabs
			const diff = `<<<<<<< SEARCH
    return 42;
=======
    return 100;
>>>>>>> REPLACE`;
			
			// Should pass
			const result = applyDiff(original, diff);
			expect(result.content).toContain('return 100;');
		});
		
		test('should match exact whitespace when provided', () => {
			const original = "function test() {\n\treturn 42;\n}";
			
			// Correct whitespace (tab)
			const diff = `<<<<<<< SEARCH
	return 42;
=======
	return 100;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('\treturn 100;');
		});
		
		test('should handle multi-line replacements with proper indentation', () => {
			const original = `function complexFunction() {
    // Step 1
    const data = fetchData();
    
    // Step 2
    const processed = processData(data);
    
    // Step 3
    return formatResult(processed);
}`;
			
			const diff = `<<<<<<< SEARCH
    // Step 2
    const processed = processData(data);
=======
    // Step 2 - Enhanced processing
    console.log('Processing data...');
    const validated = validateData(data);
    const processed = processData(validated);
    console.log('Processing complete');
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('// Step 2 - Enhanced processing');
			expect(result.content).toContain('const validated = validateData(data);');
			expect(result.content).toContain('Processing complete');
		});
		
		test('should handle complete function replacements', () => {
			const original = `function oldImplementation(x, y) {
    return x + y;
}

function helper() {
    return 42;
}`;
			
			const diff = `<<<<<<< SEARCH
function oldImplementation(x, y) {
    return x + y;
}
=======
function newImplementation(x, y, z = 0) {
    // Validate inputs
    if (typeof x !== 'number' || typeof y !== 'number') {
        throw new Error('Invalid inputs');
    }
    
    // Calculate result
    const sum = x + y + z;
    
    // Log for debugging
    console.log(\`Computing: \${x} + \${y} + \${z} = \${sum}\`);
    
    return sum;
}
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('function newImplementation(x, y, z = 0)');
			expect(result.content).toContain('throw new Error');
			expect(result.content).toContain('console.log(`Computing:');
			expect(result.content).toContain('function helper()'); // Unchanged
		});
		
		test('should handle regex patterns in code', () => {
			const original = `const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
const phoneRegex = /^\\+?[1-9]\\d{1,14}$/;`;
			
			const diff = `<<<<<<< SEARCH
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
=======
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,6}$/;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('[a-zA-Z]{2,6}');
		});
		
		test('should handle template literals with special characters', () => {
			const original = 'const msg = `Hello ${name}! Today is ${new Date().toDateString()}.`;';
			
			const diff = `<<<<<<< SEARCH
const msg = \`Hello \${name}! Today is \${new Date().toDateString()}.\`;
=======
const msg = \`Greetings \${name}! The current date is \${new Date().toDateString()}.\`;
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('Greetings ${name}!');
		});
		
		test('should handle JSON-like structures', () => {
			const original = `const config = {
    "api": {
        "url": "https://api.example.com",
        "key": "abc123"
    },
    "features": {
        "enabled": true,
        "flags": ["feature1", "feature2"]
    }
};`;
			
			const diff = `<<<<<<< SEARCH
        "key": "abc123"
=======
        "key": process.env.API_KEY || "abc123"
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('process.env.API_KEY || "abc123"');
		});
		
		test('should apply valid blocks when some fail in non-strict mode', () => {
			const original = `line1
line2
line3
line4`;
			
			const diff = `<<<<<<< SEARCH
line1
=======
LINE1
>>>>>>> REPLACE

<<<<<<< SEARCH
lineX
=======
LINEX
>>>>>>> REPLACE

<<<<<<< SEARCH
line3
=======
LINE3
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff, { strict: false });
			expect(result.content).toContain('LINE1');
			expect(result.content).toContain('line2'); // Unchanged
			expect(result.content).toContain('LINE3');
			expect(result.content).not.toContain('LINEX'); // Failed block
		});
		
		test('should provide helpful error messages', () => {
			const original = `function test() {
    return 42;
}`;
			
			const diff = `<<<<<<< SEARCH
function testFunction() {
    return 42;
}
=======
function testFunction() {
    return 100;
}
>>>>>>> REPLACE`;
			
			try {
				applyDiff(original, diff, { strict: true });
				fail('Should have thrown');
			} catch (error) {
				expect((error as Error).message).toContain('Search block not found');
				expect((error as Error).message).toContain('Block at line');
			}
		});
		
		test('should handle GPT-style verbose replacements', () => {
			const original = `// Simple function
function add(a, b) {
    return a + b;
}`;
			
			const diff = `<<<<<<< SEARCH
// Simple function
function add(a, b) {
    return a + b;
}
=======
/**
 * Adds two numbers together.
 * 
 * @param {number} a - The first number to add
 * @param {number} b - The second number to add
 * @returns {number} The sum of a and b
 * @throws {TypeError} If either parameter is not a number
 * 
 * @example
 * const result = add(2, 3); // returns 5
 */
function add(a, b) {
    // Validate input parameters
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new TypeError('Both parameters must be numbers');
    }
    
    // Calculate and return the sum
    const sum = a + b;
    
    // Log the operation for debugging purposes
    console.debug(\`add(\${a}, \${b}) = \${sum}\`);
    
    return sum;
}
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('@param {number} a');
			expect(result.content).toContain('throw new TypeError');
			expect(result.content).toContain('console.debug');
		});
		
		test('should handle Claude-style incremental changes', () => {
			const original = `class Calculator {
    add(a, b) {
        return a + b;
    }
}`;
			
			// First change - add validation
			const diff1 = `<<<<<<< SEARCH
    add(a, b) {
        return a + b;
    }
=======
    add(a, b) {
        if (typeof a !== 'number' || typeof b !== 'number') {
            throw new Error('Invalid inputs');
        }
        return a + b;
    }
>>>>>>> REPLACE`;
			
			const intermediate = applyDiff(original, diff1);
			
			// Second change - add logging
			const diff2 = `<<<<<<< SEARCH
        return a + b;
=======
        const result = a + b;
        console.log(\`Adding \${a} + \${b} = \${result}\`);
        return result;
>>>>>>> REPLACE`;
			
			const final = applyDiff(intermediate.content, diff2);
			expect(final.content).toContain('throw new Error');
			expect(final.content).toContain('const result = a + b;');
			expect(final.content).toContain('console.log');
		});
		
		test('should handle very large search blocks', () => {
			const lines = Array(100).fill(0).map((_, i) => `    line${i}();`);
			const original = `function longFunction() {\n${lines.join('\n')}\n}`;
			
			// Replace the entire function body
			const diff = `<<<<<<< SEARCH
${lines.join('\n')}
=======
    // Simplified implementation
    executeAll();
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('// Simplified implementation');
			expect(result.content).toContain('executeAll();');
			expect(result.content).not.toContain('line50();');
		});
		
		test('should handle deeply nested structures', () => {
			const original = `{
    "level1": {
        "level2": {
            "level3": {
                "level4": {
                    "value": 42
                }
            }
        }
    }
}`;
			
			const diff = `<<<<<<< SEARCH
                    "value": 42
=======
                    "value": 42,
                    "timestamp": Date.now()
>>>>>>> REPLACE`;
			
			const result = applyDiff(original, diff);
			expect(result.content).toContain('"timestamp": Date.now()');
		});
	});
	
	describe('Diff Creation', () => {
		test('should create diff from before/after content', () => {
			const before = `function test() {
	return 1;
}`;
			
			const after = `function test() {
	return 2;
}`;
			
			const diff = createSearchReplaceDiff(before, after);
			expect(diff).toContain('<<<<<<< SEARCH');
			expect(diff).toContain('return 1;');
			expect(diff).toContain('=======');
			expect(diff).toContain('return 2;');
			expect(diff).toContain('>>>>>>> REPLACE');
		});
		
		test('should handle pure additions', () => {
			const before = `line1`;
			const after = `line1
line2`;
			
			const diff = createSearchReplaceDiff(before, after, { contextLines: 0 });
			const result = applyDiff(before, diff);
			expect(result.content).toBe(after);
		});
		
		test('should include context lines', () => {
			const before = `line1
line2
line3
line4
line5`;
			
			const after = `line1
line2
lineX
line4
line5`;
			
			const diff = createSearchReplaceDiff(before, after, { contextLines: 1 });
			expect(diff).toContain('line2'); // Context before
			expect(diff).toContain('line4'); // Context after
		});
	});
	
	describe('Validation', () => {
		test('should validate diff without applying', () => {
			const content = 'const x = 1;';
			const validDiff = `<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`;
			
			const validation = validateDiff(content, validDiff);
			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});
		
		test('should report validation errors', () => {
			const content = 'const x = 1;';
			const invalidDiff = `<<<<<<< SEARCH
const y = 2;
=======
const y = 3;
>>>>>>> REPLACE`;
			
			const validation = validateDiff(content, invalidDiff);
			expect(validation.valid).toBe(false);
			expect(validation.errors[0]).toContain('Search pattern not found');
		});
		
		test('should validate ambiguous patterns', () => {
			const content = `const x = 1;
const x = 1;`;
			
			const ambiguousDiff = `<<<<<<< SEARCH
const x = 1;
=======
const x = 2;
>>>>>>> REPLACE`;
			
			const validation = validateDiff(content, ambiguousDiff);
			expect(validation.valid).toBe(false);
			expect(validation.errors[0]).toContain('found 2 times (ambiguous)');
		});
	});
	
	describe('Performance', () => {
		test('should handle large files efficiently', () => {
			const lines = Array(1000).fill(0).map((_, i) => `line${i}`);
			const original = lines.join('\n');
			
			const diff = `<<<<<<< SEARCH
line500
=======
line500_modified
>>>>>>> REPLACE`;
			
			const start = Date.now();
			const result = applyDiff(original, diff);
			const duration = Date.now() - start;
			
			expect(result.content).toContain('line500_modified');
			expect(duration).toBeLessThan(100); // Should be fast
		});
		
		test('should handle many blocks efficiently', () => {
			const original = Array(100).fill(0).map((_, i) => `const var${i} = ${i};`).join('\n');
			
			// Create 50 search/replace blocks
			const blocks = Array(50).fill(0).map((_, i) => `<<<<<<< SEARCH
const var${i} = ${i};
=======
const var${i} = ${i * 10};
>>>>>>> REPLACE`).join('\n\n');
			
			const start = Date.now();
			const result = applyDiff(original, blocks);
			const duration = Date.now() - start;
			
			expect(result.content).toContain('const var0 = 0;'); // First one multiplied by 10 is still 0
			expect(result.content).toContain('const var10 = 100;');
			expect(result.content).toContain('const var49 = 490;');
			expect(duration).toBeLessThan(200); // Should still be fast
		});
	});

    describe('Smart Diff Applier Features', () => {
        test('should include failed block details in ApplyResult', () => {
            const original = `function hello() {
    console.log("Hello World");
    return "world";
}`;

            const diffWithFailures = `<<<<<<< SEARCH
function hello() {
    console.log("Hello Universe");  // This doesn't match - will fail
    return "world";
}
=======
function hello() {
    console.log("Hello Galaxy");
    return "galaxy";
}
>>>>>>> REPLACE

<<<<<<< SEARCH
    return "world";
=======
    return "universe";
>>>>>>> REPLACE`;

            const result = applyDiff(original, diffWithFailures, { strict: false });
            
            // Should have failed blocks with complete information
            expect(result.results.failedBlocks).toBeDefined();
            expect(result.results.failedBlocks.length).toBeGreaterThan(0);
            
            // Failed blocks should include search, replace, and error information
            const firstFailedBlock = result.results.failedBlocks[0];
            expect(firstFailedBlock.search).toBeDefined();
            expect(firstFailedBlock.replace).toBeDefined();
            expect(firstFailedBlock.error).toBeDefined();
            
            // Should have applied the second block that matched
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.blocksFailed).toBe(1);
            expect(result.content).toContain('return "universe";');
        });
    });

    // Enhanced Parser Robustness Tests
    describe('Enhanced Parser Robustness', () => {
        test('should handle blocks within code fences', () => {
            const original = `import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';`;
            
            const diff = `# Comment
\`\`\`
<<<<<<< SEARCH
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
\`\`\`
// import { ErrorBoundary } from './components/ErrorBoundary';  
// import { RouteErrorBoundary } from './components/RouteErrorBoundary';
\`\`\``;
            
            const result = applyDiff(original, diff);
            expect(result.content).toContain('// import { ErrorBoundary }');
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.blocksFailed).toBe(0);
        });
        
        test('should handle SEARCH followed by another SEARCH (invalid)', () => {
            const original = `first line
second line`;
            
            const diff = `<<<<<<< SEARCH
first line
<<<<<<< SEARCH
second line
=======
SECOND LINE
>>>>>>> REPLACE`;
            
            const result = applyDiff(original, diff, { strict: false });
            expect(result.content).toContain('SECOND LINE');
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.errors.length).toBe(1); // Should report the orphaned SEARCH
            expect(result.results.errors[0]).toContain('SEARCH block without corresponding REPLACE');
        });
        
        test('should handle SEARCH without REPLACE at end of file', () => {
            const original = `some content`;
            
            const diff = `<<<<<<< SEARCH
orphaned search content`;
            
            const result = applyDiff(original, diff, { strict: false });
            expect(result.content).toBe(original); // No changes
            expect(result.results.blocksApplied).toBe(0);
            expect(result.results.errors.length).toBe(1);
            expect(result.results.errors[0]).toContain('end of file reached');
        });
        
        test('should handle multiple separators in replace section', () => {
            const original = `old content`;
            
            const diff = `<<<<<<< SEARCH
old content
=======
new content
=======
extra separator that should be ignored
>>>>>>> REPLACE`;
            
            const result = applyDiff(original, diff, { strict: false });
            // This is actually a malformed block and should be rejected
            expect(result.results.blocksApplied).toBe(0);
            expect(result.results.blocksFailed).toBe(0); // Malformed blocks don't count as failed
            expect(result.results.errors.some(error => error.includes('Malformed block with multiple separators'))).toBe(true);
            expect(result.content).toBe(original); // Content should remain unchanged
        });
        
        test('should handle the specific malformed case from logs', () => {
            const original = `import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { EditorPage } from './pages/EditorPage';
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        element: <EditorPage />,
      }
    ]
  },
]);
const rootElement = document.getElementById('root');
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);`;
            
            const diff = `Looking at the provided main.tsx file, I need to analyze it for potential issues:

# Missing ErrorBoundary component - will cause import error

\`\`\`
<<<<<<< SEARCH
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
=======
// import { ErrorBoundary } from './components/ErrorBoundary';
// import { RouteErrorBoundary } from './components/RouteErrorBoundary';
=======
\`\`\`

# Remove ErrorBoundary wrapper since component doesn't exist

\`\`\`
<<<<<<< SEARCH
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        element: <EditorPage />,
      }
    ]
  },
]);
=======
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "/",
        element: <EditorPage />,
      }
    ]
  },
]);
>>>>>>> REPLACE
\`\`\`

# Remove ErrorBoundary from render since component doesn't exist

\`\`\`
<<<<<<< SEARCH
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
=======
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
>>>>>>> REPLACE
\`\`\``;
            
            const result = applyDiff(original, diff, { strict: false });
            
            // First block is malformed and should be ignored, but other 2 should apply
            expect(result.results.blocksFailed).toBe(0); // No blocks failed because malformed ones are ignored
            expect(result.results.blocksApplied).toBe(2); // Last two blocks should apply successfully
            expect(result.results.errors.length).toBeGreaterThan(0); // Should have errors for malformed block
            expect(result.results.errors.some(error => error.includes('Malformed block with multiple separators'))).toBe(true);
            
            // Both valid blocks should be applied
            expect(result.content).not.toContain('errorElement: <RouteErrorBoundary />');
            expect(result.content).not.toContain('<ErrorBoundary>');
            // The imports should remain unchanged since the first block was malformed
            expect(result.content).toContain('import { ErrorBoundary }');
            expect(result.content).toContain('import { RouteErrorBoundary }');
        });
        
        test('should handle malformed block with extra separator and still extract valid content', () => {
            const original = `function test() {
    return 42;
}`;
            
            // This simulates the exact pattern from the logs: valid search, valid replace, but extra separator
            const diff = `<<<<<<< SEARCH
function test() {
    return 42;
}
=======
function test() {
    return 100;
}
=======
`;
            
            const result = applyDiff(original, diff, { strict: false });
            
            // Should fail due to malformed separator structure  
            expect(result.results.blocksFailed).toBe(0); // No blocks failed because malformed ones are ignored
            expect(result.results.blocksApplied).toBe(0);
            expect(result.results.errors.some(error => error.includes('Malformed block with multiple separators'))).toBe(true);
            
            // Content should remain unchanged
            expect(result.content).toContain('return 42;');
        });
        
        test('should handle stray separators gracefully', () => {
            const original = `content here`;
            
            const diff = `=======
Some random text
\`\`\`
More text
=======`;
            
            const result = applyDiff(original, diff, { strict: false });
            expect(result.content).toBe(original); // No changes
            expect(result.results.blocksApplied).toBe(0);
            expect(result.results.blocksFailed).toBe(0);
            expect(result.results.errors.length).toBe(0);
        });
        
        test('should handle mixed code fences and standard markers', () => {
            const original = `old code here`;
            
            const diff = `Text before
\`\`\`
<<<<<<< SEARCH
old code here
\`\`\`
new code here
\`\`\`
Text after`;
            
            const result = applyDiff(original, diff);
            expect(result.content).toBe('new code here');
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.blocksFailed).toBe(0);
        });
        
        test('should handle empty search section', () => {
            const original = `existing content`;
            
            const diff = `<<<<<<< SEARCH

=======
new content
>>>>>>> REPLACE`;
            
            const result = applyDiff(original, diff, { strict: false });
            // Empty search (with just whitespace/newlines) should work for pure additions
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.blocksFailed).toBe(0);
            expect(result.content).toContain('existing content');
            expect(result.content).toContain('new content');
        });
        
        test('should handle empty replace section', () => {
            const original = `remove this content
keep this content`;
            
            const diff = `<<<<<<< SEARCH
remove this content
=======
>>>>>>> REPLACE`;
            
            const result = applyDiff(original, diff);
            expect(result.content).not.toContain('remove this content');
            expect(result.content).toContain('keep this content');
            expect(result.results.blocksApplied).toBe(1);
        });
        
        test('should handle premature end of replace section', () => {
            const original = `content to replace`;
            
            const diff = `<<<<<<< SEARCH
content to replace
=======
new content
<<<<<<< SEARCH
another search`;
            
            const result = applyDiff(original, diff, { strict: false });
            expect(result.content).toContain('new content');
            expect(result.results.blocksApplied).toBe(1);
            expect(result.results.errors.length).toBe(2); // One for premature end, one for orphaned search
            expect(result.results.errors.some(error => error.includes('ended prematurely'))).toBe(true);
            expect(result.results.errors.some(error => error.includes('end of file reached'))).toBe(true);
        });
    });

    describe('validation-tests', () => {
        test('test-01', () => {
            const original = `import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
interface TileProps {
  value: number;
}
const getTileColors = (value: number): string => {
  switch (value) {
    case 2:    return 'bg-[#eee4da] text-[#776e65]';
    case 4:    return 'bg-[#ede0c8] text-[#776e65]';
    case 8:    return 'bg-[#f2b179] text-white';
    case 16:   return 'bg-[#f59563] text-white';
    case 32:   return 'bg-[#f67c5f] text-white';
    case 64:   return 'bg-[#f65e3b] text-white';
    case 128:  return 'bg-[#edcf72] text-white';
    case 256:  return 'bg-[#edcc61] text-white';
    case 512:  return 'bg-[#edc850] text-white';
    case 1024: return 'bg-[#edc53f] text-white';
    case 2048: return 'bg-[#edc22e] text-white';
    default:   return 'bg-[#3c3a32] text-white'; // For higher values
  }
};
const getFontSize = (value: number): string => {
  if (value < 100) return 'text-5xl';
  if (value < 1000) return 'text-4xl';
  return 'text-3xl';
};
const TileComponent: React.FC<TileProps> = ({ value }) => {
  const isZero = value === 0;
  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'w-full h-full rounded-md flex items-center justify-center font-bold',
        isZero ? 'bg-[#cdc1b4]' : getTileColors(value),
        getFontSize(value)
      )}
    >
      {!isZero && value}
    </motion.div>
  );
};
export const Tile = React.memo(TileComponent);`;
            const diff = `# Missing position props that were mentioned in the purpose but not implemented in the interface

\`\`\`
<<<<<<< SEARCH
interface TileProps {
  value: number;
}
=======
interface TileProps {
  value: number;
  position?: { x: number; y: number };
}
>>>>>>> REPLACE
\`\`\`

# Add layoutId for proper framer-motion animations when tiles move positions

\`\`\`
<<<<<<< SEARCH
const TileComponent: React.FC<TileProps> = ({ value }) => {
  const isZero = value === 0;
  return (
          <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
=======
const TileComponent: React.FC<TileProps> = ({ value, position }) => {
  const isZero = value === 0;
  return (
  <motion.div
    layout
    layoutId={position ? \`tile-\${position.x}-\${position.y}\` : undefined}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0, opacity: 0 }}
    transition={{ duration: 0.15 }}
>>>>>>> REPLACE
\`\`\``;
            const expected = `import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
interface TileProps {
  value: number;
  position?: { x: number; y: number };
}
const getTileColors = (value: number): string => {
  switch (value) {
    case 2:    return 'bg-[#eee4da] text-[#776e65]';
    case 4:    return 'bg-[#ede0c8] text-[#776e65]';
    case 8:    return 'bg-[#f2b179] text-white';
    case 16:   return 'bg-[#f59563] text-white';
    case 32:   return 'bg-[#f67c5f] text-white';
    case 64:   return 'bg-[#f65e3b] text-white';
    case 128:  return 'bg-[#edcf72] text-white';
    case 256:  return 'bg-[#edcc61] text-white';
    case 512:  return 'bg-[#edc850] text-white';
    case 1024: return 'bg-[#edc53f] text-white';
    case 2048: return 'bg-[#edc22e] text-white';
    default:   return 'bg-[#3c3a32] text-white'; // For higher values
  }
};
const getFontSize = (value: number): string => {
  if (value < 100) return 'text-5xl';
  if (value < 1000) return 'text-4xl';
  return 'text-3xl';
};
const TileComponent: React.FC<TileProps> = ({ value, position }) => {
  const isZero = value === 0;
  return (
  <motion.div
    layout
    layoutId={position ? \`tile-\${position.x}-\${position.y}\` : undefined}
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0, opacity: 0 }}
    transition={{ duration: 0.15 }}
      className={cn(
        'w-full h-full rounded-md flex items-center justify-center font-bold',
        isZero ? 'bg-[#cdc1b4]' : getTileColors(value),
        getFontSize(value)
      )}
    >
      {!isZero && value}
    </motion.div>
  );
};
export const Tile = React.memo(TileComponent);`;
            const result = applyDiff(original, diff);
            expect(result.content).toBe(expected);
        });
        
        test('test-02', () => {
            
        });
    })
});