const fs = require('fs');

function extractFromPersistedOutput(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const text = parsed[0].text;
  const unescaped = JSON.parse(text);
  const startTag = unescaped.indexOf('[{');
  const endTag = unescaped.lastIndexOf('}]') + 2;
  const jsonStr = unescaped.substring(startTag, endTag);
  return JSON.parse(jsonStr);
}

// Extract singles data
try {
  const singlesRaw = extractFromPersistedOutput(
    '/Users/sukrutgejji/.claude/projects/-Users-sukrutgejji-marketing-bracket-blaze/7c578ce9-e992-4864-8f14-0568a2c80ba0/tool-results/toolu_0124NFE92bZQB4V4fskFuPuw.json'
  );
  const singlesData = singlesRaw[0].json_agg;
  fs.writeFileSync('scripts/singles_matches.json', JSON.stringify(singlesData, null, 2));
  console.log('Singles matches saved:', singlesData.length);
} catch (e) {
  console.error('Error extracting singles:', e.message);
}

// Extract doubles data
try {
  const doublesRaw = extractFromPersistedOutput(
    '/Users/sukrutgejji/.claude/projects/-Users-sukrutgejji-marketing-bracket-blaze/7c578ce9-e992-4864-8f14-0568a2c80ba0/tool-results/mcp-supabase-execute_sql-1772080929386.txt'
  );
  const doublesData = doublesRaw[0].json_agg;
  fs.writeFileSync('scripts/doubles_matches.json', JSON.stringify(doublesData, null, 2));
  console.log('Doubles matches saved:', doublesData.length);
} catch (e) {
  console.error('Error extracting doubles:', e.message);
}
