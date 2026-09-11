import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useFinanceData } from '../hooks/useFinanceData';
import { deleteAccountCascade } from '../services/firebase/db';
import { Plus, X, Wallet, CreditCard, PiggyBank, Briefcase, Trash2, LayoutGrid } from 'lucide-react';
import { formatCurrency } from '../finance-engine/engine';
import { AddAccountForm } from '../components/accounts/AddAccountForm';

export const AccountsPage = () => {
  const { accounts, jars } = useFinanceData();
  const [isAdding, setIsAdding] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAccountCascade(accountToDelete);
      setAccountToDelete(null);
    } catch (err) {
      console.error("Error deleting account", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const getIcon = (t: string) => {
    switch (t) {
      case 'credit': return <CreditCard size={20} />;
      case 'savings': return <PiggyBank size={20} />;
      case 'cash': return <Wallet size={20} />;
      default: return <Briefcase size={20} />;
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end mb-2">
        <div>
          <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Gestión</p>
          <h1 className="text-2xl font-bold text-stone-900">Cuentas y Tarjetas</h1>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-4 py-2 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          {isAdding ? 'Cancelar' : 'Nueva Cuenta'}
        </button>
      </header>

      {isAdding && (
        <AddAccountForm onSuccess={() => setIsAdding(false)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => {
          const accJars = jars.filter(j => j.accountId === acc.id);
          
          return (
            <div key={acc.id} className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm relative overflow-hidden group">
              <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 bg-emerald-500`}></div>
              
              <button 
                onClick={() => setAccountToDelete(acc.id)}
                className="absolute top-4 right-4 p-2 bg-stone-50 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-full opacity-0 group-hover:opacity-100 transition-all z-20"
                title="Eliminar Cuenta"
              >
                <Trash2 size={16} />
              </button>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-2xl bg-stone-50 text-stone-700`}>
                    {getIcon(acc.type)}
                  </div>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">{acc.type}</span>
                </div>
                <h3 className="font-bold text-stone-900 mb-1">{acc.name}</h3>
                <p className="text-2xl font-bold tracking-tight text-stone-900">
                  {formatCurrency(acc.balance)}
                </p>
                {accJars.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2">
                    <LayoutGrid size={14} className="text-emerald-600" />
                    <span className="text-xs font-medium text-stone-500">Sistema de jarras activo</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && !isAdding && (
          <div className="col-span-full text-center py-12 bg-white rounded-3xl border border-stone-200 border-dashed">
            <Wallet className="mx-auto text-stone-300 mb-3" size={32} />
            <h3 className="text-stone-900 font-bold mb-1">No tienes cuentas</h3>
            <p className="text-stone-500 text-sm mb-4">Crea tu primera cuenta para empezar a registrar movimientos.</p>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-emerald-50 text-emerald-600 px-6 py-2 rounded-xl font-semibold text-sm hover:bg-emerald-100 transition-colors"
            >
              Crear mi primera cuenta
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setAccountToDelete(null)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full"
            >
              <h3 className="text-xl font-bold text-stone-900 mb-2">¿Eliminar cuenta?</h3>
              <p className="text-stone-500 text-sm mb-6">
                Esto eliminará permanentemente la cuenta, todas sus transacciones asociadas y sus jarras (sobres). Esta acción no se puede deshacer.
              </p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setAccountToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 font-semibold text-stone-600 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="px-4 py-2 font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors flex items-center gap-2"
                >
                  {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
