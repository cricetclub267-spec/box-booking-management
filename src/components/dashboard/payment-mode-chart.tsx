'use client';

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PaymentModeChartProps {
  data: { name: string; value: number }[];
}

const COLORS = {
  'UPI': '#3b82f6',          // Vibrant Blue
  'Cash': '#10b981',         // Emerald Green
  'Card': '#f59e0b',         // Amber Yellow
  'Bank Transfer': '#8b5cf6'  // Purple
};

const DEFAULT_COLOR = '#6b7280'; // Slate Grey

export default function PaymentModeChart({ data }: PaymentModeChartProps) {
  // Filter out zero values to avoid empty slices
  const chartData = data.filter(item => item.value > 0);

  if (chartData.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-semibold">
        No payment data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={75}
          paddingAngle={4}
          dataKey="value"
        >
          {chartData.map((entry) => {
            const color = COLORS[entry.name as keyof typeof COLORS] || DEFAULT_COLOR;
            return <Cell key={`cell-${entry.name}`} fill={color} />;
          })}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8e5', fontSize: '11px' }}
          formatter={(value: any) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
