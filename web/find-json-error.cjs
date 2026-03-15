const fs = require('fs');
const path = require('path');

function findFiles(dir, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 3) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        results.push.apply(results, findFiles(fullPath, depth + 1));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch (e) {}
  return results;
}

const files = findFiles(path.join(__dirname, '..'));
console.log('Checking', files.length, 'files...');

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    try {
      JSON.parse(content);
    } catch(e) {
      if (e.message.includes('20489') || (e.message.includes('line 719') && e.message.includes('column 6'))) {
        console.log('MATCH:', file);
        console.log('  Error:', e.message);
      }
    }
  } catch (e) {}
}

// Also try JSON.parse on the JS export objects if loaded as CJS
// Check translation files specifically
try {
  const enContent = fs.readFileSync(path.join(__dirname, 'src/lib/translations/en.js'), 'utf8');
  // Strip the export wrapper to get just the object
  const enObj = enContent.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').replace(/^const \w+ = /, '').replace(/;\s*export default \w+;\s*$/, '');
  try {
    JSON.parse(enObj);
  } catch(e) {
    if (e.message.includes('20489') || (e.message.includes('line 719') && e.message.includes('column 6'))) {
      console.log('MATCH (en.js object):', e.message);
    }
  }
} catch(e) {}

try {
  const roContent = fs.readFileSync(path.join(__dirname, 'src/lib/translations/ro.js'), 'utf8');
  const roObj = roContent.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').replace(/^const \w+ = /, '').replace(/;\s*export default \w+;\s*$/, '');
  try {
    JSON.parse(roObj);
  } catch(e) {
    if (e.message.includes('20489') || (e.message.includes('line 719') && e.message.includes('column 6'))) {
      console.log('MATCH (ro.js object):', e.message);
    }
  }
} catch(e) {}

console.log('Done');
