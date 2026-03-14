import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { facultyAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';
import GroupCard from '../../components/groups/GroupCard';

const GroupAllocation = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('unallocated');
  const [unallocatedGroups, setUnallocatedGroups] = useState([]);
  const [allocatedGroups, setAllocatedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [savingRank, setSavingRank] = useState(false);

  // Derived state: groups marked 'interested' and not yet allocated (still pending)
  const interestedGroups = unallocatedGroups
    .filter(g => g.myResponse === 'interested')
    .sort((a, b) => {
      // Sort by existing groupRank if available, then fallback to original array order
      if (a.groupRank !== null && b.groupRank !== null) return a.groupRank - b.groupRank;
      if (a.groupRank !== null) return -1;
      if (b.groupRank !== null) return 1;
      return 0;
    });

  const [localRankings, setLocalRankings] = useState([]);

  // Sync local rankings when interested groups change (e.g., clicking 'Interested' on a new group)
  useEffect(() => {
    // Only add new items to the bottom, keep existing order for the rest
    setLocalRankings(prevRankings => {
      const newIds = interestedGroups.map(g => g.id);

      // If same elements, no change
      if (prevRankings.length === newIds.length && prevRankings.every(id => newIds.includes(id))) {
        return prevRankings;
      }

      // Keep existing rankings order, append new ones at the bottom
      const existing = prevRankings.filter(id => newIds.includes(id));
      const added = newIds.filter(id => !existing.includes(id));
      return [...existing, ...added];
    });
  }, [interestedGroups.length]); // Re-run when the number of interested groups changes

  const moveRank = (index, direction) => {
    const newRankings = [...localRankings];
    if (direction === 'up' && index > 0) {
      [newRankings[index - 1], newRankings[index]] = [newRankings[index], newRankings[index - 1]];
    } else if (direction === 'down' && index < newRankings.length - 1) {
      [newRankings[index + 1], newRankings[index]] = [newRankings[index], newRankings[index + 1]];
    }
    setLocalRankings(newRankings);
  };

  const saveRankings = async () => {
    try {
      setSavingRank(true);
      await facultyAPI.rankInterestedGroups(localRankings);
      toast.success('Group rankings saved successfully');

      // Update local unallocatedGroups to reflect new ranks
      setUnallocatedGroups(prev => prev.map(g => {
        const rankIndex = localRankings.indexOf(g.id);
        if (rankIndex !== -1) {
          return { ...g, groupRank: rankIndex + 1 };
        }
        return g;
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save rankings');
    } finally {
      setSavingRank(false);
    }
  };

  // Load group allocation data
  useEffect(() => {
    const loadGroupData = async () => {
      try {
        setLoading(true);

        const [unallocatedResponse, allocatedResponse] = await Promise.all([
          facultyAPI.getUnallocatedGroups(),
          facultyAPI.getAllocatedGroups()
        ]);

        setUnallocatedGroups(unallocatedResponse.data || []);
        setAllocatedGroups(allocatedResponse.data || []);
      } catch (error) {
        console.error('Failed to load group data:', error);
        toast.error('Failed to load group allocation data');
      } finally {
        setLoading(false);
      }
    };

    loadGroupData();
  }, []);

  const handleRespond = async (groupId, response) => {
    try {
      setActionLoading(prev => ({ ...prev, [groupId]: response }));
      await facultyAPI.respondToGroup(groupId, response);

      // Update local state to reflect the new response without refetching
      setUnallocatedGroups(prev =>
        prev.map(g =>
          g.id === groupId ? { ...g, myResponse: response } : g
        )
      );

      toast.success(
        response === 'interested'
          ? 'Marked as interested'
          : 'Marked as not interested'
      );
    } catch (error) {
      toast.error(`Failed to record response: ${error.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [groupId]: null }));
    }
  };

  const handleViewGroupDetails = async (groupId) => {
    try {
      const response = await facultyAPI.getGroupDetails(groupId);
      // You can implement a modal or navigate to a details page
      console.log('Group details:', response.data);
    } catch (error) {
      toast.error('Failed to load group details');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading group allocation data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Group Allocation
              </h1>
              <p className="mt-2 text-gray-600">
                Review and allocate groups for Minor Project 2
              </p>
            </div>
            <button
              onClick={() => navigate('/dashboard/faculty')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Deadline Banner */}
        {(() => {
          const deadline = unallocatedGroups.find(g => g.allocationDeadline)?.allocationDeadline;
          if (!deadline) return null;
          const deadlineDate = new Date(deadline);
          const now = new Date();
          const hoursLeft = (deadlineDate - now) / (1000 * 60 * 60);
          const isPast = hoursLeft <= 0;
          const isUrgent = hoursLeft > 0 && hoursLeft <= 48;
          const bgColor = isPast ? 'bg-red-50 border-red-300' : isUrgent ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-300';
          const textColor = isPast ? 'text-red-800' : isUrgent ? 'text-orange-800' : 'text-blue-800';
          const subTextColor = isPast ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-blue-600';
          return (
            <div className={`mb-6 border rounded-lg p-4 ${bgColor}`}>
              <div className="flex items-center">
                <span className="text-xl mr-3">{isPast ? '⚠️' : isUrgent ? '⏰' : '📅'}</span>
                <div>
                  <p className={`font-semibold ${textColor}`}>
                    {isPast
                      ? 'Response deadline has passed'
                      : `Respond by: ${deadlineDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${deadlineDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    }
                  </p>
                  <p className={`text-sm ${subTextColor}`}>
                    {isPast
                      ? 'Allocation will be finalized by the admin. You can no longer change your responses.'
                      : isUrgent
                        ? `Only ${Math.ceil(hoursLeft)} hours remaining! Respond soon.`
                        : 'After this deadline, allocation will be finalized based on your responses.'
                    }
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <span className="text-2xl">⏳</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Awaiting Response</p>
                <p className="text-2xl font-bold text-gray-900">{unallocatedGroups.filter(g => !g.myResponse).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">✅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Allocated Groups</p>
                <p className="text-2xl font-bold text-gray-900">{allocatedGroups.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Groups</p>
                <p className="text-2xl font-bold text-gray-900">{unallocatedGroups.length + allocatedGroups.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Response Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {unallocatedGroups.length > 0 ?
                    Math.round((unallocatedGroups.filter(g => g.myResponse).length / unallocatedGroups.length) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('unallocated')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'unallocated'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Groups Awaiting Response ({unallocatedGroups.length})
              </button>
              <button
                onClick={() => setActiveTab('allocated')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'allocated'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                My Groups ({allocatedGroups.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'unallocated' ? (
          <div className="space-y-6">

            {/* Ranking UI (Only show if there are multiple interested groups) */}
            {interestedGroups.length > 1 && (() => {
              const isRankingDisabled = interestedGroups.some(g => g.allocationDeadline && new Date(g.allocationDeadline) < new Date());

              return (
                <div className="bg-white rounded-lg shadow border-2 border-indigo-100">
                  <div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50/50 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-semibold text-indigo-900">Rank Your Preferred Groups</h2>
                      <p className="text-indigo-700 mt-1 text-sm">
                        {isRankingDisabled
                          ? 'The response deadline has passed. You can no longer change your group preferences.'
                          : 'You are interested in multiple groups. Order them by preference to influence the stable matching algorithm. Rank 1 is your most preferred group.'}
                      </p>
                    </div>
                    <button
                      onClick={saveRankings}
                      disabled={savingRank || isRankingDisabled}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingRank ? 'Saving...' : 'Save Rankings'}
                    </button>
                  </div>
                  <div className="p-6">
                    <div className="space-y-3">
                      {localRankings.map((groupId, index) => {
                        const group = interestedGroups.find(g => g.id === groupId);
                        if (!group) return null;

                        return (
                          <div key={groupId} className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-indigo-300 transition-colors">
                            <div className="flex flex-col gap-1 w-8">
                              <button
                                onClick={() => moveRank(index, 'up')}
                                disabled={index === 0 || isRankingDisabled}
                                className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-30 transition-colors"
                                title="Move Up"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button
                                onClick={() => moveRank(index, 'down')}
                                disabled={index === localRankings.length - 1 || isRankingDisabled}
                                className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600 disabled:opacity-30 transition-colors"
                                title="Move Down"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>

                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                              {index + 1}
                            </div>

                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">{group.groupName}</h4>
                              <p className="text-sm text-gray-600">{group.projectTitle}</p>
                            </div>

                            {group.groupRank === index + 1 ? (
                              <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-800 rounded-full flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Save
                              </span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                                Unsaved Change
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Groups Awaiting Your Response</h2>
                <p className="text-gray-600 mt-1">
                  These groups have listed you as one of their faculty preferences. Review each group and mark whether you are interested in supervising them.
                </p>
              </div>
              <div className="p-6">
                {unallocatedGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No groups pending your response</h3>
                    <p className="text-gray-600">
                      All groups that listed you as a preference have been handled, or no groups have selected you yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {unallocatedGroups.map((group) => (
                      <div key={group.id} className={`border-2 rounded-lg p-6 transition-all ${group.myResponse === 'interested'
                        ? 'border-green-400 bg-green-50/30 shadow-sm'
                        : group.myResponse === 'not_interested'
                          ? 'border-red-300 bg-red-50/20 shadow-sm'
                          : 'border-gray-200 hover:shadow-md'
                        }`}>
                        {/* Card Header with badges */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{group.groupName}</h3>
                            <p className="text-sm text-gray-600">{group.projectTitle}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.semester && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Sem {group.semester}
                              </span>
                            )}
                            {group.myRank && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                Your Rank #{group.myRank} of {group.totalPreferences}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Members */}
                        {group.members && group.members.length > 0 && (
                          <div className="mb-3">
                            <h4 className="font-medium text-gray-900 text-sm">Members:</h4>
                            <div className="mt-1 space-y-1">
                              {group.members.map((member, index) => (
                                <div key={index} className="flex items-center justify-between text-sm">
                                  <span className="text-gray-600">
                                    {member.name} ({member.misNumber})
                                  </span>
                                  <span className={`px-2 py-1 text-xs rounded-full ${member.role === 'leader'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                    }`}>
                                    {member.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Faculty Preferences (ranked list) */}
                        {group.preferences && group.preferences.length > 0 && (
                          <div className="mb-3">
                            <h4 className="font-medium text-gray-900 text-sm">Faculty Preferences:</h4>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {group.preferences.map((facultyName, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                                >
                                  #{index + 1} {facultyName}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        {(() => {
                          const isDeadlinePassed = group.allocationDeadline && new Date(group.allocationDeadline) < new Date();
                          return (
                            <div className="mt-6 pt-4 border-t border-gray-200">
                              {isDeadlinePassed ? (
                                /* Deadline passed — read-only state */
                                <div className="space-y-2">
                                  {group.myResponse && (
                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${group.myResponse === 'interested'
                                      ? 'bg-green-100 border border-green-300'
                                      : 'bg-red-100 border border-red-300'
                                      }`}>
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${group.myResponse === 'interested' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                        }`}>
                                        {group.myResponse === 'interested' ? (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className={`text-sm font-medium ${group.myResponse === 'interested' ? 'text-green-800' : 'text-red-800'
                                        }`}>
                                        {group.myResponse === 'interested' ? 'You marked Interested' : 'You marked Not Interested'}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-300">
                                    <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    <span className="text-sm text-gray-600">
                                      Response deadline has passed — awaiting admin allocation
                                    </span>
                                  </div>
                                </div>
                              ) : group.myResponse ? (
                                <div className="space-y-3">
                                  {/* Status Banner */}
                                  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${group.myResponse === 'interested'
                                    ? 'bg-green-100 border border-green-300'
                                    : 'bg-red-100 border border-red-300'
                                    }`}>
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${group.myResponse === 'interested'
                                      ? 'bg-green-500 text-white'
                                      : 'bg-red-500 text-white'
                                      }`}>
                                      {group.myResponse === 'interested' ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                      ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <p className={`font-semibold text-sm ${group.myResponse === 'interested' ? 'text-green-800' : 'text-red-800'
                                        }`}>
                                        {group.myResponse === 'interested'
                                          ? 'You are interested in this group'
                                          : 'You declined this group'}
                                      </p>
                                      <p className={`text-xs mt-0.5 ${group.myResponse === 'interested' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {group.myResponse === 'interested'
                                          ? 'You will be considered during allocation based on the group\'s preference ranking.'
                                          : 'This group will not be allocated to you.'}
                                      </p>
                                    </div>
                                  </div>
                                  {/* Change Response Button */}
                                  <button
                                    onClick={() => handleRespond(
                                      group.id,
                                      group.myResponse === 'interested' ? 'not_interested' : 'interested'
                                    )}
                                    disabled={actionLoading[group.id]}
                                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors border ${group.myResponse === 'interested'
                                      ? 'border-red-300 text-red-700 bg-white hover:bg-red-50'
                                      : 'border-green-300 text-green-700 bg-white hover:bg-green-50'
                                      } disabled:opacity-50`}
                                  >
                                    {actionLoading[group.id]
                                      ? 'Updating...'
                                      : group.myResponse === 'interested'
                                        ? 'Change to Not Interested'
                                        : 'Change to Interested'}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => handleRespond(group.id, 'interested')}
                                    disabled={!!actionLoading[group.id]}
                                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {actionLoading[group.id] === 'interested' ? 'Saving...' : 'Interested'}
                                  </button>
                                  <button
                                    onClick={() => handleRespond(group.id, 'not_interested')}
                                    disabled={!!actionLoading[group.id]}
                                    className="flex-1 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 font-medium py-2.5 px-4 rounded-lg transition-colors border-2 border-red-300 hover:border-red-400 flex items-center justify-center gap-2"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    {actionLoading[group.id] === 'not_interested' ? 'Saving...' : 'Not Interested'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">My Allocated Groups</h2>
                <p className="text-gray-600 mt-1">
                  Groups that you have allocated and are currently supervising.
                </p>
              </div>
              <div className="p-6">
                {allocatedGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Allocated Groups</h3>
                    <p className="text-gray-600">
                      You haven't allocated any groups yet. Check the pending requests tab to allocate groups.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {allocatedGroups.map((group) => (
                      <div key={group._id} className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                        <GroupCard
                          group={group}
                          showActions={false}
                          userRole="faculty"
                        />

                        {/* Allocation Info */}
                        <div className="mt-4 p-3 bg-green-50 rounded-lg">
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                            <span className="text-sm font-medium text-green-800">
                              Allocated on {new Date(group.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="mt-6 pt-4 border-t border-gray-200">
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleViewGroupDetails(group._id)}
                              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              View Details
                            </button>
                            <button
                              onClick={() => navigate(`/faculty/groups/${group._id}/manage`)}
                              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Manage Group
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Information Card */}
        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">About Group Allocation</h3>
          <div className="text-blue-800 space-y-2">
            <p>• <strong>Interested:</strong> Mark a group as one you'd like to supervise</p>
            <p>• <strong>Not Interested:</strong> Decline supervising this group</p>
            <p>• <strong>Change Response:</strong> You can update your response at any time before the allocation deadline</p>
            <p>• <strong>Your Rank:</strong> Shows where you appear in the group's faculty preference list</p>
            <p>• <strong>Allocation:</strong> Final allocation will be processed after all faculty have responded</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupAllocation;
