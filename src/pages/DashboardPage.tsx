import React from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import { calculateMonthlyTotals, formatCurrency } from '../finance-engine/engine';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Activity, Wallet, Target } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const DashboardPage = () => {
  const { accounts, transactions, budgets } = useFinanceData();
  
  const { income, expense } = calculateMonthlyTotals(
    transactions.filter(t => new Date(t.date).getMonth() === new Date().getMonth())
  );
  
  const availableBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  const currentMonth = format(new Date(), 'MMMM yyyy', { locale: es });

  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetRatio = totalBudget > 0 ? (expense / totalBudget) : 0;
  const isOverBudget = budgetRatio > 1;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-2">
        <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Buenos días</p>
        <h1 className="text-2xl font-bold text-stone-900 capitalize">{currentMonth}</h1>
      </header>

      {/* Main Balance Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-stone-900 rounded-3xl p-6 md:p-8 shadow-xl text-white relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-stone-400 font-medium">Dinero Disponible</p>
            <div className="bg-stone-800/80 p-2 rounded-xl">
              <Wallet size={20} className="text-emerald-400" />
            </div>
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-8">
            {formatCurrency(availableBalance)}
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-stone-800/80 rounded-2xl p-4 backdrop-blur-sm border border-stone-700/50">
              <div className="flex items-center gap-2 text-emerald-400 mb-2">
                <ArrowUpRight size={18} />
                <span className="text-xs font-semibold uppercase tracking-wider">Ingresos</span>
              </div>
              <p className="text-xl font-medium">{formatCurrency(income)}</p>
            </div>
            
            <div className="bg-stone-800/80 rounded-2xl p-4 backdrop-blur-sm border border-stone-700/50">
              <div className="flex items-center gap-2 text-rose-400 mb-2">
                <ArrowDownRight size={18} />
                <span className="text-xs font-semibold uppercase tracking-wider">Gastos</span>
              </div>
              <p className="text-xl font-medium">{formatCurrency(expense)}</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick Budget Progress */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="font-bold text-stone-900 flex items-center gap-2">
                <Target size={18} className="text-blue-500" />
                Presupuesto del mes
              </h3>
              <p className="text-xs mt-1 font-medium text-stone-500">
                {totalBudget === 0 
                  ? 'No has definido presupuestos aún.' 
                  : isOverBudget 
                    ? 'Has superado tu límite mensual.' 
                    : 'Al ritmo actual estás dentro del límite.'}
              </p>
            </div>
            {totalBudget > 0 && <p className="font-bold text-stone-900">{formatCurrency(totalBudget)}</p>}
          </div>
          
          {totalBudget > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-stone-500">Gastado: {formatCurrency(expense)}</span>
                <span className="text-stone-900">Restante: {formatCurrency(Math.max(0, totalBudget - expense))}</span>
              </div>
              <div className="h-3 w-full bg-stone-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(budgetRatio * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-stone-50 rounded-2xl text-center border border-dashed border-stone-200">
              <p className="text-sm font-semibold text-stone-500">Crea presupuestos en la pestaña de categorías para controlar tus gastos.</p>
            </div>
          )}
        </div>

        {/* Recent Transactions Preview */}
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <Activity size={18} className="text-stone-400" />
              Últimos movimientos
            </h3>
            <button className="text-emerald-600 text-sm font-semibold hover:text-emerald-700">
              Ver todos
            </button>
          </div>
          
          {transactions.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Wallet className="text-stone-400" size={24} />
              </div>
              <p className="text-stone-900 font-medium text-sm mb-1">Aún no hay movimientos</p>
              <p className="text-stone-500 text-xs">Registra tu primer gasto para ver tus hábitos.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.slice(0, 4).map(tx => (
                <div key={tx.id} className="flex justify-between items-center group">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {tx.type === 'income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    </div>
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{tx.description}</p>
                      <p className="text-xs text-stone-500">{format(new Date(tx.date), 'dd MMM', { locale: es })}</p>
                    </div>
                  </div>
                  <p className={`font-semibold text-sm ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-900'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
