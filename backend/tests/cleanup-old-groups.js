/**
 * Cleanup: Remove old/stale groups for the 15 seeded students so only 
 * the finalized Team Alpha/Beta/Gamma remain.
 * 
 * Run: node tests/cleanup-old-groups.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Group = require('../models/Group');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const KEEP_GROUPS = ['Team Alpha', 'Team Beta', 'Team Gamma'];
const MIS_NUMBERS = [
    '202300101', '202300102', '202300103', '202300104', '202300105',
    '202300106', '202300107', '202300108', '202300109', '202300110',
    '202300111', '202300112', '202300113', '202300114', '202300115',
];

async function cleanup() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // Get all student IDs
    const students = await Student.find({ misNumber: { $in: MIS_NUMBERS } });
    const studentIds = students.map(s => s._id);

    // Find ALL groups where any of these students are members
    const allGroups = await Group.find({
        semester: 5,
        'members.student': { $in: studentIds }
    });

    console.log(`Found ${allGroups.length} groups involving our 15 students:\n`);

    for (const g of allGroups) {
        const shouldKeep = KEEP_GROUPS.includes(g.name);
        console.log(`  ${shouldKeep ? '✅ KEEP' : '❌ REMOVE'}: "${g.name}" (status=${g.status}, members=${g.members.length}, active=${g.isActive})`);

        if (!shouldKeep) {
            // Deactivate the old group
            g.isActive = false;
            g.status = 'disbanded';
            await g.save();
            console.log(`     → Deactivated (isActive=false, status=disbanded)`);
        }
    }

    // Now clean up each student's groupMemberships to only keep Team Alpha/Beta/Gamma
    const keepGroupIds = allGroups.filter(g => KEEP_GROUPS.includes(g.name)).map(g => g._id.toString());

    for (const student of students) {
        const oldCount = student.groupMemberships.length;

        // Remove memberships to disbanded groups
        student.groupMemberships = student.groupMemberships.filter(gm =>
            keepGroupIds.includes(gm.group.toString())
        );

        // Make sure groupId points to the correct group
        const activeMembership = student.groupMemberships.find(gm => gm.isActive && gm.semester === 5);
        student.groupId = activeMembership ? activeMembership.group : null;

        const newCount = student.groupMemberships.length;

        if (oldCount !== newCount) {
            await student.save();
            console.log(`\n  🧹 ${student.fullName}: ${oldCount} → ${newCount} memberships, groupId=${student.groupId}`);
        }
    }

    // Verify final state
    console.log('\n\n📋 Final verification:');
    for (const student of students) {
        const freshStudent = await Student.findById(student._id);
        const group = await Group.findOne({
            semester: 5,
            isActive: true,
            members: { $elemMatch: { student: freshStudent._id, isActive: true } }
        });
        console.log(`  ${freshStudent.fullName}: groupId=${freshStudent.groupId}, dashboard query → ${group ? `"${group.name}" (${group.status})` : 'null ❌'}`);
    }

    await mongoose.disconnect();
    console.log('\n🔌 Done');
}

cleanup().catch(e => { console.error(e); process.exit(1); });
