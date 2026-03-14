# Allocation Engine Developer & Testing Guide

## 1. Feature Overview
The Allocation Engine implements an automated process for matching student groups to faculty mentors using the **Gale-Shapley Stable Matching Algorithm**. This allows the system to resolve the Many-to-Many preferences between groups (who rank multiple faculties in order of priority) and faculties (who express "interest" and can rank the groups).

The entire system strictly honors:
1. **Faculty Capacity**: Controlled via an adjustable `maxGroupsAllowed` parameter on the Faculty profile (defaults to 5). The system calculates the true remaining capacity dynamically by counting `active` and `faculty_allocated` projects currently assigned to that faculty across all semesters.
2. **Group's Priority**: Groups list up to 5 faculties in strict priority order (Priority 1 being the highest).
3. **Faculty's Ranking**: Faculties are prioritized for groups based primarily on their explicit `groupRank` (e.g., Rank 1, 2, 3), with the time of their response (`respondedAt`) acting as a fallback sorting mechanism (earlier response = higher preference).

If eligible groups cannot be matched (e.g., all chosen faculties rejected them, or all interested faculties filled up their capacities with higher-ranked groups), the engine utilizes a constrained **Random Allocation Fallback** to assign them to compatible faculties that still have available capacity.

---

## 2. Backend Implementation Details

### 2.1 Database & Schema Changes
Several Mongoose models were updated to support the complex state required for the Allocation Engine:

*   **`Faculty` Model (`models/Faculty.js`)**:
    *   Added `maxGroupsAllowed: { type: Number, default: 5 }`. This dictates the hard ceiling on how many active groups a faculty member can mentor concurrently.
*   **`FacultyPreference` Model (`models/FacultyPreference.js`)**:
    *   The `facultyResponses` subdocument was expanded to track:
        *   `groupRank: { type: Number }`: An explicit integer ranking the faculty gives to the group.
        *   `respondedAt: { type: Date, default: Date.now }`: Timestamp acting as the secondary tie-breaker.
    *   Added `allocatedBy: { type: String, enum: ['system_auto', 'admin_manual', 'faculty_accept', 'stable_matching', 'random_allocation', 'faculty_interest'] }`. This acts as an audit trail for *how* the group was assigned its faculty.
*   **`Project` and `Group` Models**: Workflow statuses map safely to `faculty_allocated` and `locked`.

### 2.2 Core Allocation Service (`services/allocationService.js`)
The beating heart of the feature.

1.  **Capacity Planning (`runAllocationForGroups`)**: 
    Before matching, the engine calculates real capacities. It fetches all active allocations the faculty is handling across the *entire system* (not just the current semester) to compute `remainingCapacity = maxGroupsAllowed - activeCount`.
2.  **Input Construction**:
    *   **Groups Input**: Constructs an array of preferred `facultyId`s ordered strictly by the students' `priority`.
    *   **Faculty Input**: Constructs an array of preferred `prefId`s ordered by `groupRank` ascending, then `respondedAt` ascending. (Only `interested` responses are considered).
3.  **The Gale-Shapley Execution (`stableMatch`)**:
    Delegates the normalized inputs to `stableMatchingService.js`. The group-proposing algorithm guarantees stable assignments within the constraint of available capacity. Returns `{ matches, unmatched }`.
4.  **Transaction Finalization (`finalizeAllocation`)**:
    Valid matches are safely committed to the database inside a `mongoose.startSession()` transaction. This atomically updates:
    *   `Group`: Sets `allocatedFaculty` and marks as `locked`.
    *   `Project`: Sets `facultyId`, `status: 'faculty_allocated'`, and `allocatedBy`.
    *   `Student`: Updates the `currentProjects` matrix.
    *   `FacultyPreference`: Sets `status: 'allocated'`.
5.  **Random Allocation Fallback (`assignRandomFaculty`)**: 
    Unmatched groups fetch the `SystemConfig` constraints (e.g., allowed faculty typings like `Regular`, `Adjunct`, `On Lien`) and find any faculty mathematically holding `remainingCapacity > 0`. A random choice is selected and transacted via the same exact atomic method.

### 2.3 API Endpoints
*   **`POST /api/admin/allocations/run`**: New endpoint triggering the engine.
    *   Accepts `preferenceIds` (Array) for explicit runs on selected groups.
    *   Accepts `forceRun` (Boolean) to bypass standard `allocationDeadline` checks.
    *   Accepts `semester` (Number) to scope a batch run.
*   **`POST /api/faculty/groups/rank-interested`**: New endpoint allowing faculties to bulk-submit explicit numerical `groupRank` values for the groups they marked as 'interested'.
*   **`POST /api/faculty/groups/:preferenceId/respond`**: Modified to log the `response` alongside `respondedAt`.

---

## 3. Frontend Implementation Details

### 3.1 Admin Interface Updates
The Admin UI was heavily modified to orchestrate and observe the Allocation Engine.

*   **API Client (`frontend/src/utils/api.js` & `apiWithToast.js`)**:
    *   Added `adminAPI.runAllocation(data)`.
    *   Added `adminAPI.getAllocatedFaculty(semester, params)`.
*   **Unallocated Groups View (`pages/admin/ManageProjects.jsx` & `Sem5AllocatedFaculty.jsx`)**:
    *   Table views now explicitly capture groups marked with `pending_admin_allocation` statuses.
    *   Lists all individual faculty responses right from the expanded row (Admins can see exactly *which* faculty clicked "interested", "not_interested", and their respective times).
    *   **Run Allocation Button**: A new action button triggers the automated bulk run. 
*   **Faculty Capacity Management (`pages/admin/ManageFaculty.jsx`)**:
    *   Admins can configure `maxGroupsAllowed` dynamically when editing a faculty profile via the Edit Modal.
    *   The datatable accurately retrieves and displays the real-time `activeGroupCount` for each listed faculty.

### 3.2 Faculty Interface Updates
The Faculty interface was enhanced to cleanly interact with Gale-Shapley preferences.

*   **API Client (`frontend/src/utils/api.js`)**: Additions include `facultyAPI.respondToGroup` and `facultyAPI.rankInterestedGroups`.
*   **Group Allocation / Request Inbox (`pages/faculty/GroupAllocation.jsx`)**:
    *   Incoming group requests are queued cleanly. 
    *   The UI prevents double-submission and supports bulk-ranking workflows for "Interested" groups, generating the vital `groupRank` metric for the Stable Matching algorithm.

---

## 4. Testing & Validation Scenarios

When developing against or QA testing the Allocation Engine, adhere to these templates.

### Prerequisites (Seeding State)
1. Use Admin panel to set `maxGroupsAllowed` for *Faculty A* to `1`, and *Faculty B* to `2`.
2. Generate 3 test student groups.
3. Group 1 preference: Faculty A (Prio 1), Faculty B (Prio 2).
4. Group 2 preference: Faculty A (Prio 1), Faculty B (Prio 2).
5. Group 3 preference: Faculty B (Prio 1), Faculty A (Prio 2).

### Scenario 1: Pure Stable Matching 
*   **Setup**: As Faculty A, accept Group 2 (Rank 1) and Group 1 (Rank 2). As Faculty B, accept Group 1 (Rank 1).
*   **Execution**: Fire `adminAPI.runAllocation()` via the dashboard.
*   **Expected Results**: 
    *   Group 2 gets Faculty A (Faculty A hits max capacity of 1).
    *   Group 1 gets bumped from Faculty A due to capacity, cascades to choice 2, and secures Faculty B.
    *   Group 3 fails to match via Gale-Shapley (not chosen), and gets handled by the Random Allocation fallback.
    *   Verify the `FacultyPreference.allocatedBy` field states `stable_matching` for Groups 1 and 2, and `random_allocation` for Group 3.

### Scenario 2: Admin Force Triggering
*   **Setup**: Identify a group whose `allocationDeadline` is physically in the future.
*   **Execution**: Check the group manually via the Admin table checkboxes, and hit "Force Allocate Engine". Payload sends specific `preferenceIds`.
*   **Expected Results**: The engine skirts the global deadline block because an explicit ID list was provided. Only the targeted group is pushed through the algorithm. 

### Scenario 3: Global Capacity Exhaustion
*   **Setup**: Lower `maxGroupsAllowed` on ALL faculty accounts across the system to `0`. Submit a batch of groups.
*   **Execution**: Trigger the batch allocator.
*   **Expected Results**: The Gale-Shapley algorithm fails instantly. The Random Allocation fallback kicks in. It realizes zero faculty members have `remainingCapacity > 0`. The entire transaction gracefully halts. Groups are forcefully marked `pending_admin_allocation` and an alert is passed back to the frontend. Database state remains clean with no exceptions.
