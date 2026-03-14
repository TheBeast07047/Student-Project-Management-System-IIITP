const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Group = require('../models/Group');
const Faculty = require('../models/Faculty');
const Project = require('../models/Project');
const FacultyPreference = require('../models/FacultyPreference');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const CONFIG = {
    GROUP_SIZE: 4,
    SEMESTER: 5,
    ACADEMIC_YEAR: '2024-25',
    BRANCH: 'CSE',
    DEFAULT_PASSWORD: 'password123'
};

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    // === STEP 1: Check current state ===
    const totalStudents = await Student.countDocuments({ semester: CONFIG.SEMESTER });
    const studentsInGroup = await Student.countDocuments({ semester: CONFIG.SEMESTER, groupId: { $ne: null } });
    const studentsNotInGroup = totalStudents - studentsInGroup;
    const existingGroups = await Group.countDocuments({ semester: CONFIG.SEMESTER });
    const allocatedGroups = await Group.countDocuments({ semester: CONFIG.SEMESTER, allocatedFaculty: { $ne: null } });
    const totalFaculty = await Faculty.countDocuments();

    console.log('=== Current State ===');
    console.log(`Students (sem ${CONFIG.SEMESTER}): ${totalStudents} (in group: ${studentsInGroup}, not in group: ${studentsNotInGroup})`);
    console.log(`Groups: ${existingGroups} (allocated: ${allocatedGroups}, unallocated: ${existingGroups - allocatedGroups})`);
    console.log(`Faculty: ${totalFaculty}`);

    // === STEP 2: Get students not in group ===
    const unGroupedStudents = await Student.find({
        semester: CONFIG.SEMESTER,
        $or: [{ groupId: null }, { groupId: { $exists: false } }]
    });

    console.log(`\n=== Forming Groups for ${unGroupedStudents.length} students ===`);

    if (unGroupedStudents.length === 0) {
        console.log('All students are already in groups! Proceeding to allocation...');
    }

    // Get all faculty for preferences
    const faculties = await Faculty.find();
    console.log(`Using ${faculties.length} faculty for preferences`);

    const numGroups = Math.floor(unGroupedStudents.length / CONFIG.GROUP_SIZE);
    const leftover = unGroupedStudents.length % CONFIG.GROUP_SIZE;
    console.log(`Will form ${numGroups} groups of ${CONFIG.GROUP_SIZE}` + (leftover > 0 ? ` (${leftover} students won't fit)` : ''));

    let studentIdx = 0;
    let groupsCreated = 0;

    for (let i = 0; i < numGroups; i++) {
        const leader = unGroupedStudents[studentIdx++];
        const members = [
            { student: leader._id, role: 'leader', isActive: true, joinedAt: new Date(), inviteStatus: 'accepted' }
        ];

        for (let j = 1; j < CONFIG.GROUP_SIZE; j++) {
            const member = unGroupedStudents[studentIdx++];
            members.push({
                student: member._id, role: 'member', isActive: true, joinedAt: new Date(), inviteStatus: 'accepted'
            });
        }

        // Create group
        const groupNum = existingGroups + i + 1;
        const group = new Group({
            name: `New Group ${groupNum}`,
            description: 'Auto-generated for allocation testing',
            maxMembers: 5,
            minMembers: 4,
            semester: CONFIG.SEMESTER,
            academicYear: CONFIG.ACADEMIC_YEAR,
            createdBy: leader._id,
            leader: leader._id,
            status: 'finalized',
            members: members,
            finalizedAt: new Date(),
            finalizedBy: leader._id
        });
        await group.save();

        // Create project
        const project = new Project({
            title: `Project for Group ${groupNum}`,
            description: 'Auto-generated test project',
            projectType: 'minor2',
            domains: ['Software Engineering'],
            technologies: ['Node.js', 'React'],
            student: leader._id,
            status: 'registered',
            semester: CONFIG.SEMESTER,
            expectedSemester: CONFIG.SEMESTER,
            academicYear: CONFIG.ACADEMIC_YEAR,
            group: group._id,
            facultyPreferences: faculties.slice(0, Math.min(5, faculties.length)).map((f, idx) => ({
                faculty: f._id,
                priority: idx + 1,
                status: 'pending'
            }))
        });
        await project.save();

        // Link project to group
        group.project = project._id;
        await group.save();

        // Update all students in the group
        for (const gm of members) {
            await Student.findByIdAndUpdate(gm.student, {
                groupId: group._id,
                groupMemberships: [{ group: group._id, role: gm.role, semester: CONFIG.SEMESTER, isActive: true }],
                currentProjects: [{ project: project._id, role: gm.role, semester: CONFIG.SEMESTER, status: 'active' }]
            });
        }

        // Create FacultyPreference document
        const prefObj = new FacultyPreference({
            student: leader._id,
            project: project._id,
            group: group._id,
            semester: CONFIG.SEMESTER,
            academicYear: CONFIG.ACADEMIC_YEAR,
            status: 'pending',
            preferences: faculties.slice(0, Math.min(5, faculties.length)).map((f, idx) => ({
                faculty: f._id,
                priority: idx + 1
            }))
        });
        await prefObj.save();

        groupsCreated++;
        console.log(`Created Group ${groupNum} with ${members.length} members and ${Math.min(5, faculties.length)} faculty preferences`);
    }

    console.log(`\n✅ Created ${groupsCreated} new groups`);

    // === STEP 3: Run allocation algorithm ===
    console.log('\n=== Running Faculty Allocation Algorithm ===');

    // Get all unallocated groups
    const unallocatedGroups = await Group.find({
        semester: CONFIG.SEMESTER,
        status: 'finalized',
        $or: [{ allocatedFaculty: null }, { allocatedFaculty: { $exists: false } }]
    }).populate('project');

    console.log(`Found ${unallocatedGroups.length} unallocated groups to process`);

    // Get faculty capacity limits
    const facultyLoad = {};
    faculties.forEach(f => { facultyLoad[f._id.toString()] = 0; });

    // Count existing allocations per faculty
    const existingAllocations = await Group.find({
        semester: CONFIG.SEMESTER,
        allocatedFaculty: { $ne: null }
    });
    existingAllocations.forEach(g => {
        const fId = g.allocatedFaculty.toString();
        if (facultyLoad[fId] !== undefined) facultyLoad[fId]++;
    });

    console.log('Current faculty load:');
    faculties.forEach(f => console.log(`  ${f.fullName}: ${facultyLoad[f._id.toString()] || 0} groups`));

    // Max groups per faculty (distribute evenly)
    const totalGroupsToAllocate = existingAllocations.length + unallocatedGroups.length;
    const maxPerFaculty = Math.ceil(totalGroupsToAllocate / faculties.length) + 1;
    console.log(`Max groups per faculty: ${maxPerFaculty}`);

    let allocated = 0;
    let failed = 0;

    for (const group of unallocatedGroups) {
        // Get faculty preferences for this group
        const prefDoc = await FacultyPreference.findOne({ group: group._id, semester: CONFIG.SEMESTER })
            .populate('preferences.faculty');

        if (!prefDoc || !prefDoc.preferences || prefDoc.preferences.length === 0) {
            // Also check project's facultyPreferences
            const project = await Project.findOne({ group: group._id, semester: CONFIG.SEMESTER });
            if (project && project.facultyPreferences && project.facultyPreferences.length > 0) {
                // Try to allocate based on project preferences
                let assignedFaculty = null;
                const sortedPrefs = [...project.facultyPreferences].sort((a, b) => a.priority - b.priority);

                for (const pref of sortedPrefs) {
                    const fId = pref.faculty.toString();
                    if (facultyLoad[fId] !== undefined && facultyLoad[fId] < maxPerFaculty) {
                        assignedFaculty = pref.faculty;
                        break;
                    }
                }

                if (assignedFaculty) {
                    group.allocatedFaculty = assignedFaculty;
                    group.allocationDate = new Date();
                    group.allocationMethod = 'algorithm';
                    await group.save();

                    // Update project status
                    await Project.findByIdAndUpdate(project._id, {
                        'facultyPreferences.$[elem].status': 'accepted',
                        faculty: assignedFaculty
                    }, { arrayFilters: [{ 'elem.faculty': assignedFaculty }] });

                    facultyLoad[assignedFaculty.toString()]++;
                    const facName = faculties.find(f => f._id.toString() === assignedFaculty.toString())?.fullName;
                    console.log(`  ✅ ${group.name} → ${facName}`);
                    allocated++;
                } else {
                    console.log(`  ❌ ${group.name}: All preferred faculty at capacity`);
                    failed++;
                }
                continue;
            }
            console.log(`  ❌ ${group.name}: No preferences found`);
            failed++;
            continue;
        }

        // Sort by priority and try to allocate
        const sortedPrefs = [...prefDoc.preferences].sort((a, b) => a.priority - b.priority);
        let assignedFaculty = null;

        for (const pref of sortedPrefs) {
            const fId = pref.faculty?._id?.toString() || pref.faculty?.toString();
            if (fId && facultyLoad[fId] !== undefined && facultyLoad[fId] < maxPerFaculty) {
                assignedFaculty = pref.faculty._id || pref.faculty;
                break;
            }
        }

        if (assignedFaculty) {
            group.allocatedFaculty = assignedFaculty;
            group.allocationDate = new Date();
            group.allocationMethod = 'algorithm';
            await group.save();

            // Update project
            if (group.project) {
                const projectId = group.project._id || group.project;
                await Project.findByIdAndUpdate(projectId, { faculty: assignedFaculty, status: 'faculty_allocated' });
            }

            // IMPORTANT: Update FacultyPreference status to allocated
            if (prefDoc) {
                prefDoc.allocatedFaculty = assignedFaculty;
                prefDoc.status = 'allocated';
                prefDoc.allocatedBy = 'admin_allocation';
                prefDoc.allocatedAt = new Date();

                // Find index to set currentFacultyIndex
                const fId = assignedFaculty.toString();
                const idx = prefDoc.preferences.findIndex(p => p.faculty && p.faculty.toString() === fId);
                if (idx !== -1) {
                    prefDoc.currentFacultyIndex = idx;
                }
                await prefDoc.save();
            }

            facultyLoad[assignedFaculty.toString()]++;
            const facName = faculties.find(f => f._id.toString() === assignedFaculty.toString())?.fullName;
            console.log(`  ✅ ${group.name} → ${facName}`);
            allocated++;
        } else {
            console.log(`  ❌ ${group.name}: All preferred faculty at capacity`);
            failed++;
        }
    }

    console.log(`\n=== Allocation Results ===`);
    console.log(`Allocated: ${allocated}`);
    console.log(`Failed: ${failed}`);
    console.log(`\nFinal faculty load:`);
    faculties.forEach(f => console.log(`  ${f.fullName}: ${facultyLoad[f._id.toString()] || 0} groups`));

    // Final counts
    const finalAllocated = await Group.countDocuments({ semester: CONFIG.SEMESTER, allocatedFaculty: { $ne: null } });
    const finalTotal = await Group.countDocuments({ semester: CONFIG.SEMESTER });
    console.log(`\nFinal: ${finalAllocated}/${finalTotal} groups allocated (${Math.round(finalAllocated / finalTotal * 100)}%)`);

    mongoose.connection.close();
}

run().catch(e => { console.error(e); process.exit(1); });
