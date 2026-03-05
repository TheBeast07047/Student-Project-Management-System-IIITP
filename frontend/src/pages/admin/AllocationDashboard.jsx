import React, { useState, useEffect, useCallback } from 'react';
import { allocationAPI } from '../../utils/api';
import { toast } from 'react-hot-toast';

const AllocationDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState(null);
    const [stats, setStats] = useState(null);
    const [latestRun, setLatestRun] = useState(null);
    const [windowStatus, setWindowStatus] = useState({});
    const [results, setResults] = useState(null);
    const [facultyCapacity, setFacultyCapacity] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [actionLoading, setActionLoading] = useState('');

    // Config edit state
    const [editConfig, setEditConfig] = useState({});
    const [showConfigEditor, setShowConfigEditor] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [configRes, capacityRes] = await Promise.all([
                allocationAPI.admin.getConfig(),
                allocationAPI.admin.getFacultyCapacity()
            ]);

            const d = configRes.data;
            setConfig(d.config);
            setStats(d.statistics);
            setLatestRun(d.latestRun);
            setWindowStatus(d.windowStatus);
            setEditConfig(d.config);
            setFacultyCapacity(capacityRes.data || []);

            // Load results if run exists
            if (d.latestRun && (d.latestRun.status === 'preview' || d.latestRun.status === 'confirmed')) {
                const resultsRes = await allocationAPI.admin.getResults();
                setResults(resultsRes.data);
            }
        } catch (error) {
            console.error('Error:', error);
            toast.error('Failed to load allocation data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Actions
    const handleSaveConfig = async () => {
        setActionLoading('config');
        try {
            await allocationAPI.admin.updateConfig(editConfig);
            toast.success('Configuration saved');
            setShowConfigEditor(false);
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleValidate = async () => {
        setActionLoading('validate');
        try {
            const res = await allocationAPI.admin.validate({ semester: 5 });
            toast.success(`Validation complete: ${res.data.validGroups} valid groups`);
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleRunAlgorithm = async () => {
        if (!window.confirm('Run the Gale-Shapley algorithm? This will generate allocation results in preview mode.')) return;
        setActionLoading('run');
        try {
            const res = await allocationAPI.admin.run({ semester: 5 });
            toast.success(res.message);
            await fetchData();
            setActiveTab('results');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleConfirm = async () => {
        if (!window.confirm('⚠️ Confirm and publish results? This action cannot be undone. All students and faculty will be notified.')) return;
        setActionLoading('confirm');
        try {
            await allocationAPI.admin.confirm(latestRun._id);
            toast.success('Results confirmed and published!');
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Reset the current run? This will clear all preview results.')) return;
        setActionLoading('reset');
        try {
            await allocationAPI.admin.reset(latestRun._id);
            toast.success('Run reset. You can now re-run the algorithm.');
            setResults(null);
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleAssignPool = async (groupId, facultyId) => {
        setActionLoading(`assign-${groupId}`);
        try {
            await allocationAPI.admin.assignAdminPoolGroup(groupId, facultyId, latestRun._id);
            toast.success('Faculty assigned to group');
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setActionLoading('');
        }
    };

    const handleUpdateCapacity = async (facultyId, capacity) => {
        try {
            await allocationAPI.admin.updateFacultyCapacity(facultyId, parseInt(capacity));
            toast.success('Capacity updated');
            await fetchData();
        } catch (error) {
            toast.error(error.message);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-400 text-sm">Loading allocation dashboard...</p>
                </div>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📊' },
        { id: 'config', label: 'Configuration', icon: '⚙️' },
        { id: 'algorithm', label: 'Algorithm', icon: '🧮' },
        { id: 'results', label: 'Results', icon: '📋' },
        { id: 'adminpool', label: 'Admin Pool', icon: '👥' },
        { id: 'capacity', label: 'Faculty Capacity', icon: '🏫' }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Faculty Allocation — Gale-Shapley</h1>
                            <p className="text-sm text-slate-400">Semester 5 • Automated stable matching</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-1 mb-6 bg-slate-900/60 border border-slate-700/50 rounded-xl p-1 backdrop-blur-xl">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-blue-600/30 text-blue-300 shadow-lg'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                }`}
                        >
                            <span>{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                {activeTab === 'overview' && <OverviewTab stats={stats} latestRun={latestRun} windowStatus={windowStatus} />}
                {activeTab === 'config' && (
                    <ConfigTab
                        config={config}
                        editConfig={editConfig}
                        setEditConfig={setEditConfig}
                        showEditor={showConfigEditor}
                        setShowEditor={setShowConfigEditor}
                        onSave={handleSaveConfig}
                        loading={actionLoading === 'config'}
                    />
                )}
                {activeTab === 'algorithm' && (
                    <AlgorithmTab
                        latestRun={latestRun}
                        onValidate={handleValidate}
                        onRun={handleRunAlgorithm}
                        onConfirm={handleConfirm}
                        onReset={handleReset}
                        loading={actionLoading}
                    />
                )}
                {activeTab === 'results' && <ResultsTab results={results} />}
                {activeTab === 'adminpool' && (
                    <AdminPoolTab
                        results={results}
                        facultyCapacity={facultyCapacity}
                        onAssign={handleAssignPool}
                        loading={actionLoading}
                    />
                )}
                {activeTab === 'capacity' && (
                    <CapacityTab
                        faculty={facultyCapacity}
                        onUpdateCapacity={handleUpdateCapacity}
                    />
                )}
            </div>
        </div>
    );
};

// ===========================================================
// Sub-components (Tabs)
// ===========================================================

const StatCard = ({ label, value, sub, color = 'blue' }) => {
    const colors = {
        blue: 'from-blue-500 to-cyan-500',
        green: 'from-emerald-500 to-teal-500',
        amber: 'from-amber-500 to-orange-500',
        red: 'from-red-500 to-pink-500',
        purple: 'from-purple-500 to-violet-500'
    };
    return (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-5">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-3xl font-bold bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
    );
};

const OverviewTab = ({ stats, latestRun, windowStatus }) => (
    <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Groups" value={stats?.totalGroups || 0} color="blue" />
            <StatCard label="Total Capacity" value={stats?.totalCapacity || 0} sub={`${stats?.totalFaculty || 0} faculty`} color="green" />
            <StatCard label="Preferences Submitted" value={stats?.groupPrefsSubmitted || 0} color="purple" />
            <StatCard label="Faculty Rankings" value={stats?.facultyRankingsSubmitted || 0} color="amber" />
        </div>

        {/* Capacity Warning */}
        {stats?.capacityDeficit > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-amber-300 font-medium text-sm">
                    ⚠️ Capacity shortage: {stats.totalGroups} groups but only {stats.totalCapacity} slots.
                    At least {stats.capacityDeficit} group(s) will need manual allocation.
                </p>
            </div>
        )}

        {/* Window Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WindowCard title="Group Preference Window" status={windowStatus?.groupPreference} />
            <WindowCard title="Faculty Ranking Window" status={windowStatus?.facultyRanking} />
        </div>

        {/* Latest Run */}
        {latestRun && (
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">Latest Algorithm Run</h3>
                <div className="flex flex-wrap gap-4">
                    <RunBadge label="Status" value={latestRun.status} />
                    <RunBadge label="Matched" value={`${latestRun.matchedGroups}/${latestRun.totalGroups}`} />
                    <RunBadge label="Admin Pool" value={latestRun.adminPoolGroups} />
                    <RunBadge label="Rounds" value={latestRun.totalRounds} />
                    {latestRun.runAt && <RunBadge label="Run At" value={new Date(latestRun.runAt).toLocaleString('en-IN')} />}
                </div>
            </div>
        )}
    </div>
);

const WindowCard = ({ title, status }) => {
    const statusColors = {
        open: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        closed: 'bg-red-500/20 text-red-300 border-red-500/30',
        upcoming: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        not_configured: 'bg-slate-500/20 text-slate-300 border-slate-500/30'
    };
    const s = status?.status || 'not_configured';
    return (
        <div className={`border rounded-xl p-4 ${statusColors[s]}`}>
            <p className="font-medium text-sm mb-1">{title}</p>
            <p className="text-xs capitalize">{s.replace('_', ' ')}</p>
            {status?.start && (
                <p className="text-xs opacity-70 mt-1">
                    {new Date(status.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} —{' '}
                    {new Date(status.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
            )}
        </div>
    );
};

const RunBadge = ({ label, value }) => (
    <div className="bg-slate-800/60 rounded-lg px-3 py-2">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-white font-medium capitalize">{value}</p>
    </div>
);

const ConfigTab = ({ config, editConfig, setEditConfig, showEditor, setShowEditor, onSave, loading }) => (
    <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Allocation Configuration</h3>
            <button
                onClick={() => setShowEditor(!showEditor)}
                className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
                {showEditor ? 'Cancel' : '✏️ Edit'}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConfigField label="Min Group Preferences" value={editConfig.minGroupPreferences} field="minGroupPreferences" type="number" editable={showEditor} onChange={v => setEditConfig({ ...editConfig, minGroupPreferences: parseInt(v) })} />
            <ConfigField label="Max Group Preferences" value={editConfig.maxGroupPreferences} field="maxGroupPreferences" type="number" editable={showEditor} onChange={v => setEditConfig({ ...editConfig, maxGroupPreferences: parseInt(v) })} />
            <ConfigField label="Default Faculty Capacity" value={editConfig.defaultFacultyCapacity} field="defaultFacultyCapacity" type="number" editable={showEditor} onChange={v => setEditConfig({ ...editConfig, defaultFacultyCapacity: parseInt(v) })} />
            <ConfigField label="Tiebreak Method" value={editConfig.tiebreakMethod} field="tiebreakMethod" type="select" options={['timestamp', 'random', 'alphabetical']} editable={showEditor} onChange={v => setEditConfig({ ...editConfig, tiebreakMethod: v })} />

            <div className="md:col-span-2">
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Group Preference Window</p>
                <div className="grid grid-cols-2 gap-3">
                    <DateField label="Start" value={editConfig.groupPreferenceWindow?.start} editable={showEditor}
                        onChange={v => setEditConfig({ ...editConfig, groupPreferenceWindow: { ...editConfig.groupPreferenceWindow, start: v } })} />
                    <DateField label="End" value={editConfig.groupPreferenceWindow?.end} editable={showEditor}
                        onChange={v => setEditConfig({ ...editConfig, groupPreferenceWindow: { ...editConfig.groupPreferenceWindow, end: v } })} />
                </div>
            </div>

            <div className="md:col-span-2">
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Faculty Ranking Window</p>
                <div className="grid grid-cols-2 gap-3">
                    <DateField label="Start" value={editConfig.facultyRankingWindow?.start} editable={showEditor}
                        onChange={v => setEditConfig({ ...editConfig, facultyRankingWindow: { ...editConfig.facultyRankingWindow, start: v } })} />
                    <DateField label="End" value={editConfig.facultyRankingWindow?.end} editable={showEditor}
                        onChange={v => setEditConfig({ ...editConfig, facultyRankingWindow: { ...editConfig.facultyRankingWindow, end: v } })} />
                </div>
            </div>
        </div>

        {showEditor && (
            <div className="mt-6 flex justify-end">
                <button
                    onClick={onSave}
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/25"
                >
                    {loading ? 'Saving...' : '💾 Save Configuration'}
                </button>
            </div>
        )}
    </div>
);

const ConfigField = ({ label, value, editable, onChange, type = 'text', options = [] }) => (
    <div>
        <p className="text-xs text-slate-400 mb-1">{label}</p>
        {editable ? (
            type === 'select' ? (
                <select value={value || ''} onChange={e => onChange(e.target.value)}
                    className="w-full bg-slate-800 text-white border border-slate-600/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50">
                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            ) : (
                <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
                    className="w-full bg-slate-800 text-white border border-slate-600/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50" />
            )
        ) : (
            <p className="text-white text-sm bg-slate-800/50 rounded-lg px-3 py-2">{String(value ?? 'Not set')}</p>
        )}
    </div>
);

const DateField = ({ label, value, editable, onChange }) => (
    <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        {editable ? (
            <input type="datetime-local" value={value ? new Date(value).toISOString().slice(0, 16) : ''}
                onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="w-full bg-slate-800 text-white border border-slate-600/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50" />
        ) : (
            <p className="text-white text-sm bg-slate-800/50 rounded-lg px-3 py-2">
                {value ? new Date(value).toLocaleString('en-IN') : 'Not set'}
            </p>
        )}
    </div>
);

const AlgorithmTab = ({ latestRun, onValidate, onRun, onConfirm, onReset, loading }) => {
    const status = latestRun?.status || 'not_run';
    return (
        <div className="space-y-6">
            {/* Pipeline Steps */}
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6">Algorithm Pipeline</h3>
                <div className="space-y-4">
                    <PipelineStep
                        step={1} title="Validate Pre-Conditions"
                        desc="Check group validity, preference submissions, and capacity"
                        action={<ActionButton label="Run Validation" onClick={onValidate} loading={loading === 'validate'} color="blue" />}
                        completed={latestRun?.validationReport}
                    />
                    <PipelineStep
                        step={2} title="Execute Gale-Shapley Algorithm"
                        desc="Run the stable matching algorithm to find optimal allocation"
                        action={
                            <ActionButton
                                label={status === 'preview' ? 'Re-Run Algorithm' : 'Run Algorithm'}
                                onClick={onRun}
                                loading={loading === 'run'}
                                color="purple"
                                disabled={status === 'confirmed'}
                            />
                        }
                        completed={status === 'preview' || status === 'confirmed'}
                    />
                    <PipelineStep
                        step={3} title="Review & Confirm Results"
                        desc="Review allocation results and publish to all users"
                        action={
                            <div className="flex gap-2">
                                {status === 'preview' && (
                                    <>
                                        <ActionButton label="✅ Confirm & Publish" onClick={onConfirm} loading={loading === 'confirm'} color="green" />
                                        <ActionButton label="🔄 Reset" onClick={onReset} loading={loading === 'reset'} color="red" />
                                    </>
                                )}
                                {status === 'confirmed' && <span className="text-emerald-400 text-sm font-medium">✅ Confirmed</span>}
                            </div>
                        }
                        completed={status === 'confirmed'}
                    />
                </div>
            </div>

            {/* Run Details */}
            {latestRun && latestRun.status !== 'not_run' && (
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-3">Run Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <RunBadge label="Status" value={latestRun.status} />
                        <RunBadge label="Total Groups" value={latestRun.totalGroups} />
                        <RunBadge label="Matched" value={latestRun.matchedGroups} />
                        <RunBadge label="Admin Pool" value={latestRun.adminPoolGroups} />
                        <RunBadge label="Rounds" value={latestRun.totalRounds} />
                    </div>
                </div>
            )}
        </div>
    );
};

const PipelineStep = ({ step, title, desc, action, completed }) => (
    <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${completed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/30 border-slate-700/30'
        }`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${completed ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}>{completed ? '✓' : step}</div>
        <div className="flex-1">
            <p className="text-white font-medium">{title}</p>
            <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
        <div className="flex-shrink-0">{action}</div>
    </div>
);

const ActionButton = ({ label, onClick, loading, color = 'blue', disabled = false }) => {
    const colors = {
        blue: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300',
        purple: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300',
        green: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300',
        red: 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
    };
    return (
        <button
            onClick={onClick}
            disabled={loading || disabled}
            className={`${colors[color]} px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            {loading ? '...' : label}
        </button>
    );
};

const ResultsTab = ({ results }) => {
    if (!results || !results.results || results.results.length === 0) {
        return (
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-12 text-center">
                <div className="text-5xl mb-4">📊</div>
                <h3 className="text-xl font-semibold text-white mb-2">No Results Yet</h3>
                <p className="text-slate-400 text-sm">Run the algorithm from the Algorithm tab to see results here.</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-700/40">
                <h3 className="text-lg font-semibold text-white">
                    Allocation Results
                    <span className="text-sm font-normal text-slate-400 ml-2">
                        ({results.matchedGroups} matched • {results.adminPoolGroups} admin pool)
                    </span>
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-700/40">
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">#</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Group</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Faculty</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Pref #</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Round</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Method</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.results.map((r, i) => (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <td className="py-3 px-4 text-sm text-slate-400">{i + 1}</td>
                                <td className="py-3 px-4 text-sm text-white font-medium">{r.group?.name || r.group}</td>
                                <td className="py-3 px-4 text-sm text-slate-200">
                                    {r.faculty?.fullName || r.faculty}
                                    {r.faculty?.department && <span className="text-slate-500 ml-1">({r.faculty.department})</span>}
                                </td>
                                <td className="py-3 px-4">
                                    {r.preferenceRank > 0 ? (
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.preferenceRank === 1 ? 'bg-emerald-500/20 text-emerald-300' :
                                                r.preferenceRank <= 3 ? 'bg-blue-500/20 text-blue-300' :
                                                    'bg-slate-600/40 text-slate-300'
                                            }`}>#{r.preferenceRank}</span>
                                    ) : <span className="text-slate-500 text-xs">—</span>}
                                </td>
                                <td className="py-3 px-4 text-sm text-slate-400">{r.matchedRound || '—'}</td>
                                <td className="py-3 px-4">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.allocatedBy === 'algorithm' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                                        }`}>{r.allocatedBy}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AdminPoolTab = ({ results, facultyCapacity, onAssign, loading }) => {
    const [selectedFaculty, setSelectedFaculty] = useState({});
    const pool = results?.adminPool || [];
    const unassigned = pool.filter(p => !p.assignedFaculty);
    const available = facultyCapacity.filter(f => f.remaining > 0);

    if (pool.length === 0) {
        return (
            <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-12 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-xl font-semibold text-white mb-2">No Admin Pool Groups</h3>
                <p className="text-slate-400 text-sm">All groups were matched by the algorithm, or no algorithm has been run yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {unassigned.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                    <p className="text-amber-300 font-medium text-sm">
                        ⚠️ {unassigned.length} group(s) need manual faculty assignment
                    </p>
                </div>
            )}

            {pool.map((entry, i) => (
                <div key={i} className={`bg-slate-900/60 border rounded-xl p-5 ${entry.assignedFaculty ? 'border-emerald-500/20' : 'border-slate-700/40'
                    }`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-white font-medium">{entry.group?.name || 'Unknown Group'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">Reason: {entry.reason?.replace('_', ' ')}</p>
                        </div>
                        {entry.assignedFaculty ? (
                            <div className="text-right">
                                <p className="text-emerald-300 text-sm font-medium">
                                    ✅ Assigned: {entry.assignedFaculty.fullName || entry.assignedFaculty}
                                </p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <select
                                    value={selectedFaculty[entry.group?._id || entry.group] || ''}
                                    onChange={e => setSelectedFaculty({ ...selectedFaculty, [entry.group?._id || entry.group]: e.target.value })}
                                    className="bg-slate-800 text-white border border-slate-600/50 rounded-lg px-3 py-2 text-sm"
                                >
                                    <option value="">Select Faculty...</option>
                                    {available.map(f => (
                                        <option key={f._id} value={f._id}>
                                            {f.fullName} ({f.department}) — {f.remaining} slots left
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        const facId = selectedFaculty[entry.group?._id || entry.group];
                                        if (facId) onAssign(entry.group?._id || entry.group, facId);
                                    }}
                                    disabled={!selectedFaculty[entry.group?._id || entry.group] || loading.startsWith?.('assign')}
                                    className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                                >
                                    Assign
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

const CapacityTab = ({ faculty, onUpdateCapacity }) => {
    return (
        <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-700/40">
                <h3 className="text-lg font-semibold text-white">Faculty Capacity Management</h3>
                <p className="text-xs text-slate-400 mt-1">Override per-faculty mentor capacity limits</p>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-slate-700/40">
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Faculty</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Department</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Capacity</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Assigned</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Remaining</th>
                            <th className="text-left text-xs text-slate-400 font-medium py-3 px-4">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {faculty.map(f => (
                            <CapacityRow key={f._id} faculty={f} onUpdate={onUpdateCapacity} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const CapacityRow = ({ faculty, onUpdate }) => {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(faculty.capacity);

    return (
        <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
            <td className="py-3 px-4 text-sm text-white font-medium">{faculty.fullName}</td>
            <td className="py-3 px-4 text-sm text-slate-400">{faculty.department}</td>
            <td className="py-3 px-4">
                {editing ? (
                    <input type="number" min="0" max="20" value={value} onChange={e => setValue(e.target.value)}
                        className="w-16 bg-slate-800 text-white border border-blue-500/50 rounded px-2 py-1 text-sm" />
                ) : (
                    <span className="text-sm text-white">{faculty.capacity}</span>
                )}
            </td>
            <td className="py-3 px-4 text-sm text-slate-400">{faculty.assigned}</td>
            <td className="py-3 px-4">
                <span className={`text-sm font-medium ${faculty.remaining > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {faculty.remaining}
                </span>
            </td>
            <td className="py-3 px-4">
                {editing ? (
                    <div className="flex gap-1">
                        <button onClick={() => { onUpdate(faculty._id, value); setEditing(false); }}
                            className="text-emerald-400 hover:text-emerald-300 text-xs px-2 py-1 bg-emerald-500/10 rounded">Save</button>
                        <button onClick={() => { setValue(faculty.capacity); setEditing(false); }}
                            className="text-slate-400 hover:text-slate-300 text-xs px-2 py-1 bg-slate-500/10 rounded">Cancel</button>
                    </div>
                ) : (
                    <button onClick={() => setEditing(true)}
                        className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 bg-blue-500/10 rounded">Edit</button>
                )}
            </td>
        </tr>
    );
};

export default AllocationDashboard;
