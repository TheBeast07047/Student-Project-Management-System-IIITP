/**
 * Ensure all 3 seeded groups have:
 *  - Every member's inviteStatus = 'accepted'
 *  - Group status = 'finalized'
 *  - Every student's groupId and groupMemberships properly set
 *
 * Run: node tests/finalize-groups.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Group = require('../models/Group');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const GROUP_NAMES = ['Team Alpha', 'Team Beta', 'Team Gamma'];

async function finalize() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        for (const name of GROUP_NAMES) {
            const group = await Group.findOne({ name, semester: 5, academicYear: '2025-26' });
            if (!group) {
                console.log(`  ❌ Group "${name}" not found`);
                continue;
            }

            let changed = false;

            // 1. Ensure all members have inviteStatus = 'accepted' and isActive = true
            for (const member of group.members) {
                if (member.inviteStatus !== 'accepted') {
                    member.inviteStatus = 'accepted';
                    changed = true;
                }
                if (!member.isActive) {
                    member.isActive = true;
                    changed = true;
                }
            }

            // 2. Ensure group status is finalized
            if (group.status !== 'finalized') {
                group.status = 'finalized';
                group.finalizedAt = new Date();
                group.finalizedBy = group.leader;
                changed = true;
            }

            if (changed) {
                await group.save();
            }

            // 3. Ensure each student document is linked back to this group
            for (const member of group.members) {
                const student = await Student.findById(member.student);
                if (!student) {
                    console.log(`    ⚠️  Student ${member.student} not found in DB`);
                    continue;
                }

                let studentChanged = false;

                // Set groupId
                if (!student.groupId || student.groupId.toString() !== group._id.toString()) {
                    student.groupId = group._id;
                    studentChanged = true;
                }

                // Ensure groupMemberships entry exists
                const hasMembership = student.groupMemberships.find(
                    gm => gm.group.toString() === group._id.toString() && gm.isActive
                );
                if (!hasMembership) {
                    student.groupMemberships.push({
                        group: group._id,
                        role: member.role,
                        semester: 5,
                        isActive: true,
                        joinedAt: new Date()
                    });
                    studentChanged = true;
                }

                // Ensure semesterStatus.canFormGroups is updated
                if (!student.semesterStatus) {
                    student.semesterStatus = {};
                    studentChanged = true;
                }

                if (studentChanged) {
                    await student.save();
                }
            }

            const memberNames = [];
            for (const m of group.members) {
                const s = await Student.findById(m.student);
                memberNames.push(`${s ? s.fullName : '?'} (${m.role}, ${m.inviteStatus})`);
            }

            console.log(`  ✅ "${name}" — Status: ${group.status}`);
            console.log(`     ${memberNames.join(', ')}`);
        }

        console.log('\n✅ All groups finalized with all invites accepted!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

finalize();
