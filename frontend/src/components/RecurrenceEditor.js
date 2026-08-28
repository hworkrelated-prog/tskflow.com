import React from 'react';
import { Repeat } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Compact recurrence editor. `value` shape:
// { enabled: boolean, frequency, interval, end_type, end_date, end_count }
// Emits full recurrence object when enabled.
const defaultRule = () => ({ enabled: false, frequency: 'weekly', interval: 1, end_type: 'never', end_date: '', end_count: 5 });

const RecurrenceEditor = ({ value, onChange }) => {
    const rule = value || defaultRule();
    const set = (patch) => onChange({ ...rule, ...patch });

    return (
        <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                    type="checkbox"
                    data-testid="recurrence-enable"
                    checked={!!rule.enabled}
                    onChange={(e) => set({ enabled: e.target.checked })}
                    className="rounded"
                />
                <Repeat className="w-4 h-4 text-violet-600" />
                <span>Repeat</span>
            </label>

            {rule.enabled && (
                <div className="pl-6 space-y-3 border-l-2 border-indigo-100">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Frequency</Label>
                            <Select value={rule.frequency} onValueChange={(v) => set({ frequency: v })}>
                                <SelectTrigger data-testid="recurrence-frequency" className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="weekdays">Weekdays (Mon-Fri)</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="yearly">Yearly</SelectItem>
                                    <SelectItem value="custom">Custom (every N days)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {rule.frequency === 'custom' && (
                            <div className="space-y-1">
                                <Label>Every N days</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={rule.interval || 1}
                                    onChange={(e) => set({ interval: parseInt(e.target.value || '1', 10) })}
                                    className="rounded-xl"
                                    data-testid="recurrence-interval"
                                />
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <Label>Ends</Label>
                        <Select value={rule.end_type || 'never'} onValueChange={(v) => set({ end_type: v })}>
                            <SelectTrigger data-testid="recurrence-end-type" className="rounded-xl"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="never">Never</SelectItem>
                                <SelectItem value="on_date">On a date</SelectItem>
                                <SelectItem value="after_count">After N times</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {rule.end_type === 'on_date' && (
                        <div className="space-y-1">
                            <Label>End date</Label>
                            <Input
                                type="date"
                                value={rule.end_date || ''}
                                onChange={(e) => set({ end_date: e.target.value })}
                                className="rounded-xl"
                                data-testid="recurrence-end-date"
                            />
                        </div>
                    )}
                    {rule.end_type === 'after_count' && (
                        <div className="space-y-1">
                            <Label>Times</Label>
                            <Input
                                type="number"
                                min={1}
                                max={999}
                                value={rule.end_count || 1}
                                onChange={(e) => set({ end_count: parseInt(e.target.value || '1', 10) })}
                                className="rounded-xl"
                                data-testid="recurrence-end-count"
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RecurrenceEditor;
