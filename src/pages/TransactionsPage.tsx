import React, { useState } from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import { formatCurrency } from '../finance-engine/engine';
import { ArrowUpRight, ArrowDownRight, Wallet, Search, Trash2, Loader2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { deleteTransactionAndUpdateBalances } from '../services/firebase/db';
import { QuickAddModal } from '../components/transactions/QuickAddModal';
import { Transaction } from '../types';

export const TransactionsPage = () => {
  const { transactions, categories, accounts, jars } = useFinanceData();
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  
  const filteredTx = transactions.filter(tx => 
    tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (categories.find(c => c.id === tx.categoryId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDelete = async (tx: any) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar esta transacción? Esto ajustará tus balances.')) return;
    setDeletingId(tx.id);
    try {
      await deleteTransactionAndUpdateBalances(tx, jars);
    } catch (e) {
      console.error(e);
      alert('Error eliminando la transacción');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Flujo de Caja</p>
          <h1 className="text-2xl font-bold text-stone-900">Movimientos</h1>
        </div>
        
        <div className="relative w-full md:w-64">
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar movimientos..."
            className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-emerald-500 shadow-sm"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        </div>
      </header>

      <div className="bg-white rounded-3xl p-2 md:p-4 shadow-sm border border-stone-200">
        {filteredTx.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="text-stone-400" size={32} />
            </div>
            <h3 className="text-stone-900 font-bold mb-2">Sin resultados</h3>
            <p className="text-stone-500 text-sm">No se encontraron movimientos que coincidan con tu búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTx.map(tx => {
              const category = categories.find(c => c.id === tx.categoryId);
              const account = accounts.find(a => a.id === tx.accountId);
              
              return (
                <div key={tx.id} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 hover:bg-stone-50 rounded-2xl transition-colors border-b border-stone-100 last:border-0 gap-4">
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${
                      tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {tx.type === 'income' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-stone-900">{tx.description}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mt-1">
                        <span className="font-medium px-2 py-0.5 bg-stone-100 rounded-md">
                          {category?.name || 'General'}
                        </span>
                        <span>•</span>
                        <span>{format(new Date(tx.date), 'dd MMM yyyy', { locale: es })}</span>
                        <span>•</span>
                        <span>{account?.name || 'Desconocida'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end w-full md:w-auto mt-2 md:mt-0 items-center gap-2">
                    <p className={`text-lg font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-900'} mr-2`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </p>
                    <button 
                      onClick={() => setEditingTx(tx)}
                      className="p-2 text-stone-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Editar Transacción"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(tx)}
                      disabled={deletingId === tx.id}
                      className="p-2 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Eliminar Transacción"
                    >
                      {deletingId === tx.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {editingTx && (
        <QuickAddModal 
          isOpen={true} 
          onClose={() => setEditingTx(null)} 
          initialData={editingTx} 
        />
      )}
    </div>
  );
};
