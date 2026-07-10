import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error('App crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ maxWidth: 560, textAlign: 'center' }}>
                        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
                        <p style={{ color: '#6b7280', marginBottom: 16 }}>The page hit an error. Please reload. If it keeps happening, share this message:</p>
                        <pre style={{ textAlign: 'left', background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', maxHeight: 200 }}>
                            {String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}
                        </pre>
                        <button
                            onClick={() => { window.location.href = '/dashboard'; }}
                            style={{ marginTop: 16, background: '#4F46E5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 9999, cursor: 'pointer', fontWeight: 600 }}
                        >
                            Reload
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
