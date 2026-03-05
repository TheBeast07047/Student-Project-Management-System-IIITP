/**
 * Diagnostic: Test what getSem5Dashboard returns for Aarav Sharma.
 * Run: node tests/diagnose-group-status.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Group = require('../models/Group');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function diagnose() {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    // 1. Find Aarav's Student record
    const student = await Student.findOne({ misNumber: '202300101' }).populate('user');
    if (!student) { console.log('❌ Student not found'); return; }

    console.log('📋 Student:', student.fullName);
    console.log('   Semester:', student.semester);
    console.log('   User ID:', student.user._id);
    console.log('   Student ID:', student._id);
    console.log('   GroupId field:', student.groupId);
    console.log('   GroupMemberships:', student.groupMemberships.length);
    student.groupMemberships.forEach((gm, i) => {
        console.log(`     [${i}] group=${gm.group}, role=${gm.role}, semester=${gm.semester}, active=${gm.isActive}`);
    });

    // 2. Find the group using the same query as getSem5Dashboard
    const group = await Group.findOne({
        semester: 5,
        isActive: true,
        members: {
            $elemMatch: {
                student: student._id,
                isActive: true
            }
        }
    });

    if (group) {
        console.log('\n✅ Group found by getSem5Dashboard query:');
        console.log('   Name:', group.name);
        console.log('   Status:', group.status);
        console.log('   Members:', group.members.length);
        group.members.forEach((m, i) => {
            console.log(`     [${i}] student=${m.student}, role=${m.role}, active=${m.isActive}, invite=${m.inviteStatus}`);
        });
    } else {
        console.log('\n❌ No group found by getSem5Dashboard query!');

        // Debug: List all groups for semester 5
        const allGroups = await Group.find({ semester: 5 });
        console.log(`\n🔍 All semester 5 groups in DB: ${allGroups.length}`);
        for (const g of allGroups) {
            console.log(`   "${g.name}" (status=${g.status}, active=${g.isActive})`);
            const hasStudent = g.members.some(m => m.student.toString() === student._id.toString());
            console.log(`   Has Aarav? ${hasStudent}`);
            if (hasStudent) {
                const m = g.members.find(m => m.student.toString() === student._id.toString());
                console.log(`   Member isActive: ${m.isActive}, inviteStatus: ${m.inviteStatus}`);
            }
        }
    }

    // 3. Check what the User model's role is (should be 'student')
    console.log('\n📋 User role:', student.user.role);
    console.log('   User email:', student.user.email);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
}

diagnose().catch(e => { console.error(e); process.exit(1); });
