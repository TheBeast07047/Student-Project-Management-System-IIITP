import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { parseAllocationResponse, showAllocationToast } from '../../utils/allocationUtils';

const Sem5AllocatedFaculty = () => {
  const [groups, setGroups] = useState([]);
  const [filteredGroups, setFilteredGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [currentYearOnly, setCurrentYearOnly] = useState(true);
  const [availableBatches, setAvailableBatches] = useState([]);
  const [activeTab, setActiveTab] = useState('allocated'); // allocated, unallocated, notregistered, registrations
  const [stats, setStats] = useState({
    totalGroups: 0,
    allocatedGroups: 0,
    unallocatedGroups: 0,
    allocationRate: 0
  });
  const [studentStats, setStudentStats] = useState({
    totalNotRegistered: 0,
    inGroup: 0,
    notInGroup: 0
  });
  const [maxSupervisors, setMaxSupervisors] = useState(7);

  // State for inline remarks editing
  const [editingRemarks, setEditingRemarks] = useState({ id: null, type: null, value: '' });
  const [savingRemarks, setSavingRemarks] = useState(false);

  // Allocation runner state
  const [allocationRunning, setAllocationRunning] = useState(false);
  const [allocationResults, setAllocationResults] = useState(null);
  const [allocationSemesterFilter, setAllocationSemesterFilter] = useState('');
  const [allocationForceRun, setAllocationForceRun] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [expandedResponseGroup, setExpandedResponseGroup] = useState(null);

  // Function to calculate batch from registration date
  const calculateBatch = (registrationDate) => {
    if (!registrationDate) return null;

    const date = new Date(registrationDate);
    const year = date.getFullYear();
    const month = date.getMonth();

    let academicStartYear;
    if (month >= 6) {
      academicStartYear = year;
    } else {
      academicStartYear = year - 1;
    }

    const batchEndYear = academicStartYear + 4;
    return `${academicStartYear}-${batchEndYear}`;
  };

  // Function to sort and filter groups
  const sortAndFilterGroups = (grps) => {
    // Add calculated batch to each group
    const groupsWithBatch = grps.map(grp => ({
      ...grp,
      calculatedBatch: calculateBatch(grp.createdAt)
    }));

    // Extract available batches
    const batchGroups = {};
    groupsWithBatch.forEach(grp => {
      const batch = grp.calculatedBatch;
      if (!batchGroups[batch]) batchGroups[batch] = [];
      batchGroups[batch].push(grp);
    });

    const batches = Object.keys(batchGroups).sort((a, b) => a.localeCompare(b));
    setAvailableBatches(batches);

    // Filter by batch/year
    let filtered;
    if (currentYearOnly) {
      const currentBatch = calculateBatch(new Date());
      filtered = groupsWithBatch.filter(grp =>
        grp.calculatedBatch === currentBatch
      );
    } else if (selectedBatch) {
      filtered = groupsWithBatch.filter(grp =>
        grp.calculatedBatch === selectedBatch
      );
    } else {
      filtered = groupsWithBatch;
    }

    // Filter by allocation status based on active tab
    if (activeTab === 'allocated') {
      filtered = filtered.filter(grp => grp.isAllocated);
    } else if (activeTab === 'unallocated') {
      filtered = filtered.filter(grp => !grp.isAllocated);
    }

    return filtered;
  };

  // Function to sort and filter students
  const sortAndFilterStudents = (studs) => {
    // Add calculated batch to each student
    const studentsWithBatch = studs.map(stud => ({
      ...stud,
      calculatedBatch: calculateBatch(new Date()) // Using current date as students don't have registration date
    }));

    // Filter by batch/year - students use their academicYear directly
    let filtered = studentsWithBatch;

    if (currentYearOnly) {
      const currentBatch = calculateBatch(new Date());
      // Match based on academic year pattern
      filtered = filtered.filter(stud => {
        if (!stud.academicYear) return false;
        // academicYear is like "2024-25", batch is like "2024-2028"
        const acYearStart = stud.academicYear.split('-')[0];
        const batchStart = currentBatch.split('-')[0];
        return acYearStart === batchStart;
      });
    } else if (selectedBatch) {
      const batchStart = selectedBatch.split('-')[0];
      filtered = filtered.filter(stud => {
        if (!stud.academicYear) return false;
        const acYearStart = stud.academicYear.split('-')[0];
        return acYearStart === batchStart;
      });
    }

    return filtered;
  };

  // Function to sort and filter registrations
  const sortAndFilterRegistrations = (regs) => {
    // Add calculated batch to each registration
    const registrationsWithBatch = regs.map(reg => ({
      ...reg,
      calculatedBatch: calculateBatch(reg.timestamp)
    }));

    // Group by batch and sort batches
    const batchGroups = {};
    registrationsWithBatch.forEach(reg => {
      const batch = reg.calculatedBatch;
      if (!batchGroups[batch]) batchGroups[batch] = [];
      batchGroups[batch].push(reg);
    });

    // Return filtered data based on selection
    let filtered;
    if (currentYearOnly) {
      const currentBatch = calculateBatch(new Date());
      filtered = registrationsWithBatch.filter(reg =>
        reg.calculatedBatch === currentBatch
      );
    } else if (selectedBatch) {
      filtered = registrationsWithBatch.filter(reg =>
        reg.calculatedBatch === selectedBatch
      );
    } else {
      filtered = registrationsWithBatch;
    }

    // Sort within each batch by timestamp (newest first)
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filtered;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load groups data
      const groupsResponse = await adminAPI.getSem5AllocatedFaculty();
      const allGroups = groupsResponse.data || [];
      const statsData = groupsResponse.stats || {
        totalGroups: 0,
        allocatedGroups: 0,
        unallocatedGroups: 0,
        allocationRate: 0
      };

      // Load projects to get feedback
      const projectsResponse = await adminAPI.getProjects({ semester: 5, projectType: 'minor2' });
      const projects = projectsResponse.data || [];
      const projectsMap = new Map(projects.map(p => [p._id.toString(), p]));
      // Also create a map by group ID for groups that don't have project populated
      const projectsByGroupMap = new Map();
      projects.forEach(p => {
        if (p.group) {
          const groupId = p.group._id ? p.group._id.toString() : (typeof p.group === 'string' ? p.group : null);
          if (groupId) {
            projectsByGroupMap.set(groupId, p);
          }
        }
      });

      // Merge feedback into groups (groups have project._id)
      const groupsWithFeedback = allGroups.map(grp => {
        // Try to find project by grp.project._id first, then by group._id
        let project = null;
        let projectId = null;

        // First try: use grp.project._id if available
        if (grp.project?._id) {
          projectId = grp.project._id.toString();
          project = projectsMap.get(projectId);
        }

        // Second try: find project by group ID if project not found yet
        if (!project && grp._id) {
          project = projectsByGroupMap.get(grp._id.toString());
          if (project) {
            projectId = project._id.toString();
          }
        }

        return {
          ...grp,
          projectFeedback: project?.feedback || '',
          projectId: projectId
        };
      });

      setGroups(groupsWithFeedback);
      setStats(statsData);

      const filteredGrps = sortAndFilterGroups(groupsWithFeedback);
      setFilteredGroups(filteredGrps);

      // Load non-registered students data
      const studentsResponse = await adminAPI.getSem5NonRegisteredStudents();
      const allStudents = studentsResponse.data || [];
      const studentStatsData = studentsResponse.stats || {
        totalNotRegistered: 0,
        inGroup: 0,
        notInGroup: 0
      };

      setStudents(allStudents);
      setStudentStats(studentStatsData);

      const filteredStuds = sortAndFilterStudents(allStudents);
      setFilteredStudents(filteredStuds);

      // Load registrations data
      const registrationsResponse = await adminAPI.getSem5Registrations();
      const allRegistrations = registrationsResponse.data || [];

      // Merge feedback into registrations (registration._id is project._id)
      const registrationsWithFeedback = allRegistrations.map(reg => ({
        ...reg,
        feedback: projectsMap.get(reg._id)?.feedback || ''
      }));

      setRegistrations(registrationsWithFeedback);

      // Calculate maximum number of supervisors in the data
      let maxSups = 0;
      registrationsWithFeedback.forEach(reg => {
        for (let i = 1; i <= 10; i++) {
          if (reg[`supervisor${i}`]) {
            maxSups = Math.max(maxSups, i);
          }
        }
      });
      setMaxSupervisors(maxSups || 7);

      const filteredRegs = sortAndFilterRegistrations(registrationsWithFeedback);
      setFilteredRegistrations(filteredRegs);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Re-apply filtering when settings change
  useEffect(() => {
    if (groups.length > 0) {
      const filtered = sortAndFilterGroups(groups);
      setFilteredGroups(filtered);
    }
    if (students.length > 0) {
      const filtered = sortAndFilterStudents(students);
      setFilteredStudents(filtered);
    }
    if (registrations.length > 0) {
      const filtered = sortAndFilterRegistrations(registrations);
      setFilteredRegistrations(filtered);
    }
  }, [groups, students, registrations, selectedBatch, currentYearOnly, activeTab]);

  const formatTimestamp = (timestamp, includeTime = false) => {
    const date = new Date(timestamp);
    if (includeTime) {
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    }
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Handle inline remarks editing
  const handleStartEditRemarks = (id, type, currentValue) => {
    setEditingRemarks({ id, type, value: currentValue || '' });
  };

  const handleCancelEditRemarks = () => {
    setEditingRemarks({ id: null, type: null, value: '' });
  };

  const handleSaveProjectRemarks = async (projectId, remarks) => {
    try {
      setSavingRemarks(true);
      const response = await adminAPI.updateProjectStatus(projectId, { feedback: remarks });
      if (response.success) {
        toast.success('Remarks saved successfully');
        await loadData();
        setEditingRemarks({ id: null, type: null, value: '' });
      } else {
        throw new Error(response.message || 'Failed to save remarks');
      }
    } catch (error) {
      console.error('Failed to save remarks:', error);
      toast.error(`Failed to save remarks: ${error.message}`);
    } finally {
      setSavingRemarks(false);
    }
  };

  const handleRunAllocation = async (useSelectedOnly = false) => {
    try {
      setAllocationRunning(true);
      setAllocationResults(null);

      const payload = {};

      // If running for selected groups only, send their preferenceIds
      if (useSelectedOnly && selectedGroups.size > 0) {
        const selectedPrefIds = filteredGroups
          .filter(grp => selectedGroups.has(grp._id) && grp.preferenceId)
          .map(grp => grp.preferenceId);

        if (selectedPrefIds.length === 0) {
          toast.error('No valid groups selected for allocation');
          setAllocationRunning(false);
          return;
        }
        payload.preferenceIds = selectedPrefIds;
      } else {
        if (allocationSemesterFilter) {
          payload.semester = parseInt(allocationSemesterFilter);
        }
        if (allocationForceRun) {
          payload.forceRun = true;
        }
      }

      const response = await adminAPI.runAllocation(payload);
      const data = parseAllocationResponse(response);
      setAllocationResults(data);
      setSelectedGroups(new Set());
      showAllocationToast(data);

      // Refresh the data after allocation
      loadData();
    } catch (error) {
      toast.error(`Allocation failed: ${error.message}`);
      setAllocationResults(null);
    } finally {
      setAllocationRunning(false);
    }
  };

  // Group selection helpers
  const toggleGroupSelection = (groupId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingGroups = filteredGroups.filter(grp => !grp.isAllocated && grp.preferenceId);
    if (selectedGroups.size === pendingGroups.length && pendingGroups.length > 0) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(pendingGroups.map(grp => grp._id)));
    }
  };

  // Render editable remarks cell
  const renderRemarksCell = (rowId, type, currentValue, projectId) => {
    const isEditing = editingRemarks.id === rowId && editingRemarks.type === type;
    const canEdit = !!projectId; // Only allow editing if project exists

    if (isEditing) {
      return (
        <td className="px-3 py-4 text-sm">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editingRemarks.value}
              onChange={(e) => setEditingRemarks({ ...editingRemarks, value: e.target.value })}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
              disabled={!canEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canEdit) {
                  handleSaveProjectRemarks(projectId, editingRemarks.value);
                } else if (e.key === 'Escape') {
                  handleCancelEditRemarks();
                }
              }}
            />
            <button
              onClick={() => {
                if (canEdit) {
                  handleSaveProjectRemarks(projectId, editingRemarks.value);
                }
              }}
              disabled={savingRemarks || !canEdit}
              className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              title={!canEdit ? 'Project not registered yet. Register project first to add remarks.' : ''}
            >
              {savingRemarks ? '...' : '✓'}
            </button>
            <button
              onClick={handleCancelEditRemarks}
              className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              ✕
            </button>
          </div>
          {!canEdit && (
            <div className="mt-1 text-xs text-red-600">
              Project not registered yet. Register project first to add remarks.
            </div>
          )}
        </td>
      );
    }

    return (
      <td
        className={`px-3 py-4 text-sm text-gray-900 min-w-[150px] ${canEdit ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-60'
          }`}
        onClick={() => {
          if (canEdit) {
            handleStartEditRemarks(rowId, type, currentValue);
          } else {
            toast.error('Project not registered yet. Register project first to add remarks.');
          }
        }}
        title={canEdit ? 'Click to edit remarks' : 'Project not registered yet. Register project first to add remarks.'}
      >
        {currentValue || (
          <span className={canEdit ? 'text-gray-400 italic' : 'text-gray-300 italic'}>
            {canEdit ? 'Click to add remarks' : 'No project registered'}
          </span>
        )}
      </td>
    );
  };

  // Function to generate CSV content for groups
  const generateCSV = (grps) => {
    const headers = [
      'Group Name',
      'Allocated Faculty',
      'Faculty Department',
      'Faculty Designation',
      'Project Title',
      'Member 1 Name',
      'Member 1 MIS',
      'Member 1 Contact',
      'Member 1 Branch',
      'Member 2 Name',
      'Member 2 MIS',
      'Member 2 Contact',
      'Member 2 Branch',
      'Member 3 Name',
      'Member 3 MIS',
      'Member 3 Contact',
      'Member 3 Branch',
      'Member 4 Name',
      'Member 4 MIS',
      'Member 4 Contact',
      'Member 4 Branch',
      'Member 5 Name',
      'Member 5 MIS',
      'Member 5 Contact',
      'Member 5 Branch',
      'Status',
      'Created Date'
    ];

    const csvContent = [
      headers.join(','),
      ...grps.map(grp => [
        `"${grp.groupName}"`,
        `"${grp.allocatedFaculty}"`,
        `"${grp.facultyDepartment}"`,
        `"${grp.facultyDesignation}"`,
        `"${grp.projectTitle}"`,
        `"${grp.member1Name || ''}"`,
        `"${grp.member1MIS || ''}"`,
        `"${grp.member1Contact || ''}"`,
        `"${grp.member1Branch || ''}"`,
        `"${grp.member2Name || ''}"`,
        `"${grp.member2MIS || ''}"`,
        `"${grp.member2Contact || ''}"`,
        `"${grp.member2Branch || ''}"`,
        `"${grp.member3Name || ''}"`,
        `"${grp.member3MIS || ''}"`,
        `"${grp.member3Contact || ''}"`,
        `"${grp.member3Branch || ''}"`,
        `"${grp.member4Name || ''}"`,
        `"${grp.member4MIS || ''}"`,
        `"${grp.member4Contact || ''}"`,
        `"${grp.member4Branch || ''}"`,
        `"${grp.member5Name || ''}"`,
        `"${grp.member5MIS || ''}"`,
        `"${grp.member5Contact || ''}"`,
        `"${grp.member5Branch || ''}"`,
        `"${grp.status}"`,
        `"${formatTimestamp(grp.createdAt)}"`
      ].join(','))
    ].join('\n');

    return csvContent;
  };

  // Function to generate CSV content for registrations
  const generateRegistrationsCSV = (regs) => {
    const headers = [
      'Timestamp',
      'Email Address',
      'Name of Group Member 1',
      'MIS No. of Group Member 1',
      'Contact No. of Group Member 1',
      'Branch of Group Member 1',
      'Name of Group Member 2',
      'MIS No. of Group Member 2',
      'Contact No. of Group Member 2',
      'Branch of Group Member 2',
      'Name of Group Member 3',
      'MIS No. of Group Member 3',
      'Contact No. of Group Member 3',
      'Branch of Group Member 3',
      'Name of Group Member 4',
      'MIS No. of Group Member 4',
      'Contact No. of Group Member 4',
      'Branch of Group Member 4',
      'Name of Group Member 5 (If Any)',
      'MIS No. of Group Member 5 (If Any)',
      'Contact No. of Group Member 5 (If Any)',
      'Branch of Group Member 5 (If Any)',
      'Proposed Project Title/Area'
    ];

    // Add dynamic supervisor preference headers
    for (let i = 1; i <= maxSupervisors; i++) {
      headers.push(`Supervisor Preference ${i}`);
    }

    const csvContent = [
      headers.join(','),
      ...regs.map(reg => {
        const row = [
          `"${formatTimestamp(reg.timestamp, true)}"`,
          `"${reg.email}"`,
          `"${reg.member1Name || ''}"`,
          `"${reg.member1MIS || ''}"`,
          `"${reg.member1Contact || ''}"`,
          `"${reg.member1Branch || ''}"`,
          `"${reg.member2Name || ''}"`,
          `"${reg.member2MIS || ''}"`,
          `"${reg.member2Contact || ''}"`,
          `"${reg.member2Branch || ''}"`,
          `"${reg.member3Name || ''}"`,
          `"${reg.member3MIS || ''}"`,
          `"${reg.member3Contact || ''}"`,
          `"${reg.member3Branch || ''}"`,
          `"${reg.member4Name || ''}"`,
          `"${reg.member4MIS || ''}"`,
          `"${reg.member4Contact || ''}"`,
          `"${reg.member4Branch || ''}"`,
          `"${reg.member5Name || ''}"`,
          `"${reg.member5MIS || ''}"`,
          `"${reg.member5Contact || ''}"`,
          `"${reg.member5Branch || ''}"`,
          `"${reg.projectTitle || ''}"`
        ];

        // Add dynamic supervisor columns
        for (let i = 1; i <= maxSupervisors; i++) {
          row.push(`"${reg[`supervisor${i}`] || ''}"`);
        }

        return row.join(',');
      })
    ].join('\n');

    return csvContent;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Faculty Allocation Overview (Sem 5)
              </h1>
              <p className="mt-2 text-gray-600">
                View all groups with their allocated faculty and group member details
              </p>
            </div>
            <Link
              to="/dashboard/admin"
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md flex items-center space-x-2"
            >
              <span>←</span>
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Total Groups</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalGroups}</p>
              </div>
              <div className="ml-4">
                <div className="bg-blue-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Allocated</p>
                <p className="text-2xl font-bold text-green-600">{stats.allocatedGroups}</p>
              </div>
              <div className="ml-4">
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Unallocated</p>
                <p className="text-2xl font-bold text-red-600">{stats.unallocatedGroups}</p>
              </div>
              <div className="ml-4">
                <div className="bg-red-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">Allocation Rate</p>
                <p className="text-2xl font-bold text-blue-600">{stats.allocationRate}%</p>
              </div>
              <div className="ml-4">
                <div className="bg-blue-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('allocated')}
                className={`${activeTab === 'allocated'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Allocated Groups ({stats.allocatedGroups})</span>
              </button>
              <button
                onClick={() => setActiveTab('unallocated')}
                className={`${activeTab === 'unallocated'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pending Allocation ({stats.unallocatedGroups})</span>
              </button>
              <button
                onClick={() => setActiveTab('notregistered')}
                className={`${activeTab === 'notregistered'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Not Registered ({studentStats.totalNotRegistered})</span>
              </button>
              <button
                onClick={() => setActiveTab('registrations')}
                className={`${activeTab === 'registrations'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>All Registrations ({filteredRegistrations.length})</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Show Current Year:
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={currentYearOnly}
                  onChange={(e) => {
                    setCurrentYearOnly(e.target.checked);
                    if (e.target.checked) setSelectedBatch('');
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">Current Year Only</span>
              </div>
            </div>

            {!currentYearOnly && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Batch:
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Batches</option>
                  {availableBatches.map((batch) => (
                    <option key={batch} value={batch}>
                      Batch {batch}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end">
              <button
                onClick={loadData}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Export Button */}
        {((activeTab !== 'notregistered' && activeTab !== 'registrations' && filteredGroups.length > 0) ||
          (activeTab === 'notregistered' && filteredStudents.length > 0) ||
          (activeTab === 'registrations' && filteredRegistrations.length > 0)) && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => {
                  let csvContent;
                  if (activeTab === 'notregistered') {
                    // Generate CSV for students
                    const headers = ['Name', 'MIS Number', 'Email', 'Contact', 'Branch', 'Group Status', 'Group Name'];
                    csvContent = [
                      headers.join(','),
                      ...filteredStudents.map(stud => [
                        `"${stud.fullName}"`,
                        `"${stud.misNumber}"`,
                        `"${stud.email}"`,
                        `"${stud.contactNumber}"`,
                        `"${stud.branch}"`,
                        `"${stud.groupStatus}"`,
                        `"${stud.groupName}"`
                      ].join(','))
                    ].join('\n');
                  } else if (activeTab === 'registrations') {
                    csvContent = generateRegistrationsCSV(filteredRegistrations);
                  } else {
                    csvContent = generateCSV(filteredGroups);
                  }

                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  if (link.download !== undefined) {
                    const url = URL.createObjectURL(blob);
                    link.setAttribute('href', url);
                    const fileName = activeTab === 'notregistered'
                      ? `sem5_not_registered_students.csv`
                      : activeTab === 'registrations'
                        ? `sem5_minor_project_2_registrations.csv`
                        : `sem5_${activeTab}_groups.csv`;
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export to CSV</span>
              </button>
            </div>
          )}

        {/* Results Summary */}
        <div className={`mb-6 border rounded-lg p-4 ${activeTab === 'allocated' ? 'bg-green-50 border-green-200' :
          activeTab === 'unallocated' ? 'bg-orange-50 border-orange-200' :
            activeTab === 'notregistered' ? 'bg-red-50 border-red-200' :
              'bg-purple-50 border-purple-200'
          }`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`font-medium ${activeTab === 'allocated' ? 'text-green-900' :
                activeTab === 'unallocated' ? 'text-orange-900' :
                  activeTab === 'notregistered' ? 'text-red-900' :
                    'text-purple-900'
                }`}>
                {activeTab === 'allocated' ? 'Allocated Groups:' :
                  activeTab === 'unallocated' ? 'Pending Allocation:' :
                    activeTab === 'notregistered' ? 'Not Registered Students:' :
                      'Total Registrations:'}
              </h3>
              <p className={
                activeTab === 'allocated' ? 'text-green-700' :
                  activeTab === 'unallocated' ? 'text-orange-700' :
                    activeTab === 'notregistered' ? 'text-red-700' :
                      'text-purple-700'
              }>
                {activeTab === 'notregistered'
                  ? `${filteredStudents.length} students`
                  : activeTab === 'registrations'
                    ? `${filteredRegistrations.length} Minor Project 2 group registrations`
                    : `${filteredGroups.length} groups`
                }
              </p>
            </div>
            <div className="flex space-x-2">
              {currentYearOnly && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Current Year
                </span>
              )}
              {selectedBatch && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Batch {selectedBatch}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Groups/Students/Registrations Table */}
        {/* Run Allocation Section */}
        {activeTab === 'unallocated' && (
          <div className="bg-white rounded-lg shadow mt-6 mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Run Batch Allocation</h2>
              <p className="text-gray-600 mt-1 text-sm">
                Automatically allocate faculty to all groups whose response deadline has passed.
                Faculty are allocated based on interest responses and group preference rankings.
              </p>
            </div>

            <div className="p-6">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <select
                  value={allocationSemesterFilter}
                  onChange={(e) => setAllocationSemesterFilter(e.target.value)}
                  disabled={allocationRunning || selectedGroups.size > 0}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  <option value="">All Semesters</option>
                  <option value="5">Semester 5</option>
                  <option value="7">Semester 7</option>
                  <option value="8">Semester 8</option>
                </select>

                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none ${selectedGroups.size > 0 ? 'border-gray-200 bg-gray-50 opacity-50' : 'border-orange-300 bg-orange-50'}`}>
                  <input
                    type="checkbox"
                    checked={allocationForceRun}
                    onChange={(e) => setAllocationForceRun(e.target.checked)}
                    disabled={allocationRunning || selectedGroups.size > 0}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-orange-800">Force Run (ignore deadline)</span>
                </label>

                <button
                  onClick={() => handleRunAllocation(false)}
                  disabled={allocationRunning || selectedGroups.size > 0}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                >
                  {allocationRunning && selectedGroups.size === 0 ? 'Running...' : 'Run Batch Allocation'}
                </button>

                {/* Divider */}
                <div className="h-8 w-px bg-gray-300" />

                {/* Selected groups action */}
                <div className="flex items-center gap-3">
                  {selectedGroups.size > 0 ? (
                    <>
                      <span className="text-sm font-medium text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                        {selectedGroups.size} group{selectedGroups.size > 1 ? 's' : ''} selected
                      </span>
                      <button
                        onClick={() => handleRunAllocation(true)}
                        disabled={allocationRunning}
                        className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
                      >
                        {allocationRunning ? 'Running...' : `Allocate Selected (${selectedGroups.size})`}
                      </button>
                      <button
                        onClick={() => setSelectedGroups(new Set())}
                        disabled={allocationRunning}
                        className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">Select groups below for targeted allocation</span>
                  )}
                </div>
              </div>

              {/* Results */}
              {allocationResults && (
                <div className="space-y-6">

                  {/* Message banner when nothing was processed */}
                  {allocationResults.totalProcessed === 0 && allocationResults.message && (
                    <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50">
                      <span className="text-lg flex-shrink-0">⚠️</span>
                      <div>
                        <p className="text-sm font-medium text-amber-800">No groups were allocated</p>
                        <p className="text-sm text-amber-700 mt-0.5">{allocationResults.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Summary stats + detail lists — only show when something was processed */}
                  {allocationResults.totalProcessed > 0 && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-green-50 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-green-700">{allocationResults.allocated.length}</p>
                          <p className="text-sm text-green-600 mt-1">Allocated by Stable Matching</p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-amber-700">{allocationResults.randomAllocated.length}</p>
                          <p className="text-sm text-amber-600 mt-1">Randomly Allocated</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-gray-700">{allocationResults.skipped.length}</p>
                          <p className="text-sm text-gray-600 mt-1">Skipped</p>
                        </div>
                        {allocationResults.errors.length > 0 && (
                          <div className="bg-red-50 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-red-700">{allocationResults.errors.length}</p>
                            <p className="text-sm text-red-600 mt-1">Errors</p>
                          </div>
                        )}
                      </div>

                      {/* Allocated by interest list */}
                      {allocationResults.allocated.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Allocated by Stable Matching</h3>
                          <div className="space-y-2">
                            {allocationResults.allocated.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-2 text-sm">
                                <span className="font-medium text-gray-900">{item.groupName}</span>
                                <span className="text-green-700">→ {item.facultyName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Randomly allocated list */}
                      {allocationResults.randomAllocated.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Randomly Allocated</h3>
                          <p className="text-xs text-gray-500 mb-2">
                            These groups had no interested faculty or all interested faculty were at capacity.
                          </p>
                          <div className="space-y-2">
                            {allocationResults.randomAllocated.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-amber-50 rounded-lg px-4 py-2 text-sm">
                                <span className="font-medium text-gray-900">{item.groupName}</span>
                                <span className="text-amber-700">→ {item.facultyName}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Errors list */}
                      {allocationResults.errors.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-red-700 mb-2">Could Not Allocate</h3>
                          <p className="text-xs text-gray-500 mb-2">
                            These groups require manual admin allocation.
                          </p>
                          <div className="space-y-2">
                            {allocationResults.errors.map((item, idx) => (
                              <div key={idx} className="bg-red-50 rounded-lg px-4 py-2 text-sm">
                                <span className="font-medium text-gray-900">{item.groupName || 'Unknown Group'}</span>
                                <p className="text-red-600 text-xs mt-1">{item.error}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'notregistered' ? (
          /* Students Table */
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            {filteredStudents.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No students found</h3>
                <p className="mt-1 text-sm text-gray-500">All students have registered</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-red-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Branch
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Group Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Group Name
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredStudents.map((student, index) => (
                      <tr key={student._id || index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {student.fullName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.misNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {student.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.contactNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.branch}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${student.groupStatus === 'In Group'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                            }`}>
                            {student.groupStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {student.groupName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'registrations' ? (
          /* Registrations Table */
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            {filteredRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No registrations found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {currentYearOnly ? 'No registrations for current year' :
                    selectedBatch ? `No registrations for batch ${selectedBatch}` :
                      'No registrations available'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                        Timestamp
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 1 Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 1 MIS
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 1 Contact
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 1 Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 2 Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 2 MIS
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 2 Contact
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 2 Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 3 Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 3 MIS
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 3 Contact
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 3 Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 4 Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 4 MIS
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 4 Contact
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 4 Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 5 Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 5 MIS
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 5 Contact
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 5 Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project Title
                      </th>
                      {/* Dynamic Supervisor Headers */}
                      {Array.from({ length: maxSupervisors }, (_, i) => (
                        <th key={`supervisor-header-${i + 1}`} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Supervisor {i + 1}
                        </th>
                      ))}
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRegistrations.map((reg, index) => (
                      <tr key={reg._id || index} className="hover:bg-gray-50">
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-white">
                          {formatTimestamp(reg.timestamp, true)}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.email}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member1Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member1MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member1Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member1Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member2Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member2MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member2Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member2Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member3Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member3MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member3Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member3Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member4Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member4MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member4Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member4Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member5Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member5MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member5Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {reg.member5Branch || '-'}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {reg.projectTitle || '-'}
                        </td>
                        {/* Dynamic Supervisor Columns */}
                        {Array.from({ length: maxSupervisors }, (_, i) => (
                          <td key={`supervisor-${index}-${i + 1}`} className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                            {reg[`supervisor${i + 1}`] || '-'}
                          </td>
                        ))}
                        {renderRemarksCell(reg._id, 'registration', reg.feedback, reg._id)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Groups Table */
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 text-gray-400">
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No groups found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {currentYearOnly ? 'No groups for current year' :
                    selectedBatch ? `No groups for batch ${selectedBatch}` :
                      'No groups available'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={activeTab === 'allocated' ? 'bg-green-50' : 'bg-red-50'}>
                    <tr>
                      {activeTab === 'unallocated' && (
                        <th className="w-8 px-2 py-3 text-center text-xs font-medium text-gray-500 bg-red-50">
                          <input
                            type="checkbox"
                            checked={selectedGroups.size > 0 && selectedGroups.size === filteredGroups.filter(g => !g.isAllocated && g.preferenceId).length}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            title="Select all groups"
                          />
                        </th>
                      )}
                      <th className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 ${activeTab === 'allocated' ? 'bg-green-50' : 'bg-red-50'
                        }`}>
                        Group Name
                      </th>
                      {activeTab === 'allocated' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-100">
                            Allocated Faculty
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Department
                          </th>
                        </>
                      )}
                      {activeTab === 'unallocated' && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-red-50">
                          Responses
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project Title
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 1
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS 1
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact 1
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 2
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS 2
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact 2
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 3
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS 3
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact 3
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 4
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS 4
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact 4
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Branch
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Member 5
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MIS 5
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact 5
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Branch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredGroups.map((grp, index) => (
                      <tr key={grp._id || index} className={`hover:bg-gray-50 ${selectedGroups.has(grp._id) ? 'bg-indigo-50' : ''}`}>
                        {activeTab === 'unallocated' && (
                          <td className={`w-8 px-2 py-4 text-center ${selectedGroups.has(grp._id) ? 'bg-indigo-50' : 'bg-white'}`}>
                            <input
                              type="checkbox"
                              checked={selectedGroups.has(grp._id)}
                              onChange={() => toggleGroupSelection(grp._id)}
                              disabled={!grp.preferenceId}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 disabled:opacity-30"
                              title={grp.preferenceId ? 'Select for allocation' : 'No preference submitted'}
                            />
                          </td>
                        )}
                        <td className={`px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 ${selectedGroups.has(grp._id) ? 'bg-indigo-50' : 'bg-white'}`}>
                          <div className="flex flex-col">
                            <span>{grp.groupName}</span>
                            {grp.requiresManualAllocation && (
                              <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 self-start border border-red-200">
                                Requires Manual Assignment
                              </span>
                            )}
                          </div>
                        </td>
                        {activeTab === 'allocated' && (
                          <>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-700 bg-green-50">
                              {grp.allocatedFaculty}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                              {grp.facultyDepartment || '-'}
                            </td>
                          </>
                        )}
                        {activeTab === 'unallocated' && (
                          <td className="px-4 py-3 text-sm relative">
                            {grp.facultyPreferences && grp.facultyPreferences.length > 0 ? (() => {
                              const sorted = [...grp.facultyPreferences].sort((a, b) => a.priority - b.priority);
                              const interestedCount = sorted.filter(p => {
                                const r = grp.facultyResponses?.find(r => r.facultyId?.toString() === p.facultyId?.toString());
                                return r?.response === 'interested';
                              }).length;
                              const declinedCount = sorted.filter(p => {
                                const r = grp.facultyResponses?.find(r => r.facultyId?.toString() === p.facultyId?.toString());
                                return r?.response === 'not_interested';
                              }).length;
                              const noResponseCount = sorted.length - interestedCount - declinedCount;
                              const isExpanded = expandedResponseGroup === grp._id;

                              return (
                                <div className="min-w-[160px]">
                                  {/* Compact summary row */}
                                  <button
                                    onClick={() => setExpandedResponseGroup(isExpanded ? null : grp._id)}
                                    className="flex items-center gap-2 w-full text-left hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      {interestedCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                          {interestedCount}
                                        </span>
                                      )}
                                      {declinedCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                          {declinedCount}
                                        </span>
                                      )}
                                      {noResponseCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-1.5 py-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                          {noResponseCount}
                                        </span>
                                      )}
                                    </div>
                                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>

                                  {/* Expanded detail popover */}
                                  {isExpanded && (
                                    <div className="absolute z-30 mt-1 left-2 right-2 bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[260px]">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-gray-700">
                                          {sorted.length} Faculty Preference{sorted.length > 1 ? 's' : ''}
                                        </span>
                                        <button
                                          onClick={() => setExpandedResponseGroup(null)}
                                          className="text-gray-400 hover:text-gray-600 p-0.5"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="space-y-1 max-h-64 overflow-y-auto">
                                        {sorted.map((pref, idx) => {
                                          const response = grp.facultyResponses?.find(
                                            r => r.facultyId?.toString() === pref.facultyId?.toString()
                                          );
                                          const statusStyle = response?.response === 'interested'
                                            ? 'bg-green-50 border-green-200 text-green-800'
                                            : response?.response === 'not_interested'
                                              ? 'bg-red-50 border-red-200 text-red-800'
                                              : 'bg-gray-50 border-gray-200 text-gray-600';
                                          const icon = response?.response === 'interested'
                                            ? '✓'
                                            : response?.response === 'not_interested'
                                              ? '✗'
                                              : '—';
                                          return (
                                            <div
                                              key={idx}
                                              className={`flex items-center justify-between text-xs rounded px-2 py-1.5 border ${statusStyle}`}
                                            >
                                              <span className="flex items-center gap-1.5">
                                                <span className="font-bold text-gray-500 w-4 text-center">#{pref.priority}</span>
                                                <span className="font-medium">{pref.faculty}</span>
                                              </span>
                                              <span className="font-semibold">{icon}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-gray-400">No preferences</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-4 text-sm text-gray-900 max-w-xs truncate">
                          {grp.projectTitle}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member1Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member1MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member1Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member1Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member2Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member2MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member2Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member2Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member3Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member3MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member3Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member3Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member4Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member4MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member4Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member4Branch || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member5Name || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member5MIS || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member5Contact || '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          {grp.member5Branch || '-'}
                        </td>
                        <td className="px-4 py-4 text-sm whitespace-nowrap">
                          {grp.allocationStatus === 'pending_admin_allocation' ? (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 border-red-200 border">
                              Admin Allocation
                            </span>
                          ) : (
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${grp.status === 'finalized' ? 'bg-green-100 text-green-800' :
                              grp.status === 'locked' ? 'bg-blue-100 text-blue-800' :
                                grp.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                              }`}>
                              {grp.status}
                            </span>
                          )}
                        </td>
                        {renderRemarksCell(grp._id, 'group', grp.projectFeedback, grp.projectId)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Sem5AllocatedFaculty;

