import React from 'react';
import { CreditCard, Smartphone, Banknote } from 'lucide-react';

import { formatCurrency } from '../../utils/currency';
interface PaymentBreakdownProps {
    statsByPayment: {
        name: string;
        type?: string;
        revenue: number;
        count: number;
    }[];
}

export const PaymentBreakdown: React.FC<PaymentBreakdownProps> = ({ statsByPayment }) => {
    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-500" />
                <span>Payment Method Breakdown</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statsByPayment.map((stat) => {
                    const type = (stat.type || 'digital').toLowerCase();
                    const isCash = type === 'cash';
                    const isCard = type === 'card';
                    const isCredit = type === 'credit';
                    const isDigital = type === 'digital';

                    // Choose icon and color based on type
                    let Icon = Smartphone;
                    let color = 'bg-blue-500';
                    let iconColor = 'text-blue-500';

                    if (isCash) {
                        Icon = Banknote;
                        color = 'bg-green-500';
                        iconColor = 'text-green-500';
                    } else if (isCard) {
                        Icon = CreditCard;
                        color = 'bg-purple-500';
                        iconColor = 'text-purple-500';
                    } else if (isCredit) {
                        Icon = CreditCard;
                        color = 'bg-orange-500';
                        iconColor = 'text-orange-500';
                    } else if (isDigital) {
                        Icon = Smartphone;
                        color = 'bg-blue-500';
                        iconColor = 'text-blue-500';
                    }

                    return (
                        <div key={stat.name} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className={`p-2 rounded-lg ${color} bg-opacity-10 shrink-0`}>
                                    <Icon className={`w-5 h-5 ${iconColor}`} />
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right leading-tight max-w-[70%]">{stat.name}</span>
                            </div>
                            <div>
                                <p className="text-xl font-bold text-slate-800">{formatCurrency((stat.revenue || 0))}</p>
                                <p className="text-[10px] uppercase font-bold text-slate-500">{stat.count || 0} Txns</p>
                            </div>
                        </div>
                    );
                })}
                {statsByPayment.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CreditCard className="w-8 h-8 opacity-20" />
                        </div>
                        <p className="text-sm font-bold opacity-60">No payment data available for this period</p>
                    </div>
                )}
            </div>
        </div>
    );
};
