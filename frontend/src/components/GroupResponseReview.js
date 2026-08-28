import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/App';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Clock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

const GroupResponseReview = ({ parentId, initialReview, isCreator, hasCriteria, onReview }) => {
    const [review, setReview] = useState(initialReview || null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setReview(initialReview || null);
    }, [initialReview]);

    const runReview = async () => {
        if (!parentId) return;
        setLoading(true);
        try {
            const res = await axios.post(`${API}/tasks/parents/${parentId}/ai-review`);
            setReview(res.data);
            onReview?.(res.data);
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not review responses'));
        } finally {
            setLoading(false);
        }
    };

    if (!isCreator) return null;

    const counts = review?.counts || {};
    const hasExpectations = review ? !!review.has_expectations : !!hasCriteria;

    return (
        <div className="mt-4 border-2 border-teal-200 rounded-2xl overflow-hidden bg-white" data-testid="group-response-review">
            <div className="px-4 py-3 bg-gradient-to-r from-teal-50 to-slate-50 border-b flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <p className="font-semibold text-teal-950 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-teal-700" />
                        Assistant review
                    </p>
                    <p className="text-xs text-teal-800/80 mt-0.5">
                        Reads every reply so you do not have to open {counts.total || 'each'} person.
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={runReview}
                    disabled={loading}
                    className="rounded-full h-8 px-3 text-xs bg-teal-800 hover:bg-teal-900"
                    data-testid="group-review-run"
                >
                    {loading ? (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Reading replies…</>
                    ) : (
                        <><Sparkles className="w-3.5 h-3.5 mr-1.5" />{review ? 'Refresh review' : 'Review all responses'}</>
                    )}
                </Button>
            </div>

            {!review && (
                <p className="px-4 py-4 text-sm text-slate-600">
                    Click Review all responses. The assistant checks notes, comments, blocks, and declines
                    {hasExpectations ? ' against what “done well” looks like' : ' and summarizes what people said'}.
                </p>
            )}

            {review && (
                <div className="px-4 py-4 space-y-4" data-testid="group-review-body">
                    <p className="text-sm font-medium text-slate-900 leading-relaxed">{review.headline}</p>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">{counts.submitted || 0} submitted</span>
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700">{counts.in_progress || 0} in progress</span>
                        <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-800">{counts.silent || 0} no reply</span>
                        {counts.blocked_or_declined > 0 && (
                            <span className="px-2 py-1 rounded-full bg-red-50 text-red-800">{counts.blocked_or_declined} blocked/declined</span>
                        )}
                        {hasExpectations && counts.looks_aligned != null && (
                            <span className="px-2 py-1 rounded-full bg-teal-50 text-teal-800">{counts.looks_aligned} look aligned</span>
                        )}
                    </div>

                    {!hasExpectations && (
                        <p className="text-xs text-slate-500 flex items-start gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            No written expectation was set, so this is a summary - not a grade. Add “Done well looks like” next time to check fit.
                        </p>
                    )}

                    {!!(review.themes || []).length && (
                        <ul className="space-y-1">
                            {review.themes.map((t, i) => (
                                <li key={i} className="text-sm text-slate-700 leading-relaxed">• {t}</li>
                            ))}
                        </ul>
                    )}

                    {!!(review.aligned || []).length && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-800 mb-1.5 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Looks aligned
                            </p>
                            <ul className="space-y-1">
                                {review.aligned.map((p, i) => (
                                    <li key={i} className="text-sm text-slate-700">
                                        <span className="font-medium">{p.name}</span>
                                        {p.why ? <span className="text-slate-500"> - {p.why}</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!!(review.needs_attention || []).length && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1.5 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Needs attention
                            </p>
                            <ul className="space-y-1">
                                {review.needs_attention.map((p, i) => (
                                    <li key={i} className="text-sm text-slate-700">
                                        <span className="font-medium">{p.name}</span>
                                        {p.why ? <span className="text-slate-500"> - {p.why}</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {!!(review.silent || []).length && (
                        <p className="text-sm text-slate-600 flex items-start gap-1.5">
                            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span><span className="font-medium text-slate-800">No reply yet:</span> {review.silent.join(', ')}</span>
                        </p>
                    )}

                    {!!(review.read_first || []).length && (
                        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Read these first</p>
                            <ul className="space-y-1">
                                {review.read_first.map((p, i) => (
                                    <li key={i} className="text-sm text-slate-700">
                                        <span className="font-medium">{p.name}</span>
                                        {p.reason ? <span className="text-slate-500"> - {p.reason}</span> : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {review.suggested_nudge && (
                        <p className="text-sm text-teal-900 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                            {review.suggested_nudge}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default GroupResponseReview;
