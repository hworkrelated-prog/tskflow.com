import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Trophy, Users } from 'lucide-react';

// YYYY-MM-DD in local time (no TZ drift)
const toDateStr = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const usePresets = () => useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
    const startOfLastWeek = new Date(today); startOfLastWeek.setDate(today.getDate() - 14);
    const endOfLastWeek = new Date(today); endOfLastWeek.setDate(today.getDate() - 7);
    return {
        thisMonth: { label: 'This Month', start: toDateStr(startOfMonth), end: toDateStr(endOfMonth) },
        lastMonth: { label: 'Last Month', start: toDateStr(startOfLastMonth), end: toDateStr(endOfLastMonth) },
        thisWeek: { label: 'This Week', start: toDateStr(oneWeekAgo), end: toDateStr(today) },
        lastWeek: { label: 'Last Week', start: toDateStr(startOfLastWeek), end: toDateStr(endOfLastWeek) },
    };
}, []);

const FilterBar = ({ presets, activeKey, onPreset, custom, setCustom }) => {
    const [moreOpen, setMoreOpen] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-2">
            {['thisMonth', 'lastMonth'].map((k) => (
                <button key={k} type="button" onClick={() => onPreset(k)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border ${activeKey === k ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-teal-300'}`}>
                    {presets[k].label}
                </button>
            ))}
            <div className="relative">
                <button type="button" onClick={() => setMoreOpen((v) => !v)} className="px-3 py-1.5 rounded-full text-sm font-medium border bg-white border-gray-200 text-gray-700 hover:border-teal-300">More \u25be</button>
                {moreOpen && (
                    <div className="absolute z-20 mt-2 bg-white border rounded-xl shadow-lg p-2 w-56 space-y-1">
                        {['thisWeek', 'lastWeek'].map((k) => (
                            <button key={k} onClick={() => { onPreset(k); setMoreOpen(false); }}
                                className={`w-full text-left px-3 py-1.5 rounded text-sm ${activeKey === k ? 'bg-teal-50 text-teal-800' : 'hover:bg-gray-50'}`}>
                                {presets[k].label}
                            </button>
                        ))}
                        <div className="px-3 py-2 space-y-2 border-t mt-1">
                            <div className="text-xs text-gray-500">Custom range</div>
                            <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
                            <input type="date" className="w-full border rounded px-2 py-1 text-sm" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
                            <button onClick={() => { onPreset('custom'); setMoreOpen(false); }}
                                className="w-full mt-1 px-3 py-1.5 bg-teal-600 text-white rounded text-sm">Apply</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const LeaderboardTable = ({ rows, orgMode }) => (
    <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
                <tr>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Person</th>
                    <th className="text-left px-3 py-2 font-medium">Completed</th>
                    <th className="text-left px-3 py-2 font-medium">Avg completion</th>
                    <th className="text-left px-3 py-2 font-medium">Avg response</th>
                    {orgMode && <th className="text-left px-3 py-2 font-medium">Performance</th>}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && (<tr><td colSpan="6" className="px-3 py-8 text-center text-gray-500">No data yet for this range.</td></tr>)}
                {rows.map((r) => (
                    <tr key={r.user_id} className="border-t">
                        <td className="px-3 py-2 font-mono">{r.rank}</td>
                        <td className="px-3 py-2">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-gray-500">{r.email}</div>
                        </td>
                        <td className="px-3 py-2">{r.completed}</td>
                        <td className="px-3 py-2">{r.avg_completion_hours != null ? `${r.avg_completion_hours}h` : '\u2014'}</td>
                        <td className="px-3 py-2">{r.avg_response_hours != null ? `${r.avg_response_hours}h` : '\u2014'}</td>
                        {orgMode && <td className="px-3 py-2 font-semibold text-teal-700">{r.performance_score}</td>}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const LeaderboardPage = () => {
    const navigate = useNavigate();
    const presets = usePresets();
    const [tab, setTab] = useState('personal');
    const [personal, setPersonal] = useState([]);
    const [org, setOrg] = useState([]);
    const [activeKey, setActiveKey] = useState('thisMonth');
    const [custom, setCustom] = useState({ start: presets.thisMonth.start, end: presets.thisMonth.end });

    const currentRange = activeKey === 'custom' ? custom : presets[activeKey];

    const fetchAll = async (range) => {
        try {
            const [p, o] = await Promise.all([
                axios.get(`${API}/leaderboard/personal`, { params: { start_date: range.start, end_date: range.end } }),
                axios.get(`${API}/leaderboard/org`, { params: { start_date: range.start, end_date: range.end } }),
            ]);
            setPersonal(p.data.leaderboard || []);
            setOrg(o.data.leaderboard || []);
        } catch (_) { /* silent */ }
    };

    useEffect(() => { fetchAll(currentRange); /* eslint-disable-next-line */ }, [activeKey]);

    const onPreset = (key) => {
        setActiveKey(key);
        if (key !== 'custom') {
            setCustom({ start: presets[key].start, end: presets[key].end });
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="border-b bg-white sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
                    <div className="flex items-center gap-2">
                        <Trophy className="w-6 h-6 text-amber-500" />
                        <h1 className="text-2xl font-semibold">Leaderboards</h1>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-6 py-8 max-w-5xl">
                <div className="flex items-center gap-2 mb-4">
                    <button onClick={() => setTab('personal')} className={`px-4 py-2 rounded-full text-sm font-medium ${tab === 'personal' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200'}`}>Personal</button>
                    <button onClick={() => setTab('org')} className={`px-4 py-2 rounded-full text-sm font-medium ${tab === 'org' ? 'bg-teal-600 text-white' : 'bg-white border border-gray-200'}`}><Users className="w-4 h-4 inline mr-1" /> Organization</button>
                </div>
                <Card className="border-2 rounded-2xl">
                    <CardContent className="pt-6">
                        <div className="mb-4">
                            <FilterBar presets={presets} activeKey={activeKey} onPreset={onPreset} custom={custom} setCustom={setCustom} />
                        </div>
                        {tab === 'personal' ? (
                            <>
                                <p className="text-sm text-muted-foreground mb-3">People you&apos;ve assigned tasks to, ranked by how quickly they get things done (across all revision rounds).</p>
                                <LeaderboardTable rows={personal} orgMode={false} />
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-muted-foreground mb-3">Everyone in your organization, ranked by an overall performance score.</p>
                                <LeaderboardTable rows={org} orgMode={true} />
                            </>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    );
};

export default LeaderboardPage;
