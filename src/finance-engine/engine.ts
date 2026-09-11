import { Account, Transaction, Budget, Category, Jar } from '../types';

export const filterTransactionsByMonth = (transactions: Transaction[], year: number, month: number) => {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  return transactions.filter(t => t.date >= start && t.date <= end);
};

export const calculateMonthlyTotals = (transactions: Transaction[]) => {
  let income = 0;
  let expense = 0;

  transactions.forEach(tx => {
    if (tx.type === 'income') income += tx.amount;
    if (tx.type === 'expense') expense += tx.amount;
  });

  return { income, expense, cashFlow: income - expense };
};

export const calculateCategoryTotals = (transactions: Transaction[], type: 'income' | 'expense') => {
  const totals: Record<string, number> = {};
  transactions.filter(t => t.type === type && t.categoryId).forEach(tx => {
    if (tx.categoryId) {
      totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount;
    }
  });
  return totals;
};

export const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};
