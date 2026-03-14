require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const Group = require('../models/Group');
const Project = require('../models/Project');
const FacultyPreference = require('../models/FacultyPreference');
const bcrypt = require('bcryptjs');

// Configuration
const TEST_CONFIG = {
    NUM_STUDENTS_TO_CREATE: 60, // Total number of students to create
    GROUP_SIZE: 5,              // Students per group
    NUM_FACULTY_TO_PREFER: 5,   // How many faculty members each group will prefer
    SEMESTER: 5,
    BRANCH: 'CSE',
    ACADEMIC_YEAR: '2024-25',
    DEFAULT_PASSWORD: 'password123'
};

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spms');
        console.log('MongoDB Connected');
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
}

async function cleanStudentsAndGroups() {
    console.log('\n--- Cleaning Up Old Data ---');
    // 1. Find all students
    const students = await Student.find();
    const studentUserIds = students.map(s => s.user);

    // 2. Delete Student Users
    const userDeleteResult = await User.deleteMany({ _id: { $in: studentUserIds } });
    console.log(`Deleted ${userDeleteResult.deletedCount} Student Users.`);

    // 3. Delete Students
    const studentDeleteResult = await Student.deleteMany({});
    console.log(`Deleted ${studentDeleteResult.deletedCount} Students.`);

    // 4. Delete Groups
    const groupDeleteResult = await Group.deleteMany({});
    console.log(`Deleted ${groupDeleteResult.deletedCount} Groups.`);

    // 5. Delete Projects belonging to Sem 5
    const projectDeleteResult = await Project.deleteMany({ expectedSemester: TEST_CONFIG.SEMESTER });
    console.log(`Deleted ${projectDeleteResult.deletedCount} Projects.`);

    // 6. Delete all Faculty Preferences for Sem 5
    const prefsDeleteResult = await FacultyPreference.deleteMany({ semester: TEST_CONFIG.SEMESTER });
    console.log(`Deleted ${prefsDeleteResult.deletedCount} Faculty Preferences.`);
}

async function createStudents(numStudents) {
    console.log(`\n--- Creating ${numStudents} Students ---`);
    const newStudents = [];
    const hashedPassword = await bcrypt.hash(TEST_CONFIG.DEFAULT_PASSWORD, 10);

    for (let i = 1; i <= numStudents; i++) {
        const paddedIndex = String(i).padStart(3, '0');
        const misNumber = `111119${paddedIndex}`;
        const email = `test.student${i}@test.com`;

        try {
            // 1. Create User
            const user = new User({
                email: email,
                password: hashedPassword, // Hash matches pre-save bypass or we can let model hash it
                role: 'student'
            });
            // Important to bypass pre-save hook re-hashing if not modified. We'll set it properly.
            user.password = TEST_CONFIG.DEFAULT_PASSWORD; // To let model rehash it
            await user.save();

            // 2. Create Student Profile
            const student = new Student({
                user: user._id,
                fullName: `Test Student ${i}`,
                degree: 'B.Tech',
                semester: TEST_CONFIG.SEMESTER,
                misNumber: misNumber,
                collegeEmail: email,
                contactNumber: `9876543${paddedIndex}`, // 10 digits
                branch: TEST_CONFIG.BRANCH,
                academicYear: TEST_CONFIG.ACADEMIC_YEAR,
                semesterStatus: {
                    canFormGroups: true,
                    canJoinProjects: true,
                    canApplyInternships: false
                }
            });
            await student.save();
            newStudents.push(student);
        } catch (err) {
            console.error(`Failed to create student ${i}:`, err.message);
        }
    }

    console.log(`Successfully created ${newStudents.length} students.`);
    return newStudents;
}

async function formGroupsAndAddPreferences(students) {
    console.log('\n--- Forming Groups & Submitting Preferences ---');

    // Ensure we have active faculty
    const facultyList = await Faculty.find().limit(TEST_CONFIG.NUM_FACULTY_TO_PREFER);
    if (facultyList.length < TEST_CONFIG.NUM_FACULTY_TO_PREFER) {
        console.error(`Not enough faculty members in DB! Found ${facultyList.length}, need ${TEST_CONFIG.NUM_FACULTY_TO_PREFER}`);
        return;
    }

    const numGroups = Math.floor(students.length / TEST_CONFIG.GROUP_SIZE);
    console.log(`Will form ${numGroups} groups.`);

    let studentIndex = 0;
    for (let i = 1; i <= numGroups; i++) {
        const groupMembers = [];
        const leader = students[studentIndex++];

        groupMembers.push({
            student: leader._id,
            role: 'leader',
            isActive: true,
            joinedAt: new Date(),
            inviteStatus: 'accepted'
        });

        for (let j = 1; j < TEST_CONFIG.GROUP_SIZE; j++) {
            const member = students[studentIndex++];
            groupMembers.push({
                student: member._id,
                role: 'member',
                isActive: true,
                joinedAt: new Date(),
                inviteStatus: 'accepted'
            });
        }

        // 1. Create Group
        const group = new Group({
            name: `Test Limits Group ${i}`,
            description: 'Auto-generated for faculty limit testing',
            maxMembers: 5,
            minMembers: 4,
            semester: TEST_CONFIG.SEMESTER,
            academicYear: TEST_CONFIG.ACADEMIC_YEAR,
            createdBy: leader._id,
            leader: leader._id,
            status: 'finalized', // Ready to submit preferences
            members: groupMembers
        });
        group.finalizedAt = new Date();
        group.finalizedBy = leader._id;
        await group.save();

        // 2. Create Project Proposal
        const project = new Project({
            title: `Auto Test Project for Group ${i}`,
            description: 'Auto-generated test project',
            projectType: 'minor2',
            domains: ['Software Engineering'],
            technologies: ['Node.js'],
            student: leader._id,
            status: 'registered',
            semester: TEST_CONFIG.SEMESTER,
            expectedSemester: TEST_CONFIG.SEMESTER,
            academicYear: TEST_CONFIG.ACADEMIC_YEAR,
            group: group._id,
            facultyPreferences: facultyList.map((f, idx) => ({
                faculty: f._id,
                priority: idx + 1,
                status: 'pending'
            }))
        });
        await project.save();

        // 3. Update Group with Project ID
        group.project = project._id;
        await group.save();

        // 4. Update Students' active states
        for (const gm of groupMembers) {
            const student = await Student.findById(gm.student);

            // Update memberships
            student.groupId = group._id;
            student.groupMemberships = [{
                group: group._id,
                role: gm.role,
                semester: TEST_CONFIG.SEMESTER,
                isActive: true
            }];

            // Update current projects
            student.currentProjects = [{
                project: project._id,
                role: gm.role,
                semester: TEST_CONFIG.SEMESTER,
                status: 'active'
            }];
            await student.save();
        }

        // 5. Create Faculty Preference object representing the submission
        const preferenceObj = new FacultyPreference({
            student: leader._id, // Tied to leader usually
            project: project._id,
            group: group._id,
            semester: TEST_CONFIG.SEMESTER,
            academicYear: TEST_CONFIG.ACADEMIC_YEAR,
            status: 'pending',
            preferences: facultyList.map((f, idx) => ({
                faculty: f._id,
                priority: idx + 1
            }))
        });
        await preferenceObj.save();

        console.log(`Created Group ${i} with Project and ${TEST_CONFIG.NUM_FACULTY_TO_PREFER} pending Preferences.`);
    }
}


async function runSeed() {
    await connectDB();
    try {
        const adminCount = await User.countDocuments({ role: 'admin' });
        const facultyCount = await User.countDocuments({ role: 'faculty' });

        console.log(`Current State: ${adminCount} Admins, ${facultyCount} Faculty Members.`);
        console.log('Admins and Faculty will NOT be deleted.');

        await cleanStudentsAndGroups();

        const newStudents = await createStudents(TEST_CONFIG.NUM_STUDENTS_TO_CREATE);

        // Make sure we have enough students to form grouped correctly (e.g. divisible by 5)
        await formGroupsAndAddPreferences(newStudents);

        console.log('\n✅ Script Complete! Database is ready for limit testing.');
    } catch (error) {
        console.error('Script Failed:', error);
    } finally {
        mongoose.connection.close();
    }
}

runSeed();
