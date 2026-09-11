import { describe, it, expect } from 'vitest';
import { calculateMonthlyTotals, filterTransactionsByMonth } from './engine';
import { Transaction } from '../types';

describe('Finance Engine', () => {
  it('should calculate monthly totals correctly', () => {
    const mockTransactions: Partial<Transaction>[] = [
      { type: 'income', amount: 1000 },
      { type: 'income', amount: 500 },
      { type: 'expense', amount: 200 },
      { type: 'transfer', amount: 100 }
    ];

    const { income, expense, cashFlow } = calculateMonthlyTotals(mockTransactions as Transaction[]);
    
    expect(income).toBe(1500);
    expect(expense).toBe(200);
    expect(cashFlow).toBe(1300);
  });

  it('should filter transactions by month', () => {
    const mockTransactions: Partial<Transaction>[] = [
      { date: new Date('2024-01-15T12:00:00').getTime() }, // Jan
      { date: new Date('2024-01-31T23:59:59').getTime() }, // Jan
      { date: new Date('2024-02-01T00:00:01').getTime() }, // Feb
    ];

    // Note: JS months are 0-indexed, so 0 is January
    const janTransactions = filterTransactionsByMonth(mockTransactions as Transaction[], 2024, 0);
    expect(janTransactions.length).toBe(2);

    const febTransactions = filterTransactionsByMonth(mockTransactions as Transaction[], 2024, 1);
    expect(febTransactions.length).toBe(1);
  });
});
