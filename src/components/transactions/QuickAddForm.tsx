import React, { useState } from 'react';
import { Loader2, Sparkles, Check } from 'lucide-react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { addTransactionAndUpdateBalances, editTransactionAndUpdateBalances } from '../../services/firebase/db';
import { Transaction } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { categorizeAndParseTransaction } from '../../services/gemini/parser';

interface QuickAddFormProps {
  onClose: () => void;
  initialData?: Transaction;
}

export const QuickAddForm: React.FC<QuickAddFormProps> = ({ onClose, initialData }) => {
  const { user, accounts, categories, jars } = useFinanceData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  
  const [amount, setAmount] = useState(initialData ? initialData.amount.toString() : '');
  const [description, setDescription] = useState(initialData ? initialData.description : '');
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(initialData ? initialData.type as any : 'expense');
  
  const getLocalDateString = (timestamp?: number) => {
    if (!timestamp) return new Date().toISOString().split('T')[0];
    const d = new Date(timestamp);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };
  
  const [date, setDate] = useState(getLocalDateString(initialData?.date));
  const [accountId, setAccountId] = useState(initialData ? initialData.accountId : '');
  const [categoryId, setCategoryId] = useState(initialData ? (initialData.categoryId || '') : '');
  const [jarId, setJarId] = useState(initialData ? (initialData.jarId || '') : '');
  const [distributedToJars, setDistributedToJars] = useState(initialData ? !!initialData.distributedToJars : false);
  const [isRecurring, setIsRecurring] = useState(initialData ? !!initialData.isRecurring : false);

  React.useEffect(() => {
    if (accounts.length > 0 && !accountId && !initialData) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId, initialData]);

  React.useEffect(() => {
    if (type === 'income') {
      if (!initialData) setDistributedToJars(true);
      if (!initialData) setJarId('');
    } else {
      setDistributedToJars(false);
    }
  }, [type, initialData]);

  const filteredJars = jars.filter(j => j.accountId === accountId);
  const filteredCategories = categories.filter(c => c.type === type && c.isActive);

  const handleMagicParse = async () => {
    if (!description) return;
    setIsParsing(true);
    try {
      const result = await categorizeAndParseTransaction(description, parseFloat(amount || '0'));
      if (result.description) setDescription(result.description);
      if (result.type) setType(result.type as any);
      if (result.amount) setAmount(result.amount.toString());
      if (result.isRecurring) setIsRecurring(result.isRecurring);
      
      if (result.categoryName) {
        const cat = categories.find(c => c.name.toLowerCase().includes(result.categoryName!.toLowerCase()));
        if (cat) setCategoryId(cat.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount || !accountId) return;
    if (type === 'expense' && !categoryId) return;
    
    setIsSubmitting(true);
    try {
      const txDate = new Date(date);
      // Ensure the time is consistent or just use local time for the given date
      const timestamp = txDate.getTime() + txDate.getTimezoneOffset() * 60000;

      const tx: Transaction = {
        id: initialData ? initialData.id : uuidv4(),
        userId: user.uid,
        type,
        amount: parseFloat(amount),
        currency: 'USD',
        accountId,
        categoryId: type === 'expense' ? categoryId : undefined,
        jarId: jarId || undefined,
        distributedToJars: type === 'income' ? distributedToJars : undefined,
        description,
        date: timestamp,
        isRecurring,
        createdAt: initialData ? initialData.createdAt : Date.now(),
        updatedAt: Date.now(),
      };
      
      if (initialData) {
        await editTransactionAndUpdateBalances(initialData, tx, jars);
      } else {
        await addTransactionAndUpdateBalances(tx, jars);
      }
      
      setAmount('');
      setDescription('');
      setIsRecurring(false);
      setJarId('');
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pb-4 px-1">
      <div className="grid grid-cols-2 gap-2 bg-stone-100 p-1 rounded-2xl">
        <button
          type="button"
          onClick={() => setType('expense')}
          className={`py-2 px-4 rounded-xl text-sm font-semibold transition-colors ${type === 'expense' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
        >
          Gasto
        </button>
        <button
          type="button"
          onClick={() => setType('income')}
          className={`py-2 px-4 rounded-xl text-sm font-semibold transition-colors ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500'}`}
        >
          Ingreso
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Fecha</label>
          <input 
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Monto ($)</label>
          <input 
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full text-4xl font-bold bg-transparent border-b-2 border-stone-200 py-2 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-300"
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">En qué (Descripción)</label>
        <div className="relative">
          <input 
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            placeholder={type === 'income' ? 'Ej. Salario, Venta...' : 'Ej. Supermercado, Gasolina...'}
          />
          <button 
            type="button" 
            onClick={handleMagicParse}
            disabled={isParsing || !description}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 p-1 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            title="Autocompletar con IA"
          >
            {isParsing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Cuenta {type === 'expense' ? 'Origen' : 'Destino'}</label>
          <select 
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
          >
            <option value="" disabled>Selecciona...</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
        {type === 'expense' && (
          <div>
            <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Categoría</label>
            <select 
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
            >
              <option value="" disabled>Selecciona...</option>
              {filteredCategories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {type === 'income' && filteredJars.length > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl mt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative flex items-center justify-center">
              <input 
                type="checkbox" 
                checked={distributedToJars} 
                onChange={(e) => setDistributedToJars(e.target.checked)}
                className="peer appearance-none w-5 h-5 border-2 border-emerald-600 rounded bg-white checked:bg-emerald-600 transition-colors"
              />
              <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900 text-sm">Distribuir en Jarras</p>
              <p className="text-xs text-emerald-700">Se dividirá automáticamente en las jarras de esta cuenta.</p>
            </div>
          </label>
        </div>
      )}

      {type === 'expense' && filteredJars.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-stone-500 uppercase mb-1">Jarra (Opcional)</label>
          <select 
            value={jarId}
            onChange={(e) => setJarId(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
          >
            <option value="">No descontar de ninguna jarra</option>
            {filteredJars.map(jar => (
              <option key={jar.id} value={jar.id}>{jar.name} ({jar.percentage}%)</option>
            ))}
          </select>
          <p className="text-xs text-stone-500 mt-1">Si seleccionas una jarra, el saldo se descontará de ella.</p>
        </div>
      )}

      <button 
        type="submit"
        disabled={isSubmitting || accounts.length === 0}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl mt-6 flex justify-center items-center gap-2 transition-colors disabled:opacity-70 shadow-sm"
      >
        {isSubmitting ? <Loader2 className="animate-spin" /> : 'Guardar'}
      </button>
    </form>
  );
};
