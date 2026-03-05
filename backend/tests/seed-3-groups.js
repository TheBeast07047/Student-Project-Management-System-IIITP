/**
 * Seed 3 finalized groups of 5 students each from the 15 seeded students.
 * Run: node tests/seed-3-groups.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Group = require('../models/Group');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Group definitions: first student in each array is the leader
const GROUP_DEFS = [
    {
        name: 'Team Alpha',
        description: 'Cross-domain research group focused on AI applications',
        members: ['202300101', '202300102', '202300103', '202300104', '202300105']
        // Leader: Aarav Sharma (202300101)
    },
    {
        name: 'Team Beta',
        description: 'Systems engineering group working on distributed computing',
        members: ['202300106', '202300107', '202300108', '202300109', '202300110']
        // Leader: Ishaan Verma (202300106)
    },
    {
        name: 'Team Gamma',
        description: 'Full-stack development group building scalable web platforms',
        members: ['202300111', '202300112', '202300113', '202300114', '202300115']
        // Leader: Sneha Iyer (202300111)
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        for (const def of GROUP_DEFS) {
            // Resolve students by MIS number
            const students = [];
            for (const mis of def.members) {
                const s = await Student.findOne({ misNumber: mis });
                if (!s) {
                    console.error(`  ❌ Student ${mis} not found — skipping group "${def.name}"`);
                    break;
                }
                students.push(s);
            }
            if (students.length !== def.members.length) continue;

            const leader = students[0];

            // Check if a group with this name already exists for sem 5
            const existing = await Group.findOne({ name: def.name, semester: 5, academicYear: '2025-26' });
            if (existing) {
                console.log(`  ⏭️  Skipped "${def.name}" (already exists)`);
                continue;
            }

            // Build members array
            const membersArr = students.map((s, idx) => ({
                student: s._id,
                role: idx === 0 ? 'leader' : 'member',
                joinedAt: new Date(),
                isActive: true,
                inviteStatus: 'accepted'
            }));

            // Create group
            const group = new Group({
                name: def.name,
                description: def.description,
                members: membersArr,
                leader: leader._id,
                createdBy: leader._id,
                semester: 5,
                academicYear: '2025-26',
                maxMembers: 5,
                minMembers: 4,
                status: 'finalized',
                isActive: true,
                finalizedAt: new Date(),
                finalizedBy: leader._id
            });

            await group.save();

            // Update each student's groupId and groupMemberships
            for (let i = 0; i < students.length; i++) {
                const s = students[i];
                s.groupId = group._id;

                // Add group membership if not already present
                const alreadyMember = s.groupMemberships.find(
                    gm => gm.group.toString() === group._id.toString() && gm.isActive
                );
                if (!alreadyMember) {
                    s.groupMemberships.push({
                        group: group._id,
                        role: i === 0 ? 'leader' : 'member',
                        semester: 5,
                        isActive: true,
                        joinedAt: new Date()
                    });
                }

                await s.save();
            }

            console.log(`  ✅ Created "${def.name}" — Leader: ${leader.fullName} (${leader.misNumber})`);
            console.log(`     Members: ${students.map(s => s.fullName).join(', ')}`);
        }

        console.log('\n' + '='.repeat(55));
        console.log('Group Leader Login Details:\n');
        console.log('┌─────────────────┬──────────────────────────────────┬──────────────┐');
        console.log('│ Group           │ Leader Email                     │ Password     │');
        console.log('├─────────────────┼──────────────────────────────────┼──────────────┤');

        const leaders = [
            { group: 'Team Alpha', email: 'aarav.sharma@iiitp.ac.in' },
            { group: 'Team Beta', email: 'ishaan.verma@iiitp.ac.in' },
            { group: 'Team Gamma', email: 'sneha.iyer@iiitp.ac.in' },
        ];

        for (const l of leaders) {
            const g = l.group.padEnd(15);
            const e = l.email.padEnd(32);
            console.log(`│ ${g} │ ${e} │ Test@1234    │`);
        }

        console.log('└─────────────────┴──────────────────────────────────┴──────────────┘');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.errors) {
            for (const [key, val] of Object.entries(error.errors)) {
                console.error(`   ${key}: ${val.message}`);
            }
        }
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

seed();
