import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API, useAuth } from '@/App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Repeat, Trash2, CalendarClock, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isValid } from 'date-fns';
import { getErrorMessage } from '@/lib/utils';

const frequencyLabel = (rule) => {
    if (!rule) return '';
    const f = rule.frequency;
    if (f === 'daily') return 'Daily';
    if (f === 'weekdays') return 'Every weekday';
    if (f === 'weekly') return 'Weekly';
    if (f === 'biweekly') return 'Every 2 weeks';
    if (f === 'monthly') return 'Monthly';
    if (f === 'yearly') return 'Yearly';
    if (f === 'custom') return `Every ${rule.interval || 1} days`;
    return f;
};

const endLabel = (rule) => {
    if (!rule) return '';
    if (rule.end_type === 'on_date' && rule.end_date) return `until ${rule.end_date}`;
    if (rule.end_type === 'after_count' && rule.end_count) return `for ${rule.end_count} occurrences`;
    return 'never ends (until you stop it)';
};

const safeDate = (d) => {
    try {
        const dt = parseISO(d);
        if (!isValid(dt)) return d;
        return format(dt, 'MMM dd, yyyy • h:mm a');
    } catch { return d; }
};

const RecurringPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [occurrences, setOccurrences] = useState({}); // seriesId -> list

    const fetchSeries = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API}/recurring`);
            setSeries(res.data?.series || []);
        } catch (e) {
            toast.error(getErrorMessage(e, 'Failed to load recurring series'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSeries(); }, [fetchSeries]);

    const loadOccurrences = async (id) => {
        try {
            const res = await axios.get(`${API}/recurring/${id}/occurrences`);
            setOccurrences((o) => ({ ...o, [id]: res.data?.occurrences || [] }));
        } catch (e) {
            toast.error('Could not load occurrences');
        }
    };

    const toggle = (id) => {
        if (expanded === id) { setExpanded(null); return; }
        setExpanded(id);
        if (!occurrences[id]) loadOccurrences(id);
    };

    const deleteSeries = async (id) => {
        if (!window.confirm('Stop this recurring series? Upcoming (not-yet-completed) occurrences will be removed. Past completed ones stay.')) return;
        try {
            await axios.delete(`${API}/recurring/${id}`);
            toast.success('Series stopped');
            fetchSeries();
        } catch (e) {
            toast.error(getErrorMessage(e, 'Failed to delete'));
        }
    };

    const skipOccurrence = async (seriesId, occ) => {
        try {
            await axios.post(`${API}/recurring/${seriesId}/skip`, { occurrence_id: occ.id });
            toast.success('Skipped');
            loadOccurrences(seriesId);
            fetchSeries();
        } catch (e) {
            toast.error('Could not skip');
        }
    };

    return (
        <div className="page-shell">
            <header className="border-b bg-white">
                <div className="container mx-auto px-6 py-4 flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="rounded-full"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                            <Repeat className="w-6 h-6 text-teal-600" /> Recurring Series
                        </h1>
                        <p className="text-xs text-muted-foreground">Automate recurring commitments — daily standups, weekly reports, monthly reviews.</p>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8 max-w-4xl">
                {loading ? (
                    <p className="text-center text-muted-foreground py-16">Loading…</p>
                ) : series.length === 0 ? (
                    <Card className="rounded-2xl border-2 border-dashed">
                        <CardContent className="py-12 text-center">
                            <Repeat className="w-12 h-12 mx-auto text-teal-300 mb-4" />
                            <h3 className="font-semibold text-lg mb-1">No recurring series yet</h3>
                            <p className="text-sm text-muted-foreground mb-4">Turn a task into a series to have it repeat automatically.</p>
                            <Button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('tskflow:open-ai-create'));
                                    if (!window.location.pathname.includes('/dashboard')) navigate('/dashboard?create=1');
                                }}
                                className="rounded-full"
                            >
                                Create a task
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {series.map((s) => (
                            <Card key={s.id} className="rounded-2xl border">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <button onClick={() => toggle(s.id)} className="flex-1 text-left min-w-0">
                                            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Outfit' }}>
                                                <ChevronRight className={`w-4 h-4 transition-transform ${expanded === s.id ? 'rotate-90' : ''}`} />
                                                <span className="truncate">{s.title}</span>
                                            </CardTitle>
                                            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                                                <Badge variant="outline"><CalendarClock className="w-3 h-3 mr-1" />{frequencyLabel(s.recurrence)}</Badge>
                                                <span className="text-xs text-muted-foreground">{endLabel(s.recurrence)}</span>
                                                <span className="text-xs"><strong>{s.upcoming_count || 0}</strong> upcoming · <strong>{s.completed_count || 0}</strong> completed</span>
                                            </CardDescription>
                                        </button>
                                        <Button variant="ghost" size="sm" onClick={() => deleteSeries(s.id)} className="text-red-500 hover:bg-red-50 rounded-full">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                {expanded === s.id && (
                                    <CardContent>
                                        <div className="text-xs uppercase text-muted-foreground mb-2">Upcoming occurrences</div>
                                        <div className="space-y-2">
                                            {(occurrences[s.id] || []).filter(o => o.status !== 'Completed').slice(0, 20).map((o) => (
                                                <div key={o.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border">
                                                    <div className="min-w-0">
                                                        <p className="text-sm truncate">{safeDate(o.due_date)}</p>
                                                        <p className="text-xs text-muted-foreground">{o.status} · {o.priority}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <Button size="sm" variant="ghost" onClick={() => navigate(`/task/${o.id}`)} className="text-xs">Open</Button>
                                                        <Button size="sm" variant="ghost" onClick={() => skipOccurrence(s.id, o)} className="text-xs text-red-500">Skip</Button>
                                                    </div>
                                                </div>
                                            ))}
                                            {(occurrences[s.id] || []).filter(o => o.status !== 'Completed').length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-4">No upcoming occurrences — they’ll be generated automatically.</p>
                                            )}
                                        </div>
                                        <div className="text-xs uppercase text-muted-foreground mt-4 mb-2">Completed history</div>
                                        <div className="space-y-2">
                                            {(occurrences[s.id] || []).filter(o => o.status === 'Completed').slice(0, 20).map((o) => (
                                                <div key={o.id} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 opacity-90">
                                                    <div className="min-w-0">
                                                        <p className="text-sm truncate">{safeDate(o.due_date)}</p>
                                                        <p className="text-xs text-muted-foreground">Completed · {o.priority}</p>
                                                    </div>
                                                    <Button size="sm" variant="ghost" onClick={() => navigate(`/task/${o.id}`)} className="text-xs">Open</Button>
                                                </div>
                                            ))}
                                            {(occurrences[s.id] || []).filter(o => o.status === 'Completed').length === 0 && (
                                                <p className="text-xs text-muted-foreground py-2">None yet.</p>
                                            )}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default RecurringPage;
