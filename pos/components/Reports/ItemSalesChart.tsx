import React from 'react';
import { BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

import { formatCurrency } from '../../utils/currency';
interface ItemSalesChartProps {
    data: { name: string; revenue: number }[];
}

export const ItemSalesChart: React.FC<ItemSalesChartProps> = ({ data }) => {
    return (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                    <BarChart2 size={20} className="text-indigo-600" />
                </div>
                Top 5 Items (Revenue)
            </h3>
            <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={100}
                            tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 900 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{
                                borderRadius: '16px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                padding: '12px'
                            }}
                            itemStyle={{ fontWeight: 900, fontSize: '12px', textTransform: 'uppercase' }}
                            formatter={(value: number) => [`${formatCurrency(value)}`, 'Revenue']}
                        />
                        <Bar dataKey="revenue" radius={[0, 8, 8, 0]} barSize={24}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316'][index % 5]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
