import React, { useState } from 'react';
import { motion } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { useFinanceData } from '../../hooks/useFinanceData';
import { saveDocument, seedInitialJars } from '../../services/firebase/db';
import { Account } from '../../types';
import { LayoutGrid } from 'lucide-react';

interface AddAccountFormProps {
  onSuccess: () => void;
}

export const AddAccountForm: React.FC<AddAccountFormProps> = ({ onSuccess }) => {
  const { user } = useFinanceData();
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('bank');
  const [initialBalance, setInitialBalance] = useState('');
  const [enableJars, setEnableJars] = useState(false);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name || !initialBalance) return;

    try {
      const newAccountId = uuidv4();
      const newAccount: Account = {
        id: newAccountId,
        userId: user.uid,
        name,
        type,
        balance: parseFloat(initialBalance),
        initialBalance: parseFloat(initialBalance),
        currency: 'USD',
        color: '#10b981',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await saveDocument('accounts', newAccount);
      
      if (enableJars) {
        await seedInitialJars(user.uid, newAccountId);
      }
      
      setName('');
      setInitialBalance('');
      setEnableJars(false);
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="bg-white rounded-3xl p-6 shadow-sm border border-stone-200"
    >
      <form onSubmit={handleAddAccount} className="space-y-4">
        <h3 className="font-bold text-stone-900 mb-4">Crear Nueva Cuenta</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Nombre</label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
              placeholder="Ej. Chase, Billetera..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Tipo</label>
            <select 
              value={type}
              onChange={(e: any) => setType(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="bank">Cuenta Bancaria</option>
              <option value="credit">Tarjeta de Crédito</option>
              <option value="savings">Ahorros</option>
              <option value="cash">Efectivo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Saldo Inicial</label>
            <input 
              type="number"
              step="0.01"
              required
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
              placeholder="0.00"
            />
          </div>
        </div>
        
        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-stone-50 rounded-xl border border-stone-100 hover:border-emerald-200 transition-colors w-full md:w-max">
            <input 
              type="checkbox" 
              checked={enableJars}
              onChange={(e) => setEnableJars(e.target.checked)}
              className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-2">
              <LayoutGrid size={18} className="text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-stone-900">Activar Sistema de Jarras</p>
                <p className="text-xs text-stone-500">Crea 7 divisiones porcentuales para esta cuenta.</p>
              </div>
            </div>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button 
            type="submit"
            className="bg-stone-900 hover:bg-stone-800 text-white font-semibold py-2 px-6 rounded-xl transition-colors"
          >
            Guardar Cuenta
          </button>
        </div>
      </form>
    </motion.div>
  );
};
