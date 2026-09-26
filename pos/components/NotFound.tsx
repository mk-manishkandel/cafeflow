import React from 'react';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-lg w-full text-center">
                <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-6 mx-auto relative group">
                    <div className="absolute inset-0 bg-indigo-100 rounded-full scale-0 group-hover:scale-100 transition-transform duration-500 opacity-50"></div>
                    <FileQuestion size={48} className="text-indigo-600 relative z-10" strokeWidth={1.5} />
                </div>

                <h1 className="text-4xl font-black text-slate-800 mb-2 tracking-tight">404</h1>
                <h2 className="text-xl font-bold text-slate-700 mb-3">Page not found</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                    The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                    <button
                        onClick={() => navigate(-1)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
                    >
                        <ArrowLeft size={18} />
                        Go Back
                    </button>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all active:scale-95"
                    >
                        <Home size={18} />
                        Dashboard
                    </button>
                </div>
            </div>

            <p className="mt-8 text-slate-400 text-sm font-medium">
                CafeFlow POS System
            </p>
        </div>
    );
};

export default NotFound;
