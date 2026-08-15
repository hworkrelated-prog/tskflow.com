import React from 'react';
import { Link } from 'react-router-dom';

/** Public DBA statement linking the TskFlow brand to Unbiassly, Inc. */
export const LEGAL_ENTITY = 'Unbiassly, Inc.';
export const TRADE_NAME = 'TskFlow';
export const SITE_URL = 'https://tskflow.com';

export const LegalEntityNotice = ({ compact = false }) => {
    if (compact) {
        return (
            <p data-testid="legal-entity-notice">
                {TRADE_NAME} is a trade name of {LEGAL_ENTITY}. The {TRADE_NAME} service at {SITE_URL} is owned and operated by {LEGAL_ENTITY}.
            </p>
        );
    }
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800" data-testid="legal-entity-notice">
            <p className="font-semibold text-slate-900 mb-1">Who we are</p>
            <p>
                <strong>{TRADE_NAME}</strong> (also styled &quot;Tskflow&quot;) is a trade name of <strong>{LEGAL_ENTITY}</strong>.
                {' '}{LEGAL_ENTITY} owns and operates the {TRADE_NAME} product and website at{' '}
                <a href={SITE_URL} className="text-indigo-600 underline">{SITE_URL.replace('https://', '')}</a>.
                All {TRADE_NAME} services, including optional informational SMS, are provided by {LEGAL_ENTITY}.
            </p>
            <p className="mt-2 text-sm">
                See our <Link to="/legal" className="text-indigo-600 underline">Legal</Link>
                {', '}<Link to="/terms" className="text-indigo-600 underline">Terms of Service</Link>
                {', and '}<Link to="/privacy" className="text-indigo-600 underline">Privacy Policy</Link>.
            </p>
        </div>
    );
};

export default LegalEntityNotice;
