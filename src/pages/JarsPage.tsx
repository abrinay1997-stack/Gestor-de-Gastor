import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFinanceData } from '../hooks/useFinanceData';
import { formatCurrency } from '../finance-engine/engine';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { Save, Settings2, X, AlertCircle, LayoutGrid } from 'lucide-react';
import { updateDocument } from '../services/firebase/db';

export const JarsPage = () => {
  const { jars, transactions, accounts } = useFinanceData();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts.length > 0 ? accounts[0].id : '');
  const [isEditing, setIsEditing] = useState(false);
  
  const currentJars = jars.filter(j => j.accountId === selectedAccountId);

  // Local state for editing percentages
  const [editPercentages, setEditPercentages] = useState<Record<string, number>>({});
  const totalPercentage = Object.values(editPercentages).reduce((acc, val) => acc + (Number(val) || 0), 0);

  const handleEditOpen = () => {
    const current: Record<string, number> = {};
    currentJars.forEach(j => current[j.id] = j.percentage);
    setEditPercentages(current);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (totalPercentage !== 100) return;
    try {
      for (const jar of currentJars) {
        if (jar.percentage !== editPercentages[jar.id]) {
          await updateDocument('jars', jar.id, { percentage: editPercentages[jar.id] });
        }
      }
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    }
  };

  const pieData = currentJars.map(j => ({
    name: j.name,
    value: j.balance > 0 ? j.balance : 0,
    color: j.color
  })).filter(d => d.value > 0);

  const emptyPieData = currentJars.map(j => ({
    name: j.name,
    value: j.percentage,
    color: j.color
  }));

  const hasBalances = pieData.length > 0;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Sistema de Sobres</p>
          <h1 className="text-2xl font-bold text-stone-900">Mis Jarras</h1>
        </div>
        {accounts.length > 0 && (
          <select 
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-white border border-stone-200 text-stone-900 px-4 py-2 rounded-xl font-semibold text-sm focus:outline-none focus:border-emerald-500 shadow-sm"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        )}
      </header>

      {accounts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-stone-200 border-dashed">
          <LayoutGrid className="mx-auto text-stone-300 mb-3" size={32} />
          <h3 className="text-stone-900 font-bold mb-1">No hay cuentas</h3>
          <p className="text-stone-500 text-sm">Crea una cuenta para usar el sistema de jarras.</p>
        </div>
      ) : currentJars.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-stone-200 border-dashed">
          <LayoutGrid className="mx-auto text-stone-300 mb-3" size={32} />
          <h3 className="text-stone-900 font-bold mb-1">No hay jarras en esta cuenta</h3>
          <p className="text-stone-500 text-sm">Puedes activar el sistema de jarras al crear una cuenta nueva.</p>
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button 
              onClick={handleEditOpen}
              className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-4 py-2 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
            >
              <Settings2 size={16} />
              Ajustar Porcentajes
            </button>
          </div>

          {/* Main Stats & Pie */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col md:flex-row items-center gap-8">
            <div className="w-full md:w-1/3 flex flex-col justify-center h-64">
              <h3 className="font-bold text-stone-900 mb-2 text-center md:text-left">
                {hasBalances ? 'Distribución Actual' : 'Plan de Distribución'}
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={hasBalances ? pieData : emptyPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {(hasBalances ? pieData : emptyPieData).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => hasBalances ? formatCurrency(value) : `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-full md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentJars.map(jar => (
                <div key={jar.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-8 rounded-full" style={{ backgroundColor: jar.color }} />
                    <div>
                      <p className="font-semibold text-stone-900 text-sm">{jar.name}</p>
                      <p className="text-xs text-stone-500">{jar.percentage}% del Ingreso</p>
                    </div>
                  </div>
                  <p className="font-bold text-lg text-stone-900">{formatCurrency(jar.balance || 0)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditing && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="fixed bottom-0 left-0 w-full bg-white rounded-t-3xl z-50 p-6 shadow-2xl md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-stone-900 tracking-tight">Editar Porcentajes</h2>
                <button onClick={() => setIsEditing(false)} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:text-stone-900">
                  <X size={20} />
                </button>
              </div>
              
              <div className={`p-3 rounded-xl flex items-center justify-between font-bold mb-4 ${totalPercentage === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <span>Total asignado:</span>
                <span>{totalPercentage}% / 100%</span>
              </div>

              {totalPercentage !== 100 && (
                <p className="text-xs text-rose-600 flex items-center gap-1 mb-4">
                  <AlertCircle size={14} /> La suma debe ser exactamente 100%
                </p>
              )}

              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
                {currentJars.map(jar => (
                  <div key={jar.id} className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-stone-700">{jar.name}</label>
                    <div className="relative w-24">
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        value={editPercentages[jar.id]}
                        onChange={(e) => setEditPercentages(prev => ({ ...prev, [jar.id]: Number(e.target.value) }))}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-right focus:outline-none focus:border-emerald-500 font-bold"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold">%</span>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={handleSave}
                disabled={totalPercentage !== 100}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl mt-6 flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                Guardar Cambios
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
