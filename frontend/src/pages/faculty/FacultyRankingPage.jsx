import React, { useState, useEffect, useCallback } from 'react';
import { allocationAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';

const FacultyRankingPage = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [data, setData] = useState(null);
    const [rankedGroups, setRankedGroups] = useState([]);
    const [unrankedGroups, setUnrankedGroups] = useState([]);
    const [draggedItem, setDraggedItem] = useState(null);
    const [expandedGroup, setExpandedGroup] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await allocationAPI.faculty.getGroupsToRank();
            setData(res.data);

            const groups = res.data?.groups || [];
            const existing = res.data?.existingRanking || [];

            if (existing.length > 0) {
                // Map existing rankings to group details
                const rankedIds = new Set(existing.map(r => (r.group?._id || r.group).toString()));
                const ranked = existing.map(r => {
                    const groupId = (r.group?._id || r.group).toString();
                    const detail = groups.find(g => g._id === groupId);
                    return detail || { _id: groupId, name: 'Unknown Group', members: [] };
                }).filter(Boolean);
                const unranked = groups.filter(g => !rankedIds.has(g._id));
                setRankedGroups(ranked);
                setUnrankedGroups(unranked);
            } else {
                setRankedGroups([]);
                setUnrankedGroups(groups);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load ranking data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const windowStatus = data?.windowStatus?.status || 'not_configured';
    const isWindowOpen = windowStatus === 'open';

    // Add group to ranked list
    const addToRanked = (group) => {
        setUnrankedGroups(prev => prev.filter(g => g._id !== group._id));
        setRankedGroups(prev => [...prev, group]);
    };

    // Remove from ranked
    const removeFromRanked = (group) => {
        setRankedGroups(prev => prev.filter(g => g._id !== group._id));
        setUnrankedGroups(prev => [...prev, group]);
    };

    // Drag handlers for reordering ranked list
    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = 'move';
        e.target.style.opacity = '0.5';
    };
    const handleDragEnd = (e) => {
        e.target.style.opacity = '1';
        setDraggedItem(null);
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === dropIndex) return;
        const items = [...rankedGroups];
        const [removed] = items.splice(draggedItem, 1);
        items.splice(dropIndex, 0, removed);
        setRankedGroups(items);
        setDraggedItem(null);
    };

    const handleSubmit = async () => {
        if (rankedGroups.length === 0) {
            toast.error('Please rank at least one group');
            return;
        }
        setSubmitting(true);
        try {
            const rankings = rankedGroups.map((g, idx) => ({
                group: g._id,
                rank: idx + 1
            }));
            await allocationAPI.faculty.submitRankings(rankings);
            toast.success('Group rankings submitted successfully!');
        } catch (error) {
            toast.error(error.message || 'Failed to submit rankings');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Loading groups...</p>
                </div>
            </div>
        );
    }

    const totalGroups = (data?.groups || []).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Group Ranking</h1>
                            <p className="text-sm text-slate-400">{totalGroups} group{totalGroups !== 1 ? 's' : ''} listed you as a mentor preference</p>
                        </div>
                    </div>
                </div>

                {/* Window Status */}
                <WindowStatusBanner status={windowStatus} windowData={data?.windowStatus} />

                {/* Submission Status */}
                {data?.hasSubmitted && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
                        <p className="text-emerald-300 font-medium text-sm">
                            ✅ Rankings submitted on {new Date(data.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {isWindowOpen && <p className="text-emerald-400/60 text-xs mt-1">You can update your rankings until the window closes.</p>}
                    </div>
                )}

                {totalGroups === 0 ? (
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-12 text-center">
                        <div className="text-5xl mb-4">📭</div>
                        <h3 className="text-xl font-semibold text-white mb-2">No Groups to Rank</h3>
                        <p className="text-slate-400 text-sm">No groups have listed you as a preference yet. Check back later.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Unranked Groups */}
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-700/50">
                                <h2 className="text-lg font-semibold text-white">
                                    Unranked Groups
                                    <span className="text-sm font-normal text-slate-400 ml-2">({unrankedGroups.length})</span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">Click to add to your ranked list. Unranked groups will use default ordering.</p>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto p-3 space-y-2">
                                {unrankedGroups.length === 0 ? (
                                    <p className="text-slate-500 text-sm text-center p-6">All groups have been ranked 🎉</p>
                                ) : (
                                    unrankedGroups.map(group => (
                                        <GroupCard
                                            key={group._id}
                                            group={group}
                                            isExpanded={expandedGroup === group._id}
                                            onToggle={() => setExpandedGroup(expandedGroup === group._id ? null : group._id)}
                                            actionButton={isWindowOpen ? (
                                                <button
                                                    onClick={() => addToRanked(group)}
                                                    className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-lg p-1.5 transition-all"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                </button>
                                            ) : null}
                                        />
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right: Ranked Groups (Drag & Drop) */}
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-700/50">
                                <h2 className="text-lg font-semibold text-white">
                                    Your Rankings
                                    <span className="text-sm font-normal text-slate-400 ml-2">({rankedGroups.length})</span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">Drag to reorder. Position 1 = most preferred group.</p>
                            </div>
                            <div className="p-3 space-y-2 min-h-[200px] max-h-[400px] overflow-y-auto">
                                {rankedGroups.length === 0 ? (
                                    <div className="text-center p-10">
                                        <div className="text-4xl mb-3">📋</div>
                                        <p className="text-slate-400 text-sm">Add groups from the left to rank them</p>
                                    </div>
                                ) : (
                                    rankedGroups.map((group, index) => (
                                        <div
                                            key={group._id}
                                            draggable={isWindowOpen}
                                            onDragStart={e => handleDragStart(e, index)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDrop={e => handleDrop(e, index)}
                                            className={`flex items-center gap-3 bg-slate-800/60 border rounded-xl p-3 transition-all ${draggedItem === index ? 'border-purple-400/60 bg-purple-900/20 scale-[0.98]' : 'border-slate-700/40'
                                                } ${isWindowOpen ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        >
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25' :
                                                    index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800' :
                                                        index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                                            'bg-slate-700/80 text-slate-300'
                                                }`}>{index + 1}</div>

                                            {isWindowOpen && (
                                                <div className="text-slate-500">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate">{group.name}</p>
                                                <p className="text-xs text-slate-400 truncate">
                                                    {group.members?.map(m => m.fullName).join(', ')}
                                                </p>
                                            </div>

                                            {isWindowOpen && (
                                                <button
                                                    onClick={() => removeFromRanked(group)}
                                                    className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Submit */}
                            {isWindowOpen && (
                                <div className="p-5 border-t border-slate-700/50">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting || rankedGroups.length === 0}
                                        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${rankedGroups.length > 0
                                                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-lg shadow-purple-500/25'
                                                : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {submitting ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Submitting...
                                            </span>
                                        ) : data?.hasSubmitted ? '✏️ Update Rankings' : '📨 Submit Rankings'}
                                    </button>
                                    {unrankedGroups.length > 0 && (
                                        <p className="text-xs text-slate-500 text-center mt-2">
                                            {unrankedGroups.length} unranked group{unrankedGroups.length > 1 ? 's' : ''} will use default ordering
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Sub-components
const WindowStatusBanner = ({ status, windowData }) => {
    const configs = {
        not_configured: { bg: 'bg-slate-500/10 border-slate-500/30', text: 'text-slate-300', icon: '⏳', msg: 'Ranking window not configured yet.' },
        upcoming: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-300', icon: '📅', msg: `Opens ${windowData?.start ? new Date(windowData.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'soon'}` },
        open: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300', icon: '✅', msg: `Open until ${windowData?.end ? new Date(windowData.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD'}` },
        closed: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-300', icon: '🔒', msg: 'Ranking window closed.' }
    };
    const b = configs[status] || configs.not_configured;
    return (
        <div className={`${b.bg} border rounded-xl p-4 mb-6`}>
            <p className={`${b.text} font-medium text-sm`}>{b.icon} {b.msg}</p>
        </div>
    );
};

const GroupCard = ({ group, isExpanded, onToggle, actionButton }) => (
    <div className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 hover:border-purple-500/30 rounded-xl transition-all duration-200">
        <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggle}>
            <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">{group.name}</p>
                <p className="text-xs text-slate-400 truncate">{group.members?.length || 0} members</p>
            </div>
            <div className="flex items-center gap-2">
                {actionButton}
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
        {isExpanded && (
            <div className="px-4 pb-4 border-t border-slate-700/30 pt-3 space-y-2">
                {group.project && (
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wide">Project</p>
                        <p className="text-sm text-white font-medium">{group.project.title}</p>
                        {group.project.description && (
                            <p className="text-xs text-slate-400 mt-1 line-clamp-3">{group.project.description}</p>
                        )}
                    </div>
                )}
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Members</p>
                    <div className="space-y-1 mt-1">
                        {group.members?.map((m, i) => (
                            <p key={i} className="text-xs text-slate-300">
                                {m.fullName} <span className="text-slate-500">({m.studentId})</span>
                                {m.role === 'leader' && <span className="text-amber-400 ml-1">★</span>}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        )}
    </div>
);

export default FacultyRankingPage;
