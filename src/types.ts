export type TransactionType = 'income' | 'expense' | 'transfer';
export type Book = 'business' | 'art' | 'family';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: TransactionType;
  book: Book;
  sourceAccount?: string;
  destinationJar?: string;
  whoPaid?: string;
  category?: string;
  description: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'credit';
  owner: 'shared' | 'partner1' | 'partner2' | 'business';
  balance: number;
}

export interface Jar {
  id: string;
  name: string;
  balance: number;
}
