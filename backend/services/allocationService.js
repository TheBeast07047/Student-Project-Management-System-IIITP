const mongoose = require('mongoose');
const FacultyPreference = require('../models/FacultyPreference');
const Faculty = require('../models/Faculty');
const Project = require('../models/Project');
const Group = require('../models/Group');
const Student = require('../models/Student');
const SystemConfig = require('../models/SystemConfig');
const { stableMatch } = require('./stableMatchingService');

/**
 * Returns the SystemConfig key for the allowed faculty types based on semester and project type.
 */
const getConfigKeyForAllowedTypes = (semester, projectType) => {
    if (semester === 5) return 'sem5.minor2.allowedFacultyTypes';
    if (semester === 7 && projectType === 'major1') return 'sem7.major1.allowedFacultyTypes';
    if (semester === 7 && projectType === 'internship1') return 'sem7.internship1.allowedFacultyTypes';
    if (semester === 8 && projectType === 'internship2') return 'sem8.internship2.allowedFacultyTypes';
    if (semester === 8) return 'sem8.major2.group.allowedFacultyTypes';
    if (semester === 3) return 'mtech.sem3.allowedFacultyTypes'; // M.Tech Sem 3
    if (semester === 4) return 'mtech.sem4.allowedFacultyTypes'; // M.Tech Sem 4

    console.warn(`[AllocationService] Warning: No specific allowed config key for semester ${semester} and projectType ${projectType}. Using fallback.`);
    return 'sem5.minor2.allowedFacultyTypes'; // fallback
};

/**
 * Core allocation engine — uses Gale-Shapley stable matching.
 *
 * 1. Load all FacultyPreference docs, filter to eligible (pending/pending_admin_allocation)
 * 2. Build the { groups, faculty } input for the pure stableMatch() algorithm
 * 3. Run matching → get { matches, unmatched }
 * 4. Finalize matched pairs via DB transactions
 * 5. Attempt random allocation for unmatched groups
 *
 * @param {Array} preferenceIds - Array of FacultyPreference ObjectIds
 * @returns {Object} { allocated, randomAllocated, skipped, errors }
 */
const runAllocationForGroups = async (preferenceIds) => {
    const results = { allocated: [], randomAllocated: [], skipped: [], errors: [] };

    // --- Step 1: Load all preference docs ---
    const preferences = [];
    for (const prefId of preferenceIds) {
        try {
            const pref = await FacultyPreference.findById(prefId)
                .populate('preferences.faculty')
                .populate('facultyResponses.faculty')
                .populate('project')
                .populate('group');

            if (!pref || !['pending', 'pending_admin_allocation'].includes(pref.status)) {
                console.log(`[AllocationService] Skipping ${prefId}: Invalid status or not found.`);
                results.skipped.push(prefId);
                continue;
            }

            if (pref.project && pref.project.faculty) {
                console.log(`[AllocationService] Skipping ${prefId}: Project already has faculty assigned.`);
                results.skipped.push(prefId);
                continue;
            }

            preferences.push(pref);
        } catch (error) {
            console.error(`[AllocationService] Error loading preference ${prefId}:`, error);
            results.errors.push({ prefId, error: error.message });
        }
    }

    if (preferences.length === 0) {
        console.log('[AllocationService] No eligible groups to allocate.');
        return results;
    }

    // --- Step 2: Build faculty capacity map (current load across ALL semesters) ---
    // Collect all unique faculty IDs referenced in preferences
    const allFacultyIds = new Set();
    for (const pref of preferences) {
        for (const p of pref.preferences) {
            if (p.faculty?._id) allFacultyIds.add(p.faculty._id.toString());
        }
        for (const r of pref.facultyResponses) {
            if (r.faculty?._id) allFacultyIds.add(r.faculty._id.toString());
        }
    }

    // Load current allocation counts for each faculty
    const facultyCapacity = {}; // facultyId → { max, current }
    for (const fIdStr of allFacultyIds) {
        const faculty = await Faculty.findById(fIdStr);
        if (!faculty || faculty.isRetired) continue;

        const activeCount = await Project.countDocuments({
            faculty: faculty._id,
            status: { $in: ['faculty_allocated', 'active'] }
        });

        const max = faculty.maxGroupsAllowed || 5;
        const remaining = Math.max(0, max - activeCount);

        facultyCapacity[fIdStr] = { max, current: activeCount, remaining, faculty };
    }

    // --- Step 3: Build input for stableMatch() ---
    const groupsInput = {};  // prefId → { preferences: [facultyId, ...] }
    const facultyInput = {}; // facultyId → { capacity, preferences: [prefId, ...] }

    // Build group preferences: ordered list of faculty IDs (by group's priority, ascending)
    for (const pref of preferences) {
        const prefId = pref._id.toString();
        const sortedFacultyIds = pref.preferences
            .filter(p => p.faculty?._id && facultyCapacity[p.faculty._id.toString()])
            .sort((a, b) => a.priority - b.priority)
            .map(p => p.faculty._id.toString());

        groupsInput[prefId] = { preferences: sortedFacultyIds };
    }

    // Build faculty preferences: for each faculty, which groups they're interested in
    // Ordered by:
    // 1. groupRank (explicit ranking from 1 to N) - if exists
    // 2. respondedAt (implicit ordering, earlier response = higher preference) - fallback
    // ONLY considers "interested" responses, ignores "not_interested"
    const facultyInterestedGroups = {}; // facultyId → [{ prefId, respondedAt, groupRank }, ...]

    for (const pref of preferences) {
        const prefId = pref._id.toString();
        for (const resp of pref.facultyResponses) {
            if (resp.response !== 'interested') continue; // Only interested responses
            if (!resp.faculty?._id) continue;

            const fIdStr = resp.faculty._id.toString();
            if (!facultyCapacity[fIdStr]) continue; // Skip retired/missing faculty

            if (!facultyInterestedGroups[fIdStr]) {
                facultyInterestedGroups[fIdStr] = [];
            }
            facultyInterestedGroups[fIdStr].push({
                prefId,
                groupRank: resp.groupRank || null, // Capture rank if it exists
                respondedAt: resp.respondedAt || new Date(0) // fallback for missing timestamp
            });
        }
    }

    // Sort each faculty's interested groups by groupRank first, then respondedAt
    for (const fIdStr of Object.keys(facultyInterestedGroups)) {
        facultyInterestedGroups[fIdStr].sort((a, b) => {
            // If both have rank, use rank comparison
            if (a.groupRank !== null && b.groupRank !== null) {
                return a.groupRank - b.groupRank;
            }
            // If only 'a' has rank, 'a' comes first
            if (a.groupRank !== null && b.groupRank === null) {
                return -1;
            }
            // If only 'b' has rank, 'b' comes first
            if (a.groupRank === null && b.groupRank !== null) {
                return 1;
            }
            // If neither has rank, fall back to timestamp
            return new Date(a.respondedAt) - new Date(b.respondedAt);
        });

        facultyInput[fIdStr] = {
            capacity: facultyCapacity[fIdStr].remaining,
            preferences: facultyInterestedGroups[fIdStr].map(g => g.prefId)
        };
    }

    // Also add faculty with remaining capacity but no interested groups
    // (they won't participate in stable matching but can be used for random allocation)

    console.log(`[AllocationService] Running stable matching: ${Object.keys(groupsInput).length} groups, ${Object.keys(facultyInput).length} faculty`);

    // --- Step 4: Run the Gale-Shapley algorithm ---
    const { matches, unmatched } = stableMatch({
        groups: groupsInput,
        faculty: facultyInput
    });

    console.log(`[AllocationService] Stable matching result: ${matches.length} matched, ${unmatched.length} unmatched`);

    // --- Step 5: Finalize matched pairs ---
    const prefMap = {};
    for (const pref of preferences) {
        prefMap[pref._id.toString()] = pref;
    }

    for (const { groupId, facultyId } of matches) {
        try {
            const pref = prefMap[groupId];
            if (!pref) continue;
            await finalizeAllocation(pref, facultyId, 'stable_matching', results);
        } catch (error) {
            console.error(`[AllocationService] Error finalizing match ${groupId} → ${facultyId}:`, error);
            results.errors.push({
                prefId: groupId,
                groupName: prefMap[groupId]?.group?.name || 'Unknown Group',
                error: error.message
            });
        }
    }

    // --- Step 6: Handle unmatched groups — try random allocation ---
    for (const prefId of unmatched) {
        try {
            const pref = prefMap[prefId];
            if (!pref) continue;
            console.log(`[AllocationService] Unmatched group ${pref.group?.name || prefId}, trying random allocation.`);
            await assignRandomFaculty(pref, results);
        } catch (error) {
            console.error(`[AllocationService] Error in random allocation for ${prefId}:`, error);
            results.errors.push({
                prefId,
                groupName: prefMap[prefId]?.group?.name || 'Unknown Group',
                error: error.message
            });
        }
    }

    return results;
};

/**
 * Allocates a single specific group (used when admin selects individual groups).
 * Uses the legacy sequential logic — checks interested faculty by group priority,
 * picks first with capacity.
 */
const allocateSingleGroup = async (prefId, results) => {
    console.log(`[AllocationService] Processing single group preference ID: ${prefId}`);

    const preference = await FacultyPreference.findById(prefId)
        .populate('preferences.faculty')
        .populate('facultyResponses.faculty')
        .populate('project')
        .populate('group');

    if (!preference || !['pending', 'pending_admin_allocation'].includes(preference.status)) {
        console.log(`[AllocationService] Skipping ${prefId}: Invalid status or not found.`);
        results.skipped.push(prefId);
        return;
    }

    if (preference.project && preference.project.faculty) {
        console.log(`[AllocationService] Skipping ${prefId}: Project already has faculty assigned.`);
        results.skipped.push(prefId);
        return;
    }

    const interestedResponses = preference.facultyResponses.filter(r => r.response === 'interested');

    if (interestedResponses.length === 0) {
        console.log(`[AllocationService] No interested faculty for ${prefId}, assigning random.`);
        await assignRandomFaculty(preference, results);
        return;
    }

    // Sort interested faculty by the group's priority rank (ascending = most preferred)
    const sortedInterested = interestedResponses.sort((a, b) => {
        const priorityA = preference.preferences.find(
            p => p.faculty._id.toString() === a.faculty._id.toString()
        )?.priority ?? 999;
        const priorityB = preference.preferences.find(
            p => p.faculty._id.toString() === b.faculty._id.toString()
        )?.priority ?? 999;
        return priorityA - priorityB;
    });

    for (const response of sortedInterested) {
        const faculty = response.faculty;
        if (!faculty || !faculty._id) continue;
        if (faculty.isRetired) continue;

        const activeCount = await Project.countDocuments({
            faculty: faculty._id,
            status: { $in: ['faculty_allocated', 'active'] }
        });

        if (activeCount < (faculty.maxGroupsAllowed || 5)) {
            console.log(`[AllocationService] Allocating via faculty interest for ${prefId} to ${faculty.fullName}`);
            await finalizeAllocation(preference, faculty._id, 'faculty_interest', results);
            return;
        }
    }

    console.log(`[AllocationService] All interested faculty at cap for ${prefId}, assigning random.`);
    await assignRandomFaculty(preference, results);
};

/**
 * Assigns a random faculty member when no preferred faculty is available or interested
 */
const assignRandomFaculty = async (preference, results) => {
    console.log(`[AllocationService] Running random allocation for ${preference._id}`);

    // Determine allowed faculty types for this semester/projectType from SystemConfig
    const projectType = preference.project ? preference.project.projectType : null;
    const configKey = getConfigKeyForAllowedTypes(preference.semester, projectType);
    const allowedTypes = await SystemConfig.getConfigValue(configKey, ['Regular', 'Adjunct', 'On Lien']);

    // Get all active, non-retired faculty of allowed types
    const allFaculty = await Faculty.find({
        mode: { $in: allowedTypes },
        isRetired: { $ne: true }
    });

    // Filter to those with remaining capacity
    const withCapacity = [];
    for (const faculty of allFaculty) {
        const activeCount = await Project.countDocuments({
            faculty: faculty._id,
            status: { $in: ['faculty_allocated', 'active'] }
        });

        if (activeCount < (faculty.maxGroupsAllowed || 5)) {
            withCapacity.push(faculty);
        }
    }

    if (withCapacity.length === 0) {
        console.log(`[AllocationService] No faculty with available capacity found for ${preference._id}`);

        await FacultyPreference.findByIdAndUpdate(preference._id, {
            status: 'pending_admin_allocation'
        });

        results.errors.push({
            prefId: preference._id,
            groupName: preference.group?.name || 'Unknown Group',
            error: 'No faculty with available capacity found. Marked for admin allocation.'
        });
        return;
    }

    const randomFaculty = withCapacity[Math.floor(Math.random() * withCapacity.length)];
    console.log(`[AllocationService] Randomly selected faculty ${randomFaculty.fullName} for ${preference._id}`);

    await finalizeAllocation(preference, randomFaculty._id, 'random_allocation', results);
};

/**
 * Finalizes allocation through an atomic transaction, updating all necessary models.
 */
const finalizeAllocation = async (preference, facultyId, method, results) => {
    console.log(`[AllocationService] Finalizing allocation for ${preference._id} to faculty ${facultyId}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const faculty = await Faculty.findById(facultyId).session(session);
        if (!faculty) {
            throw new Error(`Faculty not found: ${facultyId}`);
        }

        // 1. Update Group (if group project)
        if (preference.group) {
            const groupId = preference.group._id || preference.group;
            const group = await Group.findById(groupId).session(session);

            if (group) {
                group.allocatedFaculty = facultyId;
                if (group.status === 'complete') {
                    group.status = 'locked';
                }
                await group.save({ session });
            }
        }

        // 2. Update Project
        if (preference.project) {
            const projectId = preference.project._id || preference.project;
            const project = await Project.findById(projectId).session(session);

            if (project) {
                project.faculty = facultyId;
                project.status = 'faculty_allocated';
                project.allocatedBy = method;
                await project.save({ session });

                // 3. Update each active group member's currentProjects status
                if (preference.group) {
                    const groupId = preference.group._id || preference.group;
                    const populatedGroup = await Group.findById(groupId)
                        .populate('members.student')
                        .session(session);

                    if (populatedGroup) {
                        const activeMembers = populatedGroup.members.filter(m => m.isActive);
                        for (const member of activeMembers) {
                            const studentId = member.student._id || member.student;
                            const memberStudent = await Student.findById(studentId).session(session);

                            if (memberStudent) {
                                const currentProjectEntry = memberStudent.currentProjects.find(
                                    cp => cp.project.toString() === project._id.toString()
                                );
                                if (currentProjectEntry) {
                                    currentProjectEntry.status = 'active';
                                }
                                await memberStudent.save({ session });
                            }
                        }
                    }
                }
            }
        }

        // 4. Update FacultyPreference
        await FacultyPreference.findByIdAndUpdate(
            preference._id,
            {
                allocatedFaculty: facultyId,
                allocatedBy: method,
                status: 'allocated',
                allocatedAt: new Date()
            },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        console.log(`[AllocationService] Successfully finalized allocation for ${preference._id}`);

        // Record in results — stable_matching goes into 'allocated' (interest-based)
        const groupName = preference.group?.name || 'Solo Project';
        if (method === 'stable_matching' || method === 'faculty_interest') {
            results.allocated.push({
                prefId: preference._id,
                facultyId,
                facultyName: faculty.fullName,
                groupName
            });
        } else {
            results.randomAllocated.push({
                prefId: preference._id,
                facultyId,
                facultyName: faculty.fullName,
                groupName
            });
        }

    } catch (error) {
        console.error(`[AllocationService] Transaction failed for ${preference._id}:`, error);
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

module.exports = {
    runAllocationForGroups,
    allocateSingleGroup
};
