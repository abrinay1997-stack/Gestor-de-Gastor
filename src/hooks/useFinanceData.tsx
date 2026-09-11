import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { listenToAuthChanges } from '../services/firebase/auth';
import { 
  subscribeToUserAccounts, 
  subscribeToUserTransactions, 
  subscribeToUserCategories, 
  subscribeToUserBudgets,
  subscribeToUserJars,
  seedInitialCategories,
  seedInitialJars
} from '../services/firebase/db';
import { Account, Transaction, Category, Budget, Jar } from '../types';

interface FinanceState {
  user: User | null;
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  jars: Jar[];
  isLoading: boolean;
}

const FinanceContext = createContext<FinanceState>({
  user: null,
  accounts: [],
  transactions: [],
  categories: [],
  budgets: [],
  jars: [],
  isLoading: true,
});

export const FinanceProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [jars, setJars] = useState<Jar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = listenToAuthChanges(async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccounts([]);
        setTransactions([]);
        setCategories([]);
        setBudgets([]);
        setJars([]);
        setIsLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    setIsLoading(true);
    let unsubAccounts: () => void;
    let unsubTransactions: () => void;
    let unsubCategories: () => void;
    let unsubBudgets: () => void;
    let unsubJars: () => void;

    const setupData = async () => {
      unsubCategories = subscribeToUserCategories(user.uid, async (cats) => {
        if (cats.length === 0) {
          // If no categories, seed them
          await seedInitialCategories(user.uid);
        } else {
          setCategories(cats);
        }
      });
      unsubJars = subscribeToUserJars(user.uid, async (j) => {
        setJars(j.sort((a, b) => b.percentage - a.percentage));
      });
      unsubAccounts = subscribeToUserAccounts(user.uid, setAccounts);
      unsubTransactions = subscribeToUserTransactions(user.uid, setTransactions);
      unsubBudgets = subscribeToUserBudgets(user.uid, setBudgets);
      
      setIsLoading(false);
    };

    setupData();

    return () => {
      if (unsubAccounts) unsubAccounts();
      if (unsubTransactions) unsubTransactions();
      if (unsubCategories) unsubCategories();
      if (unsubBudgets) unsubBudgets();
      if (unsubJars) unsubJars();
    };
  }, [user]);

  return (
    <FinanceContext.Provider value={{ user, accounts, transactions, categories, budgets, jars, isLoading }}>
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinanceData = () => useContext(FinanceContext);
