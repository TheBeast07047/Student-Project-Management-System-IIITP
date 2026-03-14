import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';
import { parseAllocationResponse, showAllocationToast } from '../../utils/allocationUtils';

/**
 * AllocationRunner — A drop-in, self-contained allocation component.
 *
 * Usage:
 *   <AllocationRunner semester={7} onAllocationComplete={loadData} />
 *
 * Props:
 *   semester        — Which semester to fetch groups for (5, 7, 8, etc.)
 *   onAllocationComplete — Optional callback fired after a successful allocation run
 */
const AllocationRunner = ({ semester, onAllocationComplete }) => {
    // Data
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deadlineInfo, setDeadlineInfo] = useState(null); // { deadline, isPast, hoursLeft }

    // Allocation runner state
    const [allocationRunning, setAllocationRunning] = useState(false);
    const [allocationResults, setAllocationResults] = useState(null);
    const [allocationForceRun, setAllocationForceRun] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState(new Set());
    const [expandedResponseGroup, setExpandedResponseGroup] = useState(null);

    // Fetch groups for this semester
    const loadGroups = useCallback(async () => {
        try {
            setLoading(true);
            const response = await adminAPI.getAllocatedFaculty(semester);
            const data = response.data || response;

            if (data && data.groups) {
                // Separate unallocated groups
                const unallocated = data.groups.filter(g => !g.isAllocated);
                setGroups(unallocated);

                // Compute deadline status from the first group that has one
                const deadlineStr = unallocated.find(g => g.allocationDeadline)?.allocationDeadline;
                if (deadlineStr) {
                    const deadlineDate = new Date(deadlineStr);
                    const now = new Date();
                    const hoursLeft = (deadlineDate - now) / (1000 * 60 * 60);
                    setDeadlineInfo({
                        deadline: deadlineDate,
                        isPast: hoursLeft <= 0,
                        hoursLeft: Math.ceil(hoursLeft)
                    });
                } else {
                    setDeadlineInfo(null);
                }
            } else {
                setGroups([]);
                setDeadlineInfo(null);
            }
        } catch (error) {
            console.error(`[AllocationRunner] Failed to load groups for semester ${semester}:`, error);
            setGroups([]);
        } finally {
            setLoading(false);
        }
    }, [semester]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    // Run allocation
    const handleRunAllocation = async (useSelectedOnly = false) => {
        try {
            setAllocationRunning(true);
            setAllocationResults(null);

            const payload = {};

            if (useSelectedOnly && selectedGroups.size > 0) {
                const selectedPrefIds = groups
                    .filter(grp => selectedGroups.has(grp._id) && grp.preferenceId)
                    .map(grp => grp.preferenceId);

                if (selectedPrefIds.length === 0) {
                    toast.error('No valid groups selected for allocation');
                    setAllocationRunning(false);
                    return;
                }
                payload.preferenceIds = selectedPrefIds;
            } else {
                payload.semester = semester;
                if (allocationForceRun) {
                    payload.forceRun = true;
                }
            }

            const response = await adminAPI.runAllocation(payload);
            const data = parseAllocationResponse(response);
            setAllocationResults(data);
            setSelectedGroups(new Set());
            showAllocationToast(data);

            // Refresh data
            loadGroups();
            if (onAllocationComplete) onAllocationComplete();
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
        const pendingGroups = groups.filter(grp => grp.preferenceId);
        if (selectedGroups.size === pendingGroups.length && pendingGroups.length > 0) {
            setSelectedGroups(new Set());
        } else {
            setSelectedGroups(new Set(pendingGroups.map(grp => grp._id)));
        }
    };

    // Don't render anything if loading or no pending groups
    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow mt-6 mb-6 p-6">
                <div className="flex items-center gap-3">
                    <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
                    <span className="text-sm text-gray-500">Loading allocation data for Semester {semester}...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow mt-6 mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Run Batch Allocation — Semester {semester}
                        </h2>
                        <p className="text-gray-600 mt-1 text-sm">
                            Allocate faculty to groups based on interest responses and preference rankings.
                            Only groups whose response deadline has passed will be processed.
                        </p>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${groups.length > 0 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
                        {groups.length} pending
                    </span>
                </div>
            </div>

            <div className="p-6">
                {/* Deadline Status Indicator */}
                {deadlineInfo && (
                    <div className={`mb-4 flex items-center gap-3 px-4 py-3 rounded-lg border ${deadlineInfo.isPast
                        ? 'bg-green-50 border-green-300'
                        : deadlineInfo.hoursLeft <= 24
                            ? 'bg-orange-50 border-orange-300'
                            : 'bg-blue-50 border-blue-300'
                        }`}>
                        <span className="text-lg">{deadlineInfo.isPast ? '✅' : deadlineInfo.hoursLeft <= 24 ? '⏰' : '📅'}</span>
                        <div>
                            <p className={`text-sm font-medium ${deadlineInfo.isPast ? 'text-green-800' : deadlineInfo.hoursLeft <= 24 ? 'text-orange-800' : 'text-blue-800'
                                }`}>
                                {deadlineInfo.isPast
                                    ? 'Response deadline has passed — ready to run allocation'
                                    : `Response deadline: ${deadlineInfo.deadline.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${deadlineInfo.deadline.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                                }
                            </p>
                            {!deadlineInfo.isPast && (
                                <p className={`text-xs mt-0.5 ${deadlineInfo.hoursLeft <= 24 ? 'text-orange-600' : 'text-blue-600'
                                    }`}>
                                    {deadlineInfo.hoursLeft <= 24
                                        ? `Only ${deadlineInfo.hoursLeft} hour(s) remaining. "Run Allocation" will be available after the deadline passes.`
                                        : `${deadlineInfo.hoursLeft} hours remaining. Faculty can still change their responses.`
                                    }
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <div className={`rounded-lg border px-3 py-2 select-none ${selectedGroups.size > 0 ? 'border-gray-200 bg-gray-50 opacity-50' : 'border-orange-300 bg-orange-50'}`}>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={allocationForceRun}
                                onChange={(e) => setAllocationForceRun(e.target.checked)}
                                disabled={allocationRunning || selectedGroups.size > 0}
                                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm font-medium text-orange-800">Force Run</span>
                        </label>
                        <p className="text-xs text-orange-600 mt-1 ml-6">Override deadline — allocate even if the response window is still open</p>
                    </div>

                    <button
                        onClick={() => handleRunAllocation(false)}
                        disabled={allocationRunning || selectedGroups.size > 0 || groups.length === 0}
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
                            <span className="text-sm text-gray-400">
                                {groups.length > 0 ? 'Or select specific groups below' : 'No pending groups'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Groups table */}
                {groups.length > 0 && (
                    <div className="overflow-x-auto mb-6 border border-gray-200 rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="w-8 px-2 py-3 text-center text-xs font-medium text-gray-500 bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={selectedGroups.size > 0 && selectedGroups.size === groups.filter(g => g.preferenceId).length}
                                            onChange={toggleSelectAll}
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                            title="Select all groups"
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Group Name
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Responses
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {groups.map((grp, index) => {
                                    const sorted = grp.facultyPreferences ? [...grp.facultyPreferences].sort((a, b) => a.priority - b.priority) : [];
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
                                        <tr key={grp._id || index} className={`hover:bg-gray-50 ${selectedGroups.has(grp._id) ? 'bg-indigo-50' : ''}`}>
                                            <td className={`w-8 px-2 py-3 text-center ${selectedGroups.has(grp._id) ? 'bg-indigo-50' : 'bg-white'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedGroups.has(grp._id)}
                                                    onChange={() => toggleGroupSelection(grp._id)}
                                                    disabled={!grp.preferenceId}
                                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 disabled:opacity-30"
                                                    title={grp.preferenceId ? 'Select for allocation' : 'No preference submitted'}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                <div className="flex flex-col">
                                                    <span>{grp.groupName}</span>
                                                    {grp.projectTitle && (
                                                        <span className="text-xs text-gray-500 mt-0.5">{grp.projectTitle}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm relative">
                                                {sorted.length > 0 ? (
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
                                                ) : (
                                                    <span className="text-xs text-gray-400">No preferences</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {grp.requiresManualAllocation ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                                        Requires Manual
                                                    </span>
                                                ) : grp.preferenceId ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                                        Pending
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                        No Preference
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

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

                        {/* Summary stats — only show when something was actually processed */}
                        {allocationResults.totalProcessed > 0 && (
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
                        )}

                        {/* Detail lists — only show when something was processed */}
                        {allocationResults.totalProcessed > 0 && (
                            <>
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

                {/* Empty state */}
                {groups.length === 0 && !allocationResults && (
                    <div className="text-center py-8">
                        <svg className="mx-auto h-12 w-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-gray-500 mt-3 text-sm">All groups for Semester {semester} have been allocated.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AllocationRunner;
