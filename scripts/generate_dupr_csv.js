// Script to generate DUPR upload CSV from tournament match data
// Run with: node scripts/generate_dupr_csv.js

const fs = require('fs');
const path = require('path');

// Read DUPR ID mapping from the CSV
const duprCsvPath = path.join(__dirname, '..', '..', '..', 'Downloads', "B'luru Open Contender Tour - Indiranagar Pickleball - Copy of dupr.csv");
const duprCsv = fs.readFileSync(duprCsvPath, 'utf-8');
const duprLines = duprCsv.trim().split('\n');
const duprMap = {}; // participant_id -> { display_name, dupr_id }
const noDuprPlayers = new Set(); // participant IDs with no DUPR

for (let i = 1; i < duprLines.length; i++) {
  const cols = duprLines[i].split(',');
  const pid = cols[0];
  const name = cols[1];
  const duprId = cols[5] ? cols[5].trim() : '';
  duprMap[pid] = { display_name: name, dupr_id: duprId };
  if (!duprId) noDuprPlayers.add(pid);
}

// Read match data files (we'll generate these from SQL queries)
const singlesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'singles_matches.json'), 'utf-8'));
const doublesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'doubles_matches.json'), 'utf-8'));

const allRows = [];
const affectedMatches = [];

// Process singles matches
for (const m of singlesData) {
  const sideAId = m.side_a_participant_id;
  const sideBId = m.side_b_participant_id;
  const sideAInfo = duprMap[sideAId] || { display_name: m.side_a_player, dupr_id: '' };
  const sideBInfo = duprMap[sideBId] || { display_name: m.side_b_player, dupr_id: '' };

  const games = m.meta_json?.games || [];
  const scores = [];
  for (let g = 0; g < 5; g++) {
    if (g < games.length) {
      scores.push(games[g].score_a, games[g].score_b);
    } else {
      scores.push('', '');
    }
  }

  const hasMissingDupr = !sideAInfo.dupr_id || !sideBInfo.dupr_id;
  const missingPlayers = [];
  if (!sideAInfo.dupr_id) missingPlayers.push(sideAInfo.display_name);
  if (!sideBInfo.dupr_id) missingPlayers.push(sideBInfo.display_name);

  const row = {
    matchType: 'S',
    scoreType: 'SIDEOUT',
    event: `B'luru Open Contender Tour - Indiranagar - ${m.division_name}`,
    date: '02/22/2026',
    playerA1: sideAInfo.display_name,
    playerA1DuprId: sideAInfo.dupr_id,
    playerA2: '',
    playerA2DuprId: '',
    playerB1: sideBInfo.display_name,
    playerB1DuprId: sideBInfo.dupr_id,
    playerB2: '',
    playerB2DuprId: '',
    teamAGame1: scores[0],
    teamBGame1: scores[1],
    teamAGame2: scores[2],
    teamBGame2: scores[3],
    teamAGame3: scores[4],
    teamBGame3: scores[5],
    teamAGame4: scores[6],
    teamBGame4: scores[7],
    teamAGame5: scores[8],
    teamBGame5: scores[9],
    sortTime: m.actual_end_time || m.actual_start_time || m.assigned_at || '',
    hasMissingDupr,
    missingPlayers,
    division: m.division_name,
    round: m.round,
    phase: m.phase,
  };

  allRows.push(row);

  if (hasMissingDupr) {
    affectedMatches.push({
      division: m.division_name,
      round: m.round,
      phase: m.phase,
      sideA: sideAInfo.display_name,
      sideB: sideBInfo.display_name,
      missingPlayers,
      scores: games.map(g => `${g.score_a}-${g.score_b}`).join(', '),
    });
  }
}

// Process doubles matches
for (const m of doublesData) {
  const games = m.meta_json?.games || [];
  const scores = [];
  for (let g = 0; g < 5; g++) {
    if (g < games.length) {
      scores.push(games[g].score_a, games[g].score_b);
    } else {
      scores.push('', '');
    }
  }

  // Side A players
  const sideA1Id = m.side_a_p1_id;
  const sideA2Id = m.side_a_p2_id;
  const sideB1Id = m.side_b_p1_id;
  const sideB2Id = m.side_b_p2_id;

  const sideA1Info = duprMap[sideA1Id] || { display_name: m.side_a_p1_name || '', dupr_id: '' };
  const sideA2Info = duprMap[sideA2Id] || { display_name: m.side_a_p2_name || '', dupr_id: '' };
  const sideB1Info = duprMap[sideB1Id] || { display_name: m.side_b_p1_name || '', dupr_id: '' };
  const sideB2Info = duprMap[sideB2Id] || { display_name: m.side_b_p2_name || '', dupr_id: '' };

  const missingPlayers = [];
  if (sideA1Id && !sideA1Info.dupr_id) missingPlayers.push(sideA1Info.display_name);
  if (sideA2Id && !sideA2Info.dupr_id) missingPlayers.push(sideA2Info.display_name);
  if (sideB1Id && !sideB1Info.dupr_id) missingPlayers.push(sideB1Info.display_name);
  if (sideB2Id && !sideB2Info.dupr_id) missingPlayers.push(sideB2Info.display_name);
  const hasMissingDupr = missingPlayers.length > 0;

  const teamAName = [sideA1Info.display_name, sideA2Info.display_name].filter(Boolean).join(' / ');
  const teamBName = [sideB1Info.display_name, sideB2Info.display_name].filter(Boolean).join(' / ');

  const row = {
    matchType: 'D',
    scoreType: 'SIDEOUT',
    event: `B'luru Open Contender Tour - Indiranagar - ${m.division_name}`,
    date: '02/22/2026',
    playerA1: sideA1Info.display_name,
    playerA1DuprId: sideA1Info.dupr_id,
    playerA2: sideA2Info.display_name,
    playerA2DuprId: sideA2Info.dupr_id,
    playerB1: sideB1Info.display_name,
    playerB1DuprId: sideB1Info.dupr_id,
    playerB2: sideB2Info.display_name,
    playerB2DuprId: sideB2Info.dupr_id,
    teamAGame1: scores[0],
    teamBGame1: scores[1],
    teamAGame2: scores[2],
    teamBGame2: scores[3],
    teamAGame3: scores[4],
    teamBGame3: scores[5],
    teamAGame4: scores[6],
    teamBGame4: scores[7],
    teamAGame5: scores[8],
    teamBGame5: scores[9],
    sortTime: m.actual_end_time || m.actual_start_time || m.assigned_at || '',
    hasMissingDupr,
    missingPlayers,
    division: m.division_name,
    round: m.round,
    phase: m.phase,
  };

  allRows.push(row);

  if (hasMissingDupr) {
    affectedMatches.push({
      division: m.division_name,
      round: m.round,
      phase: m.phase,
      sideA: teamAName,
      sideB: teamBName,
      missingPlayers,
      scores: games.map(g => `${g.score_a}-${g.score_b}`).join(', '),
    });
  }
}

// Sort all rows by time played
allRows.sort((a, b) => {
  if (!a.sortTime && !b.sortTime) return 0;
  if (!a.sortTime) return 1;
  if (!b.sortTime) return -1;
  return a.sortTime.localeCompare(b.sortTime);
});

// Generate DUPR CSV (only matches where ALL players have DUPR IDs)
const header = 'matchType,scoreType,event,date,playerA1,playerA1DuprId,playerA2,playerA2DuprId,playerB1,playerB1DuprId,playerB2,playerB2DuprId,teamAGame1,teamBGame1,teamAGame2,teamBGame2,teamAGame3,teamBGame3,teamAGame4,teamBGame4,teamAGame5,teamBGame5';

const csvRows = [header];
let uploadable = 0;
let skipped = 0;

for (const row of allRows) {
  if (row.hasMissingDupr) {
    skipped++;
    continue;
  }
  uploadable++;
  csvRows.push([
    row.matchType,
    row.scoreType,
    `"${row.event}"`,
    row.date,
    `"${row.playerA1}"`,
    row.playerA1DuprId,
    row.playerA2 ? `"${row.playerA2}"` : '',
    row.playerA2DuprId,
    `"${row.playerB1}"`,
    row.playerB1DuprId,
    row.playerB2 ? `"${row.playerB2}"` : '',
    row.playerB2DuprId,
    row.teamAGame1,
    row.teamBGame1,
    row.teamAGame2,
    row.teamBGame2,
    row.teamAGame3,
    row.teamBGame3,
    row.teamAGame4,
    row.teamBGame4,
    row.teamAGame5,
    row.teamBGame5,
  ].join(','));
}

const outputPath = path.join(__dirname, '..', 'bluru-open-dupr-upload.csv');
fs.writeFileSync(outputPath, csvRows.join('\n') + '\n');

// Generate affected matches report
const reportLines = [];
reportLines.push('MATCHES EXCLUDED FROM DUPR UPLOAD');
reportLines.push('=================================');
reportLines.push(`Total completed matches: ${allRows.length}`);
reportLines.push(`Uploadable to DUPR: ${uploadable}`);
reportLines.push(`Excluded (missing DUPR IDs): ${skipped}`);
reportLines.push('');

// List players without DUPR
const playersWithoutDupr = [];
for (const [pid, info] of Object.entries(duprMap)) {
  if (!info.dupr_id) playersWithoutDupr.push(info.display_name);
}
reportLines.push('PLAYERS WITHOUT DUPR IDs:');
reportLines.push('-------------------------');
playersWithoutDupr.sort().forEach(name => reportLines.push(`  - ${name}`));
reportLines.push('');

reportLines.push('AFFECTED MATCHES (excluded from upload):');
reportLines.push('----------------------------------------');

// Group by division
const byDivision = {};
for (const m of affectedMatches) {
  const key = m.division;
  if (!byDivision[key]) byDivision[key] = [];
  byDivision[key].push(m);
}

for (const [div, matches] of Object.entries(byDivision)) {
  reportLines.push(`\n${div}:`);
  for (const m of matches) {
    reportLines.push(`  ${m.phase} R${m.round}: ${m.sideA} vs ${m.sideB} (${m.scores})`);
    reportLines.push(`    Missing DUPR: ${m.missingPlayers.join(', ')}`);
  }
}

const reportPath = path.join(__dirname, '..', 'bluru-open-dupr-excluded-matches.txt');
fs.writeFileSync(reportPath, reportLines.join('\n') + '\n');

console.log(`DUPR CSV: ${outputPath} (${uploadable} matches)`);
console.log(`Excluded report: ${reportPath} (${skipped} matches)`);
console.log(`Players without DUPR: ${playersWithoutDupr.length}`);
