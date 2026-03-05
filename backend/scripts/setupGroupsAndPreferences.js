/**
 * setupGroupsAndPreferences.js
 *
 * Run AFTER seedNewDatabase.js.
 * Creates:
 *   - 4 finalized groups (5 students each)
 *   - 4 registered projects (minor2)
 *   - Faculty preference records for each group/project
 *   - Faculty rankings for each faculty
 *
 * Usage: node scripts/setupGroupsAndPreferences.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Group = require('../models/Group');
const Project = require('../models/Project');
const FacultyPreference = require('../models/FacultyPreference');
const FacultyRanking = require('../models/FacultyRanking');

const ACADEMIC_YEAR = '2025-26';
const SEMESTER = 5;

// Console helpers
const c = {
    reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', bright: '\x1b[1m'
};
const ok = msg => console.log(`${c.green}✅ ${msg}${c.reset}`);
const fail = msg => console.log(`${c.red}❌ ${msg}${c.reset}`);
const info = msg => console.log(`${c.cyan}ℹ️  ${msg}${c.reset}`);
const head = msg => console.log(`\n${c.bright}${c.cyan}${'═'.repeat(60)}\n  ${msg}\n${'═'.repeat(60)}${c.reset}`);

async function main() {
    head('SETTING UP GROUPS, PROJECTS & PREFERENCES');

    // Connect
    await mongoose.connect(process.env.MONGODB_URI);
    ok('Connected to MongoDB');

    // Clean up any leftover groups/projects/prefs from a previous run of THIS script
    await Group.deleteMany({ semester: SEMESTER, academicYear: ACADEMIC_YEAR });
    await Project.deleteMany({ semester: SEMESTER, academicYear: ACADEMIC_YEAR, projectType: 'minor2' });
    await FacultyPreference.deleteMany({ semester: SEMESTER, academicYear: ACADEMIC_YEAR });
    await FacultyRanking.deleteMany({ semester: SEMESTER, academicYear: ACADEMIC_YEAR });
    // Reset student groupId and groupMemberships
    await Student.updateMany(
        { semester: SEMESTER, academicYear: ACADEMIC_YEAR },
        { $set: { groupId: null, groupMemberships: [], invites: [] } }
    );
    ok('Cleaned up previous group/project/preference data');

    // Load students & faculty
    const students = await Student.find({ semester: SEMESTER, academicYear: ACADEMIC_YEAR }).sort({ misNumber: 1 });
    const faculties = await Faculty.find({}).sort({ facultyId: 1 });

    if (students.length < 20) { fail(`Need 20 students, found ${students.length}`); process.exit(1); }
    if (faculties.length < 5) { fail(`Need 5 faculty, found ${faculties.length}`); process.exit(1); }

    info(`Found ${students.length} students and ${faculties.length} faculty`);

    // ──────────────────────────────────────
    // 1. Create 4 groups of 5 students
    // ──────────────────────────────────────
    head('CREATING 4 GROUPS (5 STUDENTS EACH)');

    const groupDefinitions = [
        { name: 'Team Alpha', leaderIdx: 0, memberIdxs: [1, 2, 3, 4] },
        { name: 'Team Beta', leaderIdx: 5, memberIdxs: [6, 7, 8, 9] },
        { name: 'Team Gamma', leaderIdx: 10, memberIdxs: [11, 12, 13, 14] },
        { name: 'Team Delta', leaderIdx: 15, memberIdxs: [16, 17, 18, 19] },
    ];

    const groups = [];
    for (const def of groupDefinitions) {
        const leader = students[def.leaderIdx];
        const memberStudents = def.memberIdxs.map(i => students[i]);

        // Create group with leader already as member
        const group = new Group({
            name: def.name,
            description: `Sem 5 Minor Project 2 group`,
            semester: SEMESTER,
            academicYear: ACADEMIC_YEAR,
            maxMembers: 5,
            minMembers: 4,
            createdBy: leader._id,
            leader: leader._id,
            status: 'finalized',
            finalizedAt: new Date(),
            finalizedBy: leader._id,
            members: [
                {
                    student: leader._id,
                    role: 'leader',
                    isActive: true,
                    joinedAt: new Date(),
                    inviteStatus: 'accepted'
                },
                ...memberStudents.map(s => ({
                    student: s._id,
                    role: 'member',
                    isActive: true,
                    joinedAt: new Date(),
                    inviteStatus: 'accepted'
                }))
            ],
            invites: [
                {
                    student: leader._id,
                    role: 'leader',
                    invitedBy: leader._id,
                    invitedAt: new Date(),
                    status: 'accepted'
                },
                ...memberStudents.map(s => ({
                    student: s._id,
                    role: 'member',
                    invitedBy: leader._id,
                    invitedAt: new Date(),
                    status: 'accepted'
                }))
            ]
        });

        await group.save();

        // Update student records
        const allMembers = [leader, ...memberStudents];
        for (const s of allMembers) {
            s.groupId = group._id;
            s.groupMemberships.push({
                group: group._id,
                role: s._id.equals(leader._id) ? 'leader' : 'member',
                semester: SEMESTER,
                isActive: true,
                joinedAt: new Date()
            });
            await s.save();
        }

        groups.push(group);
        ok(`${def.name}: ${leader.fullName} (leader) + ${memberStudents.map(s => s.fullName).join(', ')}`);
    }
    ok(`Created ${groups.length} finalized groups`);

    // ──────────────────────────────────────
    // 2. Register projects for each group
    // ──────────────────────────────────────
    head('REGISTERING PROJECTS (minor2)');

    const projectTitles = [
        'AI-Powered Student Attendance System',
        'Blockchain-Based Certificate Verification',
        'Smart Campus IoT Monitoring Dashboard',
        'NLP-Based Plagiarism Detection Tool'
    ];

    const projects = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const leader = students[groupDefinitions[i].leaderIdx];

        const project = await Project.create({
            title: projectTitles[i],
            description: `Semester 5 Minor Project 2 by ${group.name}`,
            projectType: 'minor2',
            student: leader._id,
            group: group._id,
            semester: SEMESTER,
            academicYear: ACADEMIC_YEAR,
            status: 'registered',
            currentFacultyIndex: 0
        });

        // Link project to group
        group.project = project._id;
        await group.save();

        projects.push(project);
        ok(`Project: "${projectTitles[i]}" → ${group.name}`);
    }

    // ──────────────────────────────────────
    // 3. Submit faculty preferences for each group
    // ──────────────────────────────────────
    head('SUBMITTING FACULTY PREFERENCES (group → faculty)');

    // Each group ranks the 5 faculty in a different order
    // This creates interesting allocation dynamics
    const preferenceOrders = [
        // Team Alpha prefers: FAC001, FAC002, FAC003, FAC004, FAC005
        [0, 1, 2, 3, 4],
        // Team Beta prefers:  FAC001, FAC003, FAC002, FAC005, FAC004
        [0, 2, 1, 4, 3],
        // Team Gamma prefers: FAC002, FAC001, FAC004, FAC003, FAC005
        [1, 0, 3, 2, 4],
        // Team Delta prefers: FAC003, FAC005, FAC001, FAC002, FAC004
        [2, 4, 0, 1, 3],
    ];

    const facPrefDocs = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const project = projects[i];
        const leader = students[groupDefinitions[i].leaderIdx];
        const order = preferenceOrders[i];

        // Build preferences array (sorted by priority 1..5)
        const preferences = order.map((facIdx, priority) => ({
            faculty: faculties[facIdx]._id,
            priority: priority + 1,
            submittedAt: new Date()
        }));

        // Also set preferences on the Project model
        project.facultyPreferences = preferences.map(p => ({
            faculty: p.faculty,
            priority: p.priority
        }));
        await project.save();

        // Also set preferences on the Group model
        group.facultyPreferences = preferences.map(p => ({
            faculty: p.faculty,
            priority: p.priority
        }));
        await group.save();

        // Create FacultyPreference document
        const facPref = await FacultyPreference.create({
            student: leader._id,
            project: project._id,
            group: group._id,
            preferences,
            semester: SEMESTER,
            academicYear: ACADEMIC_YEAR,
            status: 'pending',
            currentFacultyIndex: 0
        });
        facPrefDocs.push(facPref);

        const facNames = order.map((fi, pi) => `${pi + 1}.${faculties[fi].fullName}`);
        ok(`${group.name} prefs: ${facNames.join(' → ')}`);
    }

    // ──────────────────────────────────────
    // 4. Create faculty rankings (faculty → groups)
    // ──────────────────────────────────────
    head('CREATING FACULTY RANKINGS (faculty → group)');

    // Each faculty ranks groups that chose them
    // For simplicity, each faculty ranks ALL groups (since all groups listed all faculty)
    const facultyRankOrders = [
        // FAC001 (Dr. Rahul Sharma): Alpha, Beta, Delta, Gamma
        [0, 1, 3, 2],
        // FAC002 (Dr. Priya Patel): Gamma, Alpha, Beta, Delta
        [2, 0, 1, 3],
        // FAC003 (Prof. Amit Verma): Delta, Beta, Alpha, Gamma
        [3, 1, 0, 2],
        // FAC004 (Dr. Sneha Gupta): Alpha, Gamma, Delta, Beta
        [0, 2, 3, 1],
        // FAC005 (Mr. Vikram Singh): Beta, Delta, Gamma, Alpha
        [1, 3, 2, 0],
    ];

    for (let fi = 0; fi < faculties.length; fi++) {
        const faculty = faculties[fi];
        const rankOrder = facultyRankOrders[fi];

        const rankedGroups = rankOrder.map((gi, rank) => ({
            group: groups[gi]._id,
            rank: rank + 1
        }));

        await FacultyRanking.create({
            faculty: faculty._id,
            semester: SEMESTER,
            academicYear: ACADEMIC_YEAR,
            rankedGroups,
            isAutoGenerated: false,
            submittedAt: new Date()
        });

        // Mark faculty as having submitted rankings
        faculty.hasSubmittedRankings = true;
        await faculty.save();

        const rankNames = rankOrder.map((gi, r) => `${r + 1}.${groups[gi].name}`);
        ok(`${faculty.fullName} ranks: ${rankNames.join(' → ')}`);
    }

    // ──────────────────────────────────────
    // 5. Summary
    // ──────────────────────────────────────
    head('SETUP COMPLETE — SUMMARY');
    console.log(`
  ┌──────────────────────────────────────────────────┐
  │  Item                │  Count                    │
  ├──────────────────────┼───────────────────────────┤
  │  Groups (finalized)  │  ${groups.length}                        │
  │  Projects (minor2)   │  ${projects.length}                        │
  │  Faculty Prefs       │  ${facPrefDocs.length} (one per group)        │
  │  Faculty Rankings    │  ${faculties.length} (one per faculty)       │
  ├──────────────────────┼───────────────────────────┤
  │  READY FOR           │  Faculty Allocation       │
  │                      │  (Admin triggers via UI)  │
  └──────────────────────┴───────────────────────────┘

  Next steps:
  1. Log in as admin (admin@iiitp.ac.in / password123)
  2. Navigate to Faculty Allocation
  3. Run the Gale-Shapley allocation algorithm
  4. Verify results
  `);

    await mongoose.connection.close();
    ok('Done!');
    process.exit(0);
}

main().catch(err => {
    fail(`Script failed: ${err.message}`);
    console.error(err);
    process.exit(1);
});
