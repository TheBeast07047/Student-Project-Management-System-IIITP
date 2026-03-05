/**
 * seedNewDatabase.js
 * 
 * Creates a completely fresh database with:
 *   - 1 Admin
 *   - 5 Faculty members
 *   - 20 Students (Sem 5, B.Tech CSE)
 *   - SystemConfig defaults for Sem 5 allocation
 * 
 * Usage: node scripts/seedNewDatabase.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const Group = require('../models/Group');
const Project = require('../models/Project');
const FacultyPreference = require('../models/FacultyPreference');
const FacultyRanking = require('../models/FacultyRanking');
const AllocationRun = require('../models/AllocationRun');
const SystemConfig = require('../models/SystemConfig');
const FacultyNotification = require('../models/FacultyNotification');

// ======================================
// Configuration
// ======================================
const COMMON_PASSWORD = 'password123';
const ACADEMIC_YEAR = '2025-26';
const SEMESTER = 5;

// ======================================
// Console helpers
// ======================================
const c = {
    reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
    yellow: '\x1b[33m', cyan: '\x1b[36m', bright: '\x1b[1m'
};
const ok = msg => console.log(`${c.green}✅ ${msg}${c.reset}`);
const fail = msg => console.log(`${c.red}❌ ${msg}${c.reset}`);
const info = msg => console.log(`${c.cyan}ℹ️  ${msg}${c.reset}`);
const warn = msg => console.log(`${c.yellow}⚠️  ${msg}${c.reset}`);
const head = msg => console.log(`\n${c.bright}${c.cyan}${'═'.repeat(60)}\n  ${msg}\n${'═'.repeat(60)}${c.reset}`);

// ======================================
// Main seed function
// ======================================
async function seed() {
    head('SEEDING NEW DATABASE');

    // 1. Connect
    const uri = process.env.MONGODB_URI;
    if (!uri) { fail('MONGODB_URI not set in .env'); process.exit(1); }
    info(`Connecting to MongoDB...`);
    await mongoose.connect(uri);
    ok('Connected to MongoDB');

    // 2. Drop all relevant collections
    info('Dropping existing collections...');
    const collections = [
        'users', 'admins', 'faculties', 'students',
        'groups', 'projects', 'facultypreferences',
        'facultyrankings', 'allocationruns', 'systemconfigs',
        'facultynotifications', 'signupotps', 'messages'
    ];
    for (const col of collections) {
        try { await mongoose.connection.db.dropCollection(col); } catch (_) { /* may not exist */ }
    }
    ok('All collections dropped');

    // ──────────────────────────────────────
    // 3. Create Admin
    // ──────────────────────────────────────
    head('CREATING ADMIN');
    const adminUser = await User.create({
        email: 'admin@iiitp.ac.in',
        password: COMMON_PASSWORD,
        role: 'admin'
    });
    const admin = await Admin.create({
        user: adminUser._id,
        fullName: 'Dr. Admin Kumar',
        phone: '9876543210',
        adminId: 'ADMIN001',
        department: 'CSE',
        designation: 'Super Admin',
        isSuperAdmin: true
    });
    ok(`Admin: admin@iiitp.ac.in / ${COMMON_PASSWORD}  (ID: ${admin.adminId})`);

    // ──────────────────────────────────────
    // 4. Create Faculty (5 members)
    // ──────────────────────────────────────
    head('CREATING FACULTY (5)');
    const facultyData = [
        { name: 'Dr. Rahul Sharma', email: 'rahul.sharma@iiitp.ac.in', phone: '9876543211', id: 'FAC001', dept: 'CSE', designn: 'Assistant Professor', prefix: 'Dr', mode: 'Regular' },
        { name: 'Dr. Priya Patel', email: 'priya.patel@iiitp.ac.in', phone: '9876543212', id: 'FAC002', dept: 'CSE', designn: 'Assistant Professor', prefix: 'Dr', mode: 'Regular' },
        { name: 'Prof. Amit Verma', email: 'amit.verma@iiitp.ac.in', phone: '9876543213', id: 'FAC003', dept: 'CSE', designn: 'HOD', prefix: 'Prof', mode: 'Regular' },
        { name: 'Dr. Sneha Gupta', email: 'sneha.gupta@iiitp.ac.in', phone: '9876543214', id: 'FAC004', dept: 'CSE', designn: 'Assistant Professor', prefix: 'Dr', mode: 'Adjunct' },
        { name: 'Mr. Vikram Singh', email: 'vikram.singh@iiitp.ac.in', phone: '9876543215', id: 'FAC005', dept: 'CSE', designn: 'Assistant Professor', prefix: 'Mr', mode: 'Regular' },
    ];

    const facultyDocs = [];
    for (const f of facultyData) {
        const fUser = await User.create({ email: f.email, password: COMMON_PASSWORD, role: 'faculty' });
        const fDoc = await Faculty.create({
            user: fUser._id,
            prefix: f.prefix,
            fullName: f.name,
            email: f.email,
            phone: f.phone,
            facultyId: f.id,
            department: f.dept,
            mode: f.mode,
            designation: f.designn,
            mentorCapacity: 4
        });
        facultyDocs.push(fDoc);
        ok(`Faculty: ${f.email} / ${COMMON_PASSWORD}  (${f.id} - ${f.name})`);
    }

    // ──────────────────────────────────────
    // 5. Create Students (20, Sem 5 B.Tech CSE)
    // ──────────────────────────────────────
    head('CREATING STUDENTS (20)');
    const studentNames = [
        'Aarav Mehta', 'Ananya Singh', 'Arjun Reddy', 'Diya Kapoor',
        'Ishaan Joshi', 'Kavya Nair', 'Lakshya Tiwari', 'Meera Iyer',
        'Nikhil Deshmukh', 'Pooja Agarwal', 'Rohan Malhotra', 'Sakshi Bhatt',
        'Tanish Kumar', 'Urvi Chauhan', 'Varun Saxena', 'Wriddhiman Roy',
        'Yash Pandey', 'Zara Sheikh', 'Aditya Banerjee', 'Bhavna Patil'
    ];

    const studentDocs = [];
    for (let i = 0; i < studentNames.length; i++) {
        const idx = (i + 1).toString().padStart(2, '0');
        const email = `student${idx}@iiitp.ac.in`;
        const mis = `202300${idx.padStart(3, '0')}`;        // 9 digits: 202300001 .. 202300020

        const sUser = await User.create({ email, password: COMMON_PASSWORD, role: 'student' });
        const student = await Student.create({
            user: sUser._id,
            fullName: studentNames[i],
            degree: 'B.Tech',
            semester: SEMESTER,
            misNumber: mis,
            collegeEmail: email,
            contactNumber: `98765${(43200 + i).toString()}`,
            branch: 'CSE',
            academicYear: ACADEMIC_YEAR
        });
        studentDocs.push(student);
        ok(`Student ${idx}: ${email}  (MIS: ${mis} - ${studentNames[i]})`);
    }

    // ──────────────────────────────────────
    // 6. Initialize SystemConfig defaults
    // ──────────────────────────────────────
    head('INITIALIZING SYSTEMCONFIG');
    const configCount = await SystemConfig.initializeDefaults();
    ok(`Initialized ${configCount} default system config entries`);

    // Set allocation windows to be currently open (for testing)
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await SystemConfig.setConfigValue(
        'sem5.allocation.groupPreferenceWindow',
        { start: now.toISOString(), end: future.toISOString() },
        'object', 'Window for groups to submit faculty preference rankings', 'sem5'
    );
    await SystemConfig.setConfigValue(
        'sem5.allocation.facultyRankingWindow',
        { start: now.toISOString(), end: future.toISOString() },
        'object', 'Window for faculty to submit group rankings', 'sem5'
    );
    ok('Allocation windows set to OPEN (now → +30 days)');

    // ──────────────────────────────────────
    // 7. Print summary
    // ──────────────────────────────────────
    head('SEED COMPLETE — SUMMARY');
    console.log(`
  ┌─────────────────────────────────────────────────┐
  │  Role       │  Count  │  Login credentials      │
  ├─────────────┼─────────┼─────────────────────────┤
  │  Admin      │  1      │  admin@iiitp.ac.in      │
  │  Faculty    │  5      │  rahul.sharma@...        │
  │             │         │  priya.patel@...         │
  │             │         │  amit.verma@...          │
  │             │         │  sneha.gupta@...         │
  │             │         │  vikram.singh@...        │
  │  Students   │  20     │  student01@iiitp.ac.in   │
  │             │         │  ...                     │
  │             │         │  student20@iiitp.ac.in   │
  ├─────────────┼─────────┼─────────────────────────┤
  │  Password   │  ALL    │  ${COMMON_PASSWORD}             │
  │  Semester   │  ${SEMESTER}      │  Academic Year: ${ACADEMIC_YEAR}  │
  └─────────────┴─────────┴─────────────────────────┘
  `);

    await mongoose.connection.close();
    ok('Database connection closed');
    process.exit(0);
}

seed().catch(err => {
    fail(`Seed failed: ${err.message}`);
    console.error(err);
    process.exit(1);
});
