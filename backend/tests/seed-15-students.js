/**
 * Seed 15 test student accounts.
 * Run: node tests/seed-15-students.js
 * 
 * This script adds 15 new User + Student documents to the database
 * without touching existing data.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const students = [
    { fullName: 'Aarav Sharma', misNumber: '202300101', email: 'aarav.sharma@iiitp.ac.in', phone: '9876543201', branch: 'CSE' },
    { fullName: 'Diya Patel', misNumber: '202300102', email: 'diya.patel@iiitp.ac.in', phone: '9876543202', branch: 'CSE' },
    { fullName: 'Vihaan Gupta', misNumber: '202300103', email: 'vihaan.gupta@iiitp.ac.in', phone: '9876543203', branch: 'CSE' },
    { fullName: 'Ananya Singh', misNumber: '202300104', email: 'ananya.singh@iiitp.ac.in', phone: '9876543204', branch: 'ECE' },
    { fullName: 'Arjun Reddy', misNumber: '202300105', email: 'arjun.reddy@iiitp.ac.in', phone: '9876543205', branch: 'CSE' },
    { fullName: 'Ishaan Verma', misNumber: '202300106', email: 'ishaan.verma@iiitp.ac.in', phone: '9876543206', branch: 'CSE' },
    { fullName: 'Kavya Nair', misNumber: '202300107', email: 'kavya.nair@iiitp.ac.in', phone: '9876543207', branch: 'ECE' },
    { fullName: 'Rohan Joshi', misNumber: '202300108', email: 'rohan.joshi@iiitp.ac.in', phone: '9876543208', branch: 'CSE' },
    { fullName: 'Priya Mehta', misNumber: '202300109', email: 'priya.mehta@iiitp.ac.in', phone: '9876543209', branch: 'CSE' },
    { fullName: 'Aditya Kumar', misNumber: '202300110', email: 'aditya.kumar@iiitp.ac.in', phone: '9876543210', branch: 'ECE' },
    { fullName: 'Sneha Iyer', misNumber: '202300111', email: 'sneha.iyer@iiitp.ac.in', phone: '9876543211', branch: 'CSE' },
    { fullName: 'Tanmay Deshmukh', misNumber: '202300112', email: 'tanmay.deshmukh@iiitp.ac.in', phone: '9876543212', branch: 'CSE' },
    { fullName: 'Meera Krishnan', misNumber: '202300113', email: 'meera.krishnan@iiitp.ac.in', phone: '9876543213', branch: 'ECE' },
    { fullName: 'Nikhil Saxena', misNumber: '202300114', email: 'nikhil.saxena@iiitp.ac.in', phone: '9876543214', branch: 'CSE' },
    { fullName: 'Riya Bhatia', misNumber: '202300115', email: 'riya.bhatia@iiitp.ac.in', phone: '9876543215', branch: 'CSE' },
];

const PASSWORD = 'Test@1234';

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        let created = 0;
        let skipped = 0;

        for (const s of students) {
            // Check if user already exists
            const existingUser = await User.findOne({ email: s.email });
            if (existingUser) {
                console.log(`  ⏭️  Skipped ${s.email} (already exists)`);
                skipped++;
                continue;
            }

            // Check if student with same misNumber exists
            const existingStudent = await Student.findOne({ misNumber: s.misNumber });
            if (existingStudent) {
                console.log(`  ⏭️  Skipped MIS ${s.misNumber} (already exists)`);
                skipped++;
                continue;
            }

            // Create User (password is auto-hashed by pre-save middleware)
            const user = new User({
                email: s.email,
                password: PASSWORD,
                role: 'student',
                isActive: true
            });
            await user.save();

            // Create Student
            const student = new Student({
                user: user._id,
                fullName: s.fullName,
                degree: 'B.Tech',
                semester: 5,
                misNumber: s.misNumber,
                collegeEmail: s.email,
                contactNumber: s.phone,
                branch: s.branch,
                academicYear: '2025-26'
            });
            await student.save();

            console.log(`  ✅ Created: ${s.fullName} (${s.email})`);
            created++;
        }

        console.log(`\n${'='.repeat(55)}`);
        console.log(`Done! Created: ${created} | Skipped: ${skipped}`);
        console.log(`${'='.repeat(55)}`);
        console.log('\n📋 Credentials for all 15 students:\n');
        console.log('┌─────┬─────────────────────────────────────┬──────────────┐');
        console.log('│  #  │ Email                               │ Password     │');
        console.log('├─────┼─────────────────────────────────────┼──────────────┤');
        students.forEach((s, i) => {
            const num = String(i + 1).padStart(3);
            const email = s.email.padEnd(35);
            console.log(`│ ${num} │ ${email} │ ${PASSWORD}   │`);
        });
        console.log('└─────┴─────────────────────────────────────┴──────────────┘');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

seed();
