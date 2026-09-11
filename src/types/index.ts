export enum TransactionTypes {
  EXPENSE = 'expense',
  INCOME = 'income',
  TRANSFER = 'transfer'
}

export type TransactionType = 'expense' | 'income' | 'transfer';
export type AccountType = 'bank' | 'cash' | 'credit' | 'savings' | 'wallet';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface UserSettings {
  currency: string;
  language: string;
}

export interface Jar {
  id: string;
  userId: string;
  accountId: string;
  name: string;
  percentage: number;
  balance: number;
  color: string;
  icon: string;
  createdAt: number;
}

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  balance: number;
  initialBalance: number;
  currency: string;
  color: string;
  institution?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  userId: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  isActive: boolean;
  createdAt: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId?: string; // Optional for transfers
  accountId: string; // Source account
  destinationAccountId?: string; // Only for transfers
  jarId?: string; // Related jar
  distributedToJars?: boolean; // True if this income was distributed based on jar percentages
  description: string;
  merchant?: string;
  date: number; // timestamp
  paymentMethod?: string;
  isRecurring?: boolean;
  recurringTransactionId?: string;
  notes?: string;
  receiptUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Budget {
  id: string;
  userId: string;
  categoryId?: string; // If undefined, it's a global budget
  amount: number;
  month: number;
  year: number;
  createdAt: number;
  updatedAt: number;
}
