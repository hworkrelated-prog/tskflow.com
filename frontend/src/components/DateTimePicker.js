import React, { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock } from 'lucide-react';
import { format } from 'date-fns';

// Parses a "yyyy-MM-dd'T'HH:mm" string into parts. Returns nulls if empty/invalid.
const parseValue = (value) => {
    if (!value) return { date: null, hour12: 9, minute: 0, ampm: 'AM' };
    const [datePart, timePart] = value.split('T');
    const date = datePart ? new Date(`${datePart}T00:00:00`) : null;
    let hour = 9, minute = 0;
    if (timePart) {
        const [h, m] = timePart.split(':');
        hour = parseInt(h, 10);
        minute = parseInt(m, 10);
    }
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;
    return { date: date && !isNaN(date) ? date : null, hour12, minute, ampm };
};

const pad = (n) => String(n).padStart(2, '0');

// Builds "yyyy-MM-dd'T'HH:mm" from parts (matches native datetime-local format).
const buildValue = (date, hour12, minute, ampm) => {
    if (!date) return '';
    let hour24 = hour12 % 12;
    if (ampm === 'PM') hour24 += 12;
    return `${format(date, 'yyyy-MM-dd')}T${pad(hour24)}:${pad(minute)}`;
};

const QUICK_OPTIONS = [
    { label: 'Today 5 PM', getDate: () => ({ d: new Date(), h: 5, m: 0, ap: 'PM' }) },
    { label: 'Tomorrow 9 AM', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return { d, h: 9, m: 0, ap: 'AM' }; } },
    { label: 'In 3 days', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 3); return { d, h: 9, m: 0, ap: 'AM' }; } },
    { label: 'Next week', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); return { d, h: 9, m: 0, ap: 'AM' }; } },
];

export const DateTimePicker = ({ value, onChange, testId = 'datetime-picker' }) => {
    const { date, hour12, minute, ampm } = useMemo(() => parseValue(value), [value]);

    const update = (newDate, newHour, newMinute, newAmpm) => {
        onChange(buildValue(newDate, newHour, newMinute, newAmpm));
    };

    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    const displayLabel = value
        ? `${format(parseValue(value).date, 'EEE, MMM d')}  ·  ${hour12}:${pad(minute)} ${ampm}`
        : 'Pick a date & time';

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    data-testid={`${testId}-trigger`}
                    className={`w-full justify-start rounded-xl h-11 font-normal ${value ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                    <CalendarDays className="w-4 h-4 mr-2 text-indigo-500 shrink-0" />
                    {displayLabel}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden" align="start">
                <div className="p-3 border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex flex-wrap gap-1.5">
                        {QUICK_OPTIONS.map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                data-testid={`${testId}-quick-${opt.label.replace(/\s+/g, '-').toLowerCase()}`}
                                onClick={() => {
                                    const { d, h, m, ap } = opt.getDate();
                                    update(d, h, m, ap);
                                }}
                                className="text-xs px-2.5 py-1 rounded-full bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors"
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <CalendarComponent
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && update(d, hour12, minute, ampm)}
                    initialFocus
                />
                <div className="flex items-center gap-2 p-3 border-t bg-slate-50">
                    <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                    <Select value={String(hour12)} onValueChange={(v) => update(date || new Date(), parseInt(v, 10), minute, ampm)}>
                        <SelectTrigger data-testid={`${testId}-hour`} className="rounded-lg h-9 w-[68px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-56">
                            {hours.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <span className="font-semibold text-muted-foreground">:</span>
                    <Select value={String(minute)} onValueChange={(v) => update(date || new Date(), hour12, parseInt(v, 10), ampm)}>
                        <SelectTrigger data-testid={`${testId}-minute`} className="rounded-lg h-9 w-[68px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-56">
                            {minutes.map((m) => <SelectItem key={m} value={String(m)}>{pad(m)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <div className="flex rounded-lg border overflow-hidden ml-1">
                        {['AM', 'PM'].map((p) => (
                            <button
                                key={p}
                                type="button"
                                data-testid={`${testId}-${p.toLowerCase()}`}
                                onClick={() => update(date || new Date(), hour12, minute, p)}
                                className={`px-3 py-1.5 text-sm font-medium transition-colors ${ampm === p ? 'bg-indigo-600 text-white' : 'bg-white text-muted-foreground hover:bg-slate-100'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default DateTimePicker;
