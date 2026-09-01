import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Looping elapsed-time clock. Reduced motion jumps to the last beat. */
export function useStoryClock(phases, { loop = true, playing = true } = {}) {
    const reduce = useReducedMotion();
    const total = useMemo(() => phases.reduce((sum, phase) => sum + phase.dur, 0), [phases]);
    const accRef = useRef(0);
    const lastRef = useRef(null);
    const [elapsed, setElapsed] = useState(() => (reduce ? Math.max(total - 0.01, 0) : 0));

    useEffect(() => {
        if (reduce) {
            setElapsed(Math.max(total - 0.01, 0));
            return undefined;
        }
        if (!playing) {
            lastRef.current = null;
            return undefined;
        }
        let raf;
        const tick = (now) => {
            if (lastRef.current == null) lastRef.current = now;
            accRef.current += (now - lastRef.current) / 1000;
            lastRef.current = now;
            const next = loop ? accRef.current % total : Math.min(accRef.current, total);
            setElapsed(next);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [loop, playing, reduce, total]);

    let acc = 0;
    let index = phases.length - 1;
    let local = 1;
    for (let i = 0; i < phases.length; i += 1) {
        const next = acc + phases[i].dur;
        if (elapsed < next) {
            index = i;
            local = (elapsed - acc) / phases[i].dur;
            break;
        }
        acc = next;
    }

    return {
        elapsed,
        total,
        index,
        local,
        phase: phases[index] || phases[phases.length - 1],
        reduce,
    };
}

export function phaseOn(index, from, to = from) {
    return index >= from && index <= to;
}
