import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth, API } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Download, ScrollText, Search } from 'lucide-react';
import { format } from 'date-fns';
import { getErrorMessage } from '@/lib/utils';

/** Embeddable activity/data log - used as an Analytics tab. */
export const ActivityLogTab = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [exporting, setExporting] = useState(false);
    const [expanded, setExpanded] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API}/activity/tasks`, { params: { limit: 500 } });
            setRows(res.data.tasks || []);
        } catch (e) {
            toast.error(getErrorMessage(e, 'Failed to load activity log'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) =>
            [r.title, r.description, r.assigner_name, r.assignee_name, r.assignee_email, r.status, r.chatter_log, r.reminders_log]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [rows, query]);

    const downloadCsv = async () => {
        setExporting(true);
        try {
            const res = await axios.get(`${API}/activity/export`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `tskflow-activity-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('CSV downloaded');
        } catch (e) {
            toast.error(getErrorMessage(e, 'Export failed'));
        } finally {
            setExporting(false);
        }
    };

    const fmt = (iso) => {
        if (!iso) return ' - ';
        try { return format(new Date(iso), 'MMM d, yyyy h:mm a'); } catch { return iso; }
    };

    return (
        <Card className="border-2 shadow-soft rounded-2xl" data-testid="activity-log-panel">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-2xl" style={{ fontFamily: 'Outfit' }}>
                            <ScrollText className="w-5 h-5 text-teal-700" />
                            Activity & data log
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Assigner, assignee, times, reminders, chatter - viewable and exportable
                            {user?.company_domain ? ` · ${user.company_domain}` : ''}
                        </CardDescription>
                    </div>
                    <Button onClick={downloadCsv} disabled={exporting} className="rounded-full shrink-0" data-testid="activity-export-csv">
                        <Download className="w-4 h-4 mr-2" />
                        {exporting ? 'Exporting…' : 'Export CSV'}
                    </Button>
                </div>
                <div className="relative mt-3">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search title, assignee, chatter…"
                        className="pl-9 rounded-full"
                        data-testid="activity-search"
                    />
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
                ) : filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No tasks in the log yet.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm" data-testid="activity-table">
                            <thead className="bg-slate-50 text-left">
                                <tr className="border-b">
                                    <th className="px-3 py-2 font-medium">Task</th>
                                    <th className="px-3 py-2 font-medium">Assigner</th>
                                    <th className="px-3 py-2 font-medium">Assignee</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Created</th>
                                    <th className="px-3 py-2 font-medium">Completed</th>
                                    <th className="px-3 py-2 font-medium">Reminders</th>
                                    <th className="px-3 py-2 font-medium">Chatter</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r) => (
                                    <React.Fragment key={r.task_id}>
                                        <tr
                                            className="border-b hover:bg-teal-50/40 cursor-pointer"
                                            onClick={() => setExpanded(expanded === r.task_id ? null : r.task_id)}
                                            data-testid={`activity-row-${r.task_id}`}
                                        >
                                            <td className="px-3 py-2 max-w-[220px]">
                                                <button
                                                    type="button"
                                                    className="font-medium text-teal-800 hover:underline text-left truncate block max-w-full"
                                                    onClick={(e) => { e.stopPropagation(); navigate(`/task/${r.task_id}`); }}
                                                >
                                                    {r.title || '(untitled)'}
                                                </button>
                                                {r.priority && <Badge variant="outline" className="mt-1 text-[10px]">{r.priority}</Badge>}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{r.assigner_name || ' - '}</td>
                                            <td className="px-3 py-2">
                                                <div className="truncate max-w-[140px]">{r.assignee_name || ' - '}</div>
                                                <div className="text-xs text-muted-foreground truncate max-w-[140px]">{r.assignee_email}</div>
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{r.status || ' - '}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-xs">{fmt(r.created_at)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-xs">{fmt(r.completed_at)}</td>
                                            <td className="px-3 py-2">{r.reminders_sent_count || 0}</td>
                                            <td className="px-3 py-2">{r.chatter_count || 0}</td>
                                        </tr>
                                        {expanded === r.task_id && (
                                            <tr className="bg-slate-50/80 border-b" data-testid={`activity-detail-${r.task_id}`}>
                                                <td colSpan={8} className="px-4 py-3 space-y-2">
                                                    {r.description && (
                                                        <p className="text-sm"><span className="font-medium">Description:</span> {r.description}</p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        Due {fmt(r.due_date)} · Accepted {fmt(r.accepted_at)} · Last reminder {fmt(r.last_smart_reminder_sent)}
                                                    </p>
                                                    {r.reminders_log && (
                                                        <div>
                                                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">Reminders</p>
                                                            <p className="text-xs whitespace-pre-wrap text-slate-700">{r.reminders_log}</p>
                                                        </div>
                                                    )}
                                                    {r.chatter_log && (
                                                        <div>
                                                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-1">Chatter</p>
                                                            <p className="text-xs whitespace-pre-wrap text-slate-700">{r.chatter_log}</p>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">{filtered.length} row{filtered.length === 1 ? '' : 's'}</p>
            </CardContent>
        </Card>
    );
};

/** Legacy route - redirect into Analytics Activity Log tab. */
const ActivityLogPage = () => <Navigate to="/analytics?section=activity" replace />;

export default ActivityLogPage;
