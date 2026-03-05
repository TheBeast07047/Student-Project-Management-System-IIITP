import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { allocationAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';

const GroupPreferenceSubmission = () => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [config, setConfig] = useState(null);
    const [facultyList, setFacultyList] = useState([]);
    const [selectedPrefs, setSelectedPrefs] = useState([]);
    const [existingPrefs, setExistingPrefs] = useState([]);
    const [groupInfo, setGroupInfo] = useState(null);
    const [projectInfo, setProjectInfo] = useState(null);
    const [demand, setDemand] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [draggedItem, setDraggedItem] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, facultyRes, prefsRes, demandRes] = await Promise.all([
                allocationAPI.student.getConfig(),
                allocationAPI.getAvailableFaculty(),
                allocationAPI.student.getPreferences(),
                allocationAPI.student.getDemand()
            ]);

            setConfig(configRes.data);
            setFacultyList(facultyRes.data || []);
            setGroupInfo(prefsRes.data?.group);
            setProjectInfo(prefsRes.data?.project);
            setDemand(demandRes.data?.totalDemand || {});

            if (prefsRes.data?.preferences?.length > 0) {
                const existing = prefsRes.data.preferences.map(p => ({
                    _id: p.faculty._id || p.faculty,
                    fullName: p.faculty.fullName || 'Unknown',
                    facultyId: p.faculty.facultyId || '',
                    department: p.faculty.department || '',
                    prefix: p.faculty.prefix || '',
                    priority: p.priority
                }));
                setSelectedPrefs(existing);
                setExistingPrefs(existing);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load allocation data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Window status helpers
    const windowStatus = config?.windowStatus?.status || 'not_configured';
    const isWindowOpen = windowStatus === 'open';
    const minPrefs = config?.minPreferences || 3;
    const maxPrefs = config?.maxPreferences || 7;

    // Drag & Drop handlers
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
        const items = [...selectedPrefs];
        const [removed] = items.splice(draggedItem, 1);
        items.splice(dropIndex, 0, removed);
        setSelectedPrefs(items);
        setDraggedItem(null);
    };

    const addFacultyToPrefs = (faculty) => {
        if (selectedPrefs.length >= maxPrefs) {
            toast.error(`Maximum ${maxPrefs} preferences allowed`);
            return;
        }
        if (selectedPrefs.find(p => p._id === faculty._id)) {
            toast.error('Faculty already in your preferences');
            return;
        }
        setSelectedPrefs([...selectedPrefs, faculty]);
    };

    const removeFacultyFromPrefs = (facultyId) => {
        setSelectedPrefs(selectedPrefs.filter(p => p._id !== facultyId));
    };

    const handleSubmit = async () => {
        if (selectedPrefs.length < minPrefs) {
            toast.error(`Please select at least ${minPrefs} faculty preferences`);
            return;
        }
        setSubmitting(true);
        try {
            const preferences = selectedPrefs.map((p, idx) => ({
                faculty: p._id,
                priority: idx + 1
            }));
            await allocationAPI.student.submitPreferences(preferences);
            toast.success('Faculty preferences submitted successfully!');
            setExistingPrefs([...selectedPrefs]);
        } catch (error) {
            toast.error(error.message || 'Failed to submit preferences');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredFaculty = facultyList.filter(f => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return f.fullName.toLowerCase().includes(q) ||
            f.facultyId.toLowerCase().includes(q) ||
            f.department.toLowerCase().includes(q);
    });

    const availableFaculty = filteredFaculty.filter(
        f => !selectedPrefs.find(p => p._id === f._id)
    );

    // Status badge for allocation result
    if (config?.allocationConfirmed) {
        return <AllocationResult />;
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Loading allocation data...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Faculty Preference Submission</h1>
                            <p className="text-sm text-slate-400">
                                {groupInfo ? `Group: ${groupInfo.name}` : 'Rank your preferred faculty mentors'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Window Status Banner */}
                <WindowStatusBanner status={windowStatus} config={config} />

                {!groupInfo ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-6">
                        <p className="text-amber-300 font-medium">⚠️ You must be in a finalized group to submit preferences.</p>
                        <p className="text-amber-400/70 text-sm mt-1">Please finalize your group first from the Group Dashboard.</p>
                    </div>
                ) : !projectInfo ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-6">
                        <p className="text-amber-300 font-medium">⚠️ Project Registration Required</p>
                        <p className="text-amber-400/70 text-sm mt-1">You must register your project before submitting faculty preferences.</p>
                        <div className="mt-4">
                            <Link to="/student/sem5/register" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/50 rounded-lg text-sm hover:bg-amber-500/30 transition-colors">
                                Register Project Now
                            </Link>
                        </div>
                    </div>
                ) : null}

                {groupInfo && projectInfo && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Available Faculty */}
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-700/50">
                                <h2 className="text-lg font-semibold text-white mb-3">Available Faculty</h2>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search faculty by name, ID, or department..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-slate-800/80 text-white border border-slate-600/50 rounded-xl px-4 py-2.5 pl-10 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>
                            </div>
                            <div className="max-h-[550px] overflow-y-auto p-3 space-y-2">
                                {availableFaculty.length === 0 ? (
                                    <p className="text-slate-500 text-sm text-center p-6">
                                        {searchQuery ? 'No matching faculty found' : 'All faculty have been selected'}
                                    </p>
                                ) : (
                                    availableFaculty.map(faculty => (
                                        <div key={faculty._id}
                                            className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 hover:border-indigo-500/30 rounded-xl p-4 transition-all duration-200 cursor-pointer"
                                            onClick={() => isWindowOpen && addFacultyToPrefs(faculty)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-medium text-sm">{faculty.prefix} {faculty.fullName}</span>
                                                        <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">{faculty.department}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1">{faculty.facultyId} • {faculty.designation}</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {demand[faculty._id] > 0 && (
                                                        <div className="flex items-center gap-1">
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${demand[faculty._id] > 8 ? 'bg-red-500/20 text-red-300' :
                                                                demand[faculty._id] > 4 ? 'bg-amber-500/20 text-amber-300' :
                                                                    'bg-green-500/20 text-green-300'
                                                                }`}>
                                                                🔥 {demand[faculty._id]} groups
                                                            </span>
                                                        </div>
                                                    )}
                                                    {isWindowOpen && (
                                                        <button className="opacity-0 group-hover:opacity-100 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 rounded-lg p-1.5 transition-all">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right: Selected Preferences (Drag & Drop) */}
                        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl backdrop-blur-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-700/50">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-white">
                                        Your Rankings
                                        <span className="text-sm font-normal text-slate-400 ml-2">
                                            ({selectedPrefs.length}/{maxPrefs})
                                        </span>
                                    </h2>
                                    {selectedPrefs.length >= minPrefs && (
                                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full">
                                            ✓ Minimum met
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    Drag to reorder. Position 1 = highest preference. Min: {minPrefs}, Max: {maxPrefs}
                                </p>
                            </div>
                            <div className="p-3 space-y-2 min-h-[200px] max-h-[450px] overflow-y-auto">
                                {selectedPrefs.length === 0 ? (
                                    <div className="text-center p-10">
                                        <div className="text-4xl mb-3">📋</div>
                                        <p className="text-slate-400 text-sm">Click on faculty from the left to add them here</p>
                                    </div>
                                ) : (
                                    selectedPrefs.map((pref, index) => (
                                        <div
                                            key={pref._id}
                                            draggable={isWindowOpen}
                                            onDragStart={e => handleDragStart(e, index)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDrop={e => handleDrop(e, index)}
                                            className={`flex items-center gap-3 bg-slate-800/60 border rounded-xl p-3.5 transition-all duration-200 ${draggedItem === index ? 'border-indigo-400/60 bg-indigo-900/20 scale-[0.98]' : 'border-slate-700/40 hover:border-slate-600/60'
                                                } ${isWindowOpen ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                        >
                                            {/* Rank Number */}
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/25' :
                                                index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800' :
                                                    index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white' :
                                                        'bg-slate-700/80 text-slate-300'
                                                }`}>
                                                {index + 1}
                                            </div>

                                            {/* Drag Handle */}
                                            {isWindowOpen && (
                                                <div className="text-slate-500 cursor-grab">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                                                </div>
                                            )}

                                            {/* Faculty Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate">{pref.prefix} {pref.fullName}</p>
                                                <p className="text-xs text-slate-400">{pref.department} • {pref.facultyId}</p>
                                            </div>

                                            {/* Remove Button */}
                                            {isWindowOpen && (
                                                <button
                                                    onClick={() => removeFacultyFromPrefs(pref._id)}
                                                    className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Submit Button */}
                            {isWindowOpen && groupInfo && (
                                <div className="p-5 border-t border-slate-700/50">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting || selectedPrefs.length < minPrefs}
                                        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${selectedPrefs.length >= minPrefs
                                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                                            : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {submitting ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Submitting...
                                            </span>
                                        ) : existingPrefs.length > 0 ? (
                                            '✏️ Update Preferences'
                                        ) : (
                                            '📨 Submit Preferences'
                                        )}
                                    </button>
                                    {selectedPrefs.length < minPrefs && (
                                        <p className="text-xs text-amber-400/70 text-center mt-2">
                                            Select {minPrefs - selectedPrefs.length} more faculty to submit
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

// ============================
// Sub-components
// ============================

const WindowStatusBanner = ({ status, config }) => {
    const bannerConfig = {
        not_configured: { bg: 'bg-slate-500/10 border-slate-500/30', text: 'text-slate-300', icon: '⏳', msg: 'Preference submission window has not been configured yet.' },
        upcoming: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-300', icon: '📅', msg: `Window opens on ${config?.windowStatus?.start ? new Date(config.windowStatus.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}` },
        open: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-300', icon: '✅', msg: `Window open until ${config?.windowStatus?.end ? new Date(config.windowStatus.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'TBD'}` },
        closed: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-300', icon: '🔒', msg: 'Preference submission window has closed.' }
    };
    const b = bannerConfig[status] || bannerConfig.not_configured;

    return (
        <div className={`${b.bg} border rounded-xl p-4 mb-6`}>
            <p className={`${b.text} font-medium text-sm`}>{b.icon} {b.msg}</p>
        </div>
    );
};

const AllocationResult = () => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResult = async () => {
            try {
                const res = await allocationAPI.student.getStatus();
                setResult(res.data);
            } catch (error) {
                console.error('Error loading result:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchResult();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-8">
            <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl backdrop-blur-xl p-8 max-w-md w-full text-center">
                {result?.status === 'allocated' ? (
                    <>
                        <div className="text-5xl mb-4">🎉</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Faculty Allocated!</h2>
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                            <p className="text-emerald-300 font-semibold text-lg">
                                {result.faculty?.prefix} {result.faculty?.fullName}
                            </p>
                            <p className="text-emerald-400/70 text-sm mt-1">{result.faculty?.department} • {result.faculty?.facultyId}</p>
                            {result.preferenceRank && (
                                <p className="text-slate-400 text-xs mt-2">Matched as your #{result.preferenceRank} preference</p>
                            )}
                            {result.allocatedBy === 'admin' && (
                                <p className="text-amber-400/80 text-xs mt-1">Assigned by admin</p>
                            )}
                        </div>
                    </>
                ) : result?.status === 'admin_pool' ? (
                    <>
                        <div className="text-5xl mb-4">⏳</div>
                        <h2 className="text-xl font-bold text-white mb-2">Under Review</h2>
                        <p className="text-slate-400 text-sm">{result.message}</p>
                    </>
                ) : (
                    <>
                        <div className="text-5xl mb-4">🕐</div>
                        <h2 className="text-xl font-bold text-white mb-2">Allocation In Progress</h2>
                        <p className="text-slate-400 text-sm">Please wait — results will be published soon.</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default GroupPreferenceSubmission;
