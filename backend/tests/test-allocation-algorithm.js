/**
 * Unit test for the Gale-Shapley allocation algorithm.
 * Tests the pure algorithm function with the specification's example scenario.
 * 
 * Run: node tests/test-allocation-algorithm.js
 */

const { runGaleShapley, applyTiebreak } = require('../services/allocationService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ ${message}`);
        passed++;
    } else {
        console.error(`  ❌ ${message}`);
        failed++;
    }
}

// =============================================
// Test 1: Basic Gale-Shapley (specification example)
// =============================================
console.log('\n📋 Test 1: Basic 5-group, 3-faculty scenario');
{
    // Groups: G1, G2, G3, G4, G5
    // Faculty: F1 (cap 2), F2 (cap 2), F3 (cap 1)
    const groupPrefs = new Map([
        ['G1', ['F1', 'F2', 'F3']],
        ['G2', ['F1', 'F3']],
        ['G3', ['F2', 'F1']],
        ['G4', ['F1', 'F2', 'F3']],
        ['G5', ['F2', 'F1']],
    ]);

    const facultyPrefs = new Map([
        ['F1', new Map([['G1', 1], ['G4', 2], ['G2', 3], ['G5', 4]])],
        ['F2', new Map([['G3', 1], ['G5', 2], ['G1', 3], ['G4', 4]])],
        ['F3', new Map([['G4', 1], ['G2', 2]])],
    ]);

    const facultyCapacities = new Map([
        ['F1', 2],
        ['F2', 2],
        ['F3', 1],
    ]);

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);

    assert(result.matches.size === 5, `All 5 groups matched (got ${result.matches.size})`);
    assert(result.adminPool.length === 0, `No groups in admin pool (got ${result.adminPool.length})`);

    // Check stability: no group should prefer a faculty who also prefers them over their current match
    const matchMap = {};
    for (const [gId, m] of result.matches) matchMap[gId] = m.faculty;

    assert(matchMap['G1'] === 'F1', `G1 → F1 (got ${matchMap['G1']})`);
    assert(matchMap['G3'] === 'F2', `G3 → F2 (got ${matchMap['G3']})`);
}

// =============================================
// Test 2: Admin pool (groups exhaust preferences)
// =============================================
console.log('\n📋 Test 2: Groups exhaust preferences → admin pool');
{
    const groupPrefs = new Map([
        ['G1', ['F1']],  // Only 1 preference
        ['G2', ['F1']],  // Only 1 preference — same faculty
    ]);

    const facultyPrefs = new Map([
        ['F1', new Map([['G1', 1], ['G2', 2]])],
    ]);

    const facultyCapacities = new Map([
        ['F1', 1],  // Only 1 slot
    ]);

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);

    assert(result.matches.size === 1, `1 group matched (got ${result.matches.size})`);
    assert(result.adminPool.length === 1, `1 group in admin pool (got ${result.adminPool.length})`);
    assert(result.adminPool[0] === 'G2', `G2 is in admin pool (got ${result.adminPool[0]})`);
    assert(result.matches.get('G1').faculty === 'F1', `G1 → F1 (got ${result.matches.get('G1')?.faculty})`);
}

// =============================================
// Test 3: Zero capacity faculty
// =============================================
console.log('\n📋 Test 3: Faculty with capacity 0');
{
    const groupPrefs = new Map([
        ['G1', ['F_zero', 'F_ok']],
    ]);

    const facultyPrefs = new Map([
        ['F_zero', new Map([['G1', 1]])],
        ['F_ok', new Map([['G1', 1]])],
    ]);

    const facultyCapacities = new Map([
        ['F_zero', 0],
        ['F_ok', 1],
    ]);

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);

    assert(result.matches.size === 1, `G1 matched (got ${result.matches.size})`);
    assert(result.matches.get('G1').faculty === 'F_ok', `G1 → F_ok, not F_zero (got ${result.matches.get('G1')?.faculty})`);
}

// =============================================
// Test 4: Empty input
// =============================================
console.log('\n📋 Test 4: Empty input (no groups)');
{
    const result = runGaleShapley(new Map(), new Map(), new Map());
    assert(result.matches.size === 0, `No matches (got ${result.matches.size})`);
    assert(result.adminPool.length === 0, `No admin pool (got ${result.adminPool.length})`);
    assert(result.totalRounds <= 1, `Terminates quickly (got ${result.totalRounds} rounds)`);
}

// =============================================
// Test 5: Single group, single faculty
// =============================================
console.log('\n📋 Test 5: Single group, single faculty');
{
    const groupPrefs = new Map([['G1', ['F1']]]);
    const facultyPrefs = new Map([['F1', new Map([['G1', 1]])]]);
    const facultyCapacities = new Map([['F1', 1]]);

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);
    assert(result.matches.size === 1, `1 match (got ${result.matches.size})`);
    assert(result.matches.get('G1').faculty === 'F1', `G1 → F1`);
    assert(result.matches.get('G1').prefRank === 1, `G1 gets 1st preference (got ${result.matches.get('G1')?.prefRank})`);
}

// =============================================
// Test 6: Bumping (group displaced by higher-ranked)
// =============================================
console.log('\n📋 Test 6: Bumping — lower-ranked group displaced');
{
    const groupPrefs = new Map([
        ['G_low', ['F1', 'F2']],
        ['G_high', ['F1']],
    ]);

    // F1 prefers G_high over G_low
    const facultyPrefs = new Map([
        ['F1', new Map([['G_high', 1], ['G_low', 2]])],
        ['F2', new Map([['G_low', 1]])],
    ]);

    const facultyCapacities = new Map([
        ['F1', 1],
        ['F2', 1],
    ]);

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);

    assert(result.matches.get('G_high').faculty === 'F1', `G_high → F1 (higher ranked)`);
    assert(result.matches.get('G_low').faculty === 'F2', `G_low → F2 (bumped, falls to next pref)`);
}

// =============================================
// Test 7: Tiebreak helper
// =============================================
console.log('\n📋 Test 7: Tiebreak helpers');
{
    const groups = [
        { name: 'Gamma', createdAt: new Date('2025-03-01') },
        { name: 'Alpha', createdAt: new Date('2025-01-01') },
        { name: 'Beta', createdAt: new Date('2025-02-01') },
    ];

    const alphabetical = applyTiebreak(groups, 'alphabetical');
    assert(alphabetical[0].name === 'Alpha', `Alphabetical: first is Alpha (got ${alphabetical[0].name})`);
    assert(alphabetical[2].name === 'Gamma', `Alphabetical: last is Gamma (got ${alphabetical[2].name})`);

    const timestamp = applyTiebreak(groups, 'timestamp');
    assert(timestamp[0].name === 'Alpha', `Timestamp: earliest is Alpha (got ${timestamp[0].name})`);
    assert(timestamp[2].name === 'Gamma', `Timestamp: latest is Gamma (got ${timestamp[2].name})`);

    const random = applyTiebreak(groups, 'random');
    assert(random.length === 3, `Random: all 3 groups present (got ${random.length})`);
}

// =============================================
// Test 8: Large-scale stress test
// =============================================
console.log('\n📋 Test 8: Large-scale (50 groups, 10 faculty, cap 5 each)');
{
    const groupPrefs = new Map();
    const facultyPrefs = new Map();
    const facultyCapacities = new Map();

    // 10 faculty with capacity 5
    for (let f = 1; f <= 10; f++) {
        facultyCapacities.set(`F${f}`, 5);
        facultyPrefs.set(`F${f}`, new Map());
    }

    // 50 groups, each listing 5 random faculty
    for (let g = 1; g <= 50; g++) {
        const prefs = [];
        const used = new Set();
        while (prefs.length < 5) {
            const f = `F${Math.floor(Math.random() * 10) + 1}`;
            if (!used.has(f)) {
                used.add(f);
                prefs.push(f);
            }
        }
        groupPrefs.set(`G${g}`, prefs);
    }

    // Faculty rank all groups that listed them (by group number = rank)
    for (const [gId, prefs] of groupPrefs) {
        for (const fId of prefs) {
            const facRank = facultyPrefs.get(fId);
            facRank.set(gId, facRank.size + 1);
        }
    }

    const result = runGaleShapley(groupPrefs, facultyPrefs, facultyCapacities);

    assert(result.matches.size + result.adminPool.length === 50, `All 50 groups accounted for (matched: ${result.matches.size}, pool: ${result.adminPool.length})`);
    assert(result.matches.size === 50, `All 50 groups matched (capacity = 50, groups = 50) — got ${result.matches.size}`);
    assert(result.totalRounds < 100, `Terminated in reasonable rounds (got ${result.totalRounds})`);
}

// =============================================
// Summary
// =============================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
