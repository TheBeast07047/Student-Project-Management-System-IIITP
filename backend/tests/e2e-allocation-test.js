/**
 * End-to-end test for the Faculty Allocation System.
 * Tests all API endpoints across student, faculty, and admin roles.
 *
 * Run: node tests/e2e-allocation-test.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const Group = require('../models/Group');
const Faculty = require('../models/Faculty');
const SystemConfig = require('../models/SystemConfig');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const BASE = 'http://localhost:3000';

let passed = 0, failed = 0;
const issues = [];

function genToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

async function req(method, path, token = null, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    try { return { status: res.status, data: JSON.parse(text), ok: res.ok }; }
    catch { return { status: res.status, data: text, ok: res.ok }; }
}

function ok(cond, msg, detail) {
    if (cond) { console.log(`  ✅ ${msg}`); passed++; }
    else { console.error(`  ❌ ${msg}`); if (detail) console.error(`     ↳ ${detail}`); failed++; issues.push(msg); }
}

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // ── Setup: Get test users ──
    const adminUser = await User.findOne({ role: 'admin' });
    const leaderMIS = ['202300101', '202300106', '202300111'];
    const leaders = [];
    for (const mis of leaderMIS) {
        const s = await Student.findOne({ misNumber: mis }).populate('user');
        if (s) leaders.push(s);
    }
    const allFaculty = await Faculty.find({}).populate('user').limit(5);
    const facultyIds = allFaculty.map(f => f._id.toString());

    console.log(`📋 Leaders: ${leaders.length}, Faculty: ${allFaculty.length}, Admin: ${adminUser?.email}\n`);
    if (!adminUser || leaders.length < 3 || allFaculty.length < 2) {
        console.error('❌ Missing test data'); await mongoose.disconnect(); return;
    }

    const adminToken = genToken(adminUser._id);
    const studentTokens = leaders.map(l => genToken(l.user._id));
    const facultyToken = allFaculty[0].user ? genToken(allFaculty[0].user._id) : null;

    // ══════════════════════════════════════
    // 1. ADMIN: Get + Update Config
    // ══════════════════════════════════════
    console.log('━━━ 1. ADMIN CONFIG ━━━');

    const cfgGet = await req('GET', '/allocation/admin/config', adminToken);
    ok(cfgGet.ok, `GET config — ${cfgGet.status}`, !cfgGet.ok && JSON.stringify(cfgGet.data).slice(0, 200));

    // Set config with proper date windows (now → +30 days)
    const windowStart = new Date().toISOString();
    const windowEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const cfgPut = await req('PUT', '/allocation/admin/config', adminToken, {
        minGroupPreferences: 1,
        maxGroupPreferences: 7,
        defaultFacultyCapacity: 3,
        tiebreakMethod: 'alphabetical',
        groupPreferenceWindow: { start: windowStart, end: windowEnd },
        facultyRankingWindow: { start: windowStart, end: windowEnd },
    });
    ok(cfgPut.ok, `PUT config (set windows open) — ${cfgPut.status}`, !cfgPut.ok && JSON.stringify(cfgPut.data).slice(0, 200));

    // Verify the window is now considered open
    const cfgGet2 = await req('GET', '/allocation/admin/config', adminToken);
    const gpStatus = cfgGet2.data?.data?.windowStatus?.groupPreference?.status;
    ok(gpStatus === 'open', `Group pref window is now "${gpStatus}"`, `Expected "open" but got "${gpStatus}"`);

    // ══════════════════════════════════════
    // 2. FACULTY LIST
    // ══════════════════════════════════════
    console.log('\n━━━ 2. FACULTY LIST ━━━');

    const facList = await req('GET', '/allocation/faculty-list', studentTokens[0]);
    ok(facList.ok, `GET faculty-list — ${facList.status}`);
    const facultyCount = facList.data?.data?.length || 0;
    console.log(`     ${facultyCount} faculty available`);

    // ══════════════════════════════════════
    // 3. STUDENT: Submit Preferences
    // ══════════════════════════════════════
    console.log('\n━━━ 3. STUDENT PREFERENCES ━━━');

    for (let i = 0; i < leaders.length; i++) {
        const leader = leaders[i];
        const token = studentTokens[i];

        // GET preferences
        const getP = await req('GET', '/allocation/student/preferences', token);
        ok(getP.ok || getP.status === 404, `GET prefs (${leader.fullName}) — ${getP.status}`);

        // POST submit preferences
        const shuffled = [...facultyIds].sort(() => Math.random() - 0.5);
        const prefs = shuffled.slice(0, Math.min(3, shuffled.length)).map((id, j) => ({ faculty: id, rank: j + 1 }));
        const postP = await req('POST', '/allocation/student/preferences', token, { preferences: prefs });
        ok(postP.ok, `POST prefs (${leader.fullName}) — ${postP.status}`, !postP.ok && JSON.stringify(postP.data?.message || postP.data).slice(0, 200));
    }

    // Demand
    const demand = await req('GET', '/allocation/student/demand', studentTokens[0]);
    ok(demand.ok, `GET demand — ${demand.status}`);

    // Student allocation status
    const stuStatus = await req('GET', '/allocation/student/status', studentTokens[0]);
    ok(stuStatus.ok, `GET student status — ${stuStatus.status}`);

    // ══════════════════════════════════════
    // 4. FACULTY: Rankings
    // ══════════════════════════════════════
    console.log('\n━━━ 4. FACULTY RANKINGS ━━━');

    if (facultyToken) {
        const rankGet = await req('GET', '/allocation/faculty/rankings', facultyToken);
        ok(rankGet.ok || rankGet.status === 404, `GET rankings — ${rankGet.status}`);

        const facStatus = await req('GET', '/allocation/faculty/status', facultyToken);
        ok(facStatus.ok, `GET faculty status — ${facStatus.status}`, !facStatus.ok && JSON.stringify(facStatus.data).slice(0, 200));

        // Get groups-to-rank
        const groupsToRank = await req('GET', '/allocation/faculty/groups-to-rank', facultyToken);
        ok(groupsToRank.ok, `GET groups-to-rank — ${groupsToRank.status}`);
        const numGroups = groupsToRank.data?.data?.groups?.length || 0;
        console.log(`     Groups that chose this faculty: ${numGroups}`);

        // Submit rankings if there are groups to rank
        if (numGroups > 0) {
            const groups = groupsToRank.data.data.groups;
            const rankings = groups.map((g, idx) => ({ group: g._id, rank: idx + 1 }));
            const rankPost = await req('POST', '/allocation/faculty/rankings', facultyToken, { rankings });
            ok(rankPost.ok, `POST rankings — ${rankPost.status}`, !rankPost.ok && JSON.stringify(rankPost.data?.message || rankPost.data).slice(0, 200));
        }
    } else {
        console.log('  ⏭️  No faculty token');
    }

    // ══════════════════════════════════════
    // 5. ADMIN: Validate, Run, Results
    // ══════════════════════════════════════
    console.log('\n━━━ 5. ADMIN PIPELINE ━━━');

    const validate = await req('POST', '/allocation/admin/validate', adminToken);
    ok(validate.ok, `POST validate — ${validate.status}`);
    if (validate.data?.data) {
        const v = validate.data.data;
        console.log(`     ready=${v.isReady}, groups=${v.totalGroups}, withPrefs=${v.groupsWithPreferences}`);
    }

    // Faculty capacity
    const cap = await req('GET', '/allocation/admin/faculty-capacity', adminToken);
    ok(cap.ok, `GET faculty-capacity — ${cap.status}`);

    // Admin pool
    const pool = await req('GET', '/allocation/admin/admin-pool', adminToken);
    ok(pool.ok, `GET admin-pool — ${pool.status}`);

    // Run algorithm
    const runRes = await req('POST', '/allocation/admin/run', adminToken);
    ok(runRes.ok, `POST run (algorithm) — ${runRes.status}`, !runRes.ok && JSON.stringify(runRes.data?.message || runRes.data).slice(0, 300));
    if (runRes.ok) {
        console.log(`     Algorithm completed ✅`);

        // Get results
        const results = await req('GET', '/allocation/admin/results', adminToken);
        ok(results.ok, `GET results — ${results.status}`);
        if (results.data?.data) {
            const r = results.data.data;
            console.log(`     Matched: ${r.matchedGroups}, AdminPool: ${r.adminPoolGroups}, Rounds: ${r.totalRounds}`);
        }
    }

    // ══════════════════════════════════════
    // 6. FRONTEND ROUTE CHECKS
    // ══════════════════════════════════════
    console.log('\n━━━ 6. FRONTEND ROUTES ━━━');

    const routes = [
        '/student/allocation/preferences',
        '/faculty/allocation/rankings',
        '/admin/allocation',
    ];
    for (const route of routes) {
        try {
            const r = await fetch(`http://localhost:5173${route}`);
            ok(r.status === 200, `Frontend ${route} — ${r.status}`);
        } catch (e) {
            ok(false, `Frontend ${route}`, e.message);
        }
    }

    // ══════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`Total: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);
    if (issues.length > 0) {
        console.log(`\n🔴 Failures:`);
        issues.forEach((iss, i) => console.log(`  ${i + 1}. ${iss}`));
    } else {
        console.log(`\n🟢 All ${passed} tests passed!`);
    }
    console.log(`${'═'.repeat(50)}`);

    await mongoose.disconnect();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
