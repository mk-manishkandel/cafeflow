import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import logger from '../utils/logger';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    public state: State;
    public props: Props;

    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error('Uncaught error:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-300">
                    <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-lg w-full">
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6 mx-auto shadow-sm">
                            <AlertTriangle size={40} className="text-red-500" strokeWidth={1.5} />
                        </div>

                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h1>
                        <p className="text-slate-500 mb-6 text-sm">
                            The application encountered an unexpected error.
                        </p>

                        {this.state.error && (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-8 text-left overflow-hidden">
                                <p className="font-mono text-xs text-slate-500 break-words line-clamp-4">
                                    {process.env.NODE_ENV === 'development' ? this.state.error.toString() : 'An unexpected error occurred.'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                            <button
                                onClick={this.handleReload}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all active:scale-95"
                            >
                                <RefreshCw size={18} />
                                Reload Page
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                            >
                                <Home size={18} />
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
