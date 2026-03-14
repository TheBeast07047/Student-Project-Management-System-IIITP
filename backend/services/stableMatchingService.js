/**
 * stableMatchingService.js — Hospital-Resident (Gale-Shapley) Stable Matching
 *
 * A PURE FUNCTION with zero database access. Takes structured input, returns
 * matched pairs. This makes it easy to test and reuse across semesters.
 *
 * Algorithm: Groups propose to faculty in order of their ranked preferences.
 * Faculty accept/reject based on their preference ordering (derived from
 * respondedAt timestamp of "interested" responses — earlier = higher preference).
 *
 * Used by: allocationService.js → runAllocationForGroups
 */

/**
 * Run the Hospital-Resident stable matching algorithm.
 *
 * @param {Object} input
 * @param {Object} input.groups - Map of groupId → { preferences: [facultyId, ...] }
 *   preferences: faculty IDs ordered by the group's priority (index 0 = most preferred)
 * @param {Object} input.faculty - Map of facultyId → { capacity: Number, preferences: [groupId, ...] }
 *   preferences: group IDs ordered by faculty preference (index 0 = most preferred)
 *   Faculty preference is built from respondedAt timestamp (earlier = higher preference).
 *   Only groups the faculty marked "interested" appear in this list.
 *
 * @returns {Object} { matches: [{ groupId, facultyId }], unmatched: [groupId, ...] }
 *   matches: stable group–faculty pairs
 *   unmatched: groups that could not be matched to any interested faculty with capacity
 */
function stableMatch({ groups, faculty }) {
    // --- Initialization ---

    // Track which faculty each group is currently matched to (null = unmatched)
    const groupMatch = {};       // groupId → facultyId | null
    // Track which groups each faculty currently holds
    const facultyHolding = {};   // facultyId → [groupId, ...]
    // Track the next proposal index for each group (which faculty to propose to next)
    const proposalIndex = {};    // groupId → Number

    const groupIds = Object.keys(groups);
    const facultyIds = Object.keys(faculty);

    // Initialize all groups as unmatched
    for (const gId of groupIds) {
        groupMatch[gId] = null;
        proposalIndex[gId] = 0;
    }

    // Initialize all faculty as holding no groups
    for (const fId of facultyIds) {
        facultyHolding[fId] = [];
    }

    // Build faculty preference rank lookup for O(1) comparison
    // facultyRank[facultyId][groupId] = rank (lower = more preferred)
    const facultyRank = {};
    for (const fId of facultyIds) {
        facultyRank[fId] = {};
        const prefs = faculty[fId].preferences || [];
        for (let i = 0; i < prefs.length; i++) {
            facultyRank[fId][prefs[i]] = i; // rank 0 = most preferred
        }
    }

    // --- Main Loop ---
    // A group is "free" if it has no match and still has faculty left to propose to

    let freeGroups = groupIds.filter(gId =>
        groupMatch[gId] === null &&
        proposalIndex[gId] < (groups[gId].preferences?.length || 0)
    );

    while (freeGroups.length > 0) {
        const gId = freeGroups[0]; // Pick any free group

        // Get the next faculty this group wants to propose to
        const groupPrefs = groups[gId].preferences || [];
        const fId = groupPrefs[proposalIndex[gId]];
        proposalIndex[gId]++;

        // Skip if this faculty doesn't exist in our faculty map
        // (e.g., faculty who responded "not_interested" — they won't be in the map)
        if (!faculty[fId]) {
            // This faculty is not interested in this group or doesn't exist → try next
            freeGroups = groupIds.filter(gId2 =>
                groupMatch[gId2] === null &&
                proposalIndex[gId2] < (groups[gId2].preferences?.length || 0)
            );
            continue;
        }

        const fCapacity = faculty[fId].capacity || 1;
        const holding = facultyHolding[fId];

        // Check if faculty has this group in their preference list (i.e., faculty is interested)
        const groupRankForFaculty = facultyRank[fId][gId];
        if (groupRankForFaculty === undefined) {
            // Faculty did not mark interested in this group — skip
            freeGroups = groupIds.filter(gId2 =>
                groupMatch[gId2] === null &&
                proposalIndex[gId2] < (groups[gId2].preferences?.length || 0)
            );
            continue;
        }

        if (holding.length < fCapacity) {
            // Faculty has open capacity — accept the proposal
            holding.push(gId);
            groupMatch[gId] = fId;
        } else {
            // Faculty is full — find their worst current match
            let worstGroupId = null;
            let worstRank = -1;

            for (const heldGroupId of holding) {
                const heldRank = facultyRank[fId][heldGroupId];
                // Higher rank number = less preferred
                if (heldRank !== undefined && heldRank > worstRank) {
                    worstRank = heldRank;
                    worstGroupId = heldGroupId;
                }
            }

            // Does faculty prefer this new group over their worst current match?
            if (worstGroupId !== null && groupRankForFaculty < worstRank) {
                // Swap: reject worst, accept new
                const worstIdx = holding.indexOf(worstGroupId);
                holding[worstIdx] = gId;
                groupMatch[gId] = fId;
                groupMatch[worstGroupId] = null; // Rejected group becomes free
            }
            // Otherwise: reject the proposing group (it stays unmatched)
        }

        // Recalculate free groups
        freeGroups = groupIds.filter(gId2 =>
            groupMatch[gId2] === null &&
            proposalIndex[gId2] < (groups[gId2].preferences?.length || 0)
        );
    }

    // --- Build results ---
    const matches = [];
    const unmatched = [];

    for (const gId of groupIds) {
        if (groupMatch[gId] !== null) {
            matches.push({ groupId: gId, facultyId: groupMatch[gId] });
        } else {
            unmatched.push(gId);
        }
    }

    return { matches, unmatched };
}

module.exports = { stableMatch };
