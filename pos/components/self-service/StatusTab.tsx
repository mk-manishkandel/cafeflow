import React from 'react';
import { LayoutDashboard, UtensilsCrossed, Info } from 'lucide-react';

interface StatusTabProps {
    config: any;
    onToggle: (key: string, value: boolean) => void;
}

const Switch = ({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (val: boolean) => void; disabled?: boolean }) => (
    <button
        onClick={() => !disabled && onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-100 ease-in-out focus:outline-none ${enabled ? 'bg-green-500' : 'bg-slate-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-100 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
        />
    </button>
);

const StatusTab: React.FC<StatusTabProps> = ({ config, onToggle }) => {
    // Calculate Stats
    const branchList = Array.isArray(config.branchStatuses) ? config.branchStatuses : [];
    const onlineCount = branchList.filter(b => b.isEnabled).length;
    const offlineCount = branchList.length - onlineCount;
    const isActuallyEnabled = onlineCount > 0 || config.isSelfServiceEnabled;

    return (
        <div className="p-8">
            <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Card */}
                    <div className={`p-6 rounded-2xl border transition-all duration-100 ${isActuallyEnabled
                        ? 'bg-green-50 border-green-200 shadow-sm'
                        : 'bg-slate-50 border-slate-200'
                        }`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isActuallyEnabled ? 'bg-green-600 text-white shadow-sm' : 'bg-slate-400 text-white'
                                    }`}>
                                    <LayoutDashboard size={28} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-800">
                                        {config.isMainBranch ? 'Self-Service Status' : `${config.branchName || 'Branch'} Status`}
                                    </h3>
                                    <div className="flex flex-col">
                                        <p className={`text-xs font-bold uppercase tracking-wider ${isActuallyEnabled ? 'text-green-600' : 'text-slate-500'
                                            }`}>
                                            {isActuallyEnabled ? 'Online & Recognizing Customers' : 'Offline / Under Maintenance'}
                                        </p>
                                        <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                            {config.isMainBranch
                                                ? `${onlineCount} Online / ${offlineCount} Offline Branches`
                                                : `${config.branchName || 'Branch'} Self-Service`
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {!config.isMainBranch && (
                                <Switch
                                    enabled={config.isSelfServiceEnabled}
                                    onChange={(val) => onToggle('isSelfServiceEnabled', val)}
                                />
                            )}
                        </div>
                    </div>

                    {/* Quick Stats Card */}
                    <div className="p-6 rounded-2xl border border-slate-200 bg-white grid grid-cols-2 gap-4 shadow-sm">
                        <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Public Items</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {Array.isArray(config.menuItems) ? config.menuItems.filter((i: any) => i.isSelfService).length : 0}
                            </p>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Categories</p>
                            <p className="text-2xl font-bold text-slate-900">
                                {Array.isArray(config.menuItems) ? new Set(config.menuItems.map((i: any) => i.category)).size : 0}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Branch Statuses - Isolated for Branch Admins, Global for Main admin */}
                {branchList.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 px-2">
                            <UtensilsCrossed size={18} className="text-slate-400" />
                            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Branch Self-Service Controls</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {branchList.map((branch: any) => (
                                <div key={branch.id} className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-100 transition-all shadow-sm group">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${branch.isEnabled ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                            <LayoutDashboard size={18} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{branch.name}</p>
                                            <p className={`text-[10px] font-bold uppercase tracking-tight ${branch.isEnabled ? 'text-green-500' : 'text-slate-400'}`}>
                                                {branch.isEnabled ? 'Self-Service Online' : 'Self-Service Offline'}
                                            </p>
                                        </div>
                                    </div>
                                    <Switch
                                        enabled={branch.isEnabled}
                                        onChange={(val) => onToggle(`branch_${branch.id}`, val)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Info Alert */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                        <Info size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 text-sm">Configuration Note</h4>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1">
                            Disabling Self-Service will prevent customers from accessing the portal, but staff can still process orders via the admin console if needed.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(StatusTab);
