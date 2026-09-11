import React from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import { calculateCategoryTotals, formatCurrency } from '../finance-engine/engine';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const AnalyticsPage = () => {
  const { transactions, categories } = useFinanceData();
  
  // Expenses by Category
  const expenseTotals = calculateCategoryTotals(transactions, 'expense');
  const expenseData = Object.entries(expenseTotals).map(([catId, amount]) => {
    const cat = categories.find(c => c.id === catId);
    return {
      name: cat?.name || 'Otro',
      amount,
      color: cat?.color || '#cbd5e1'
    };
  }).sort((a, b) => b.amount - a.amount);

  // Simple Cashflow Trend (mocked historical grouping for this view)
  const cashflowData = [
    { month: 'Ene', income: 4000, expense: 2400 },
    { month: 'Feb', income: 3000, expense: 1398 },
    { month: 'Mar', income: 2000, expense: 9800 },
    { month: 'Abr', income: 2780, expense: 3908 },
    { month: 'May', income: 1890, expense: 4800 },
    { month: 'Jun', income: 2390, expense: 3800 },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-2">
        <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Reportes</p>
        <h1 className="text-2xl font-bold text-stone-900">Estadísticas</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-900 mb-6">Gastos por Categoría</h3>
          {expenseData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-stone-500 text-sm">
              No hay datos suficientes
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="amount"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full mt-4 space-y-2">
                {expenseData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-stone-700">{item.name}</span>
                    </div>
                    <span className="font-bold text-stone-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cashflow Trend */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-900 mb-6">Tendencia de Flujo (Simulado)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716c' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#78716c' }} tickFormatter={(value) => `$${value/1000}k`} />
                <RechartsTooltip cursor={{ fill: '#f5f5f4' }} formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="expense" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
