import { db } from './auth';
import { 
  collection, doc, setDoc, getDoc, getDocs, query, where, 
  deleteDoc, updateDoc, onSnapshot, orderBy, writeBatch, increment, limit
} from 'firebase/firestore';
import { Account, Transaction, Category, Budget, Jar } from '../../types';

export const getCollection = (collectionName: string) => collection(db, collectionName);

export const subscribeToUserAccounts = (userId: string, callback: (accounts: Account[]) => void) => {
  const q = query(getCollection('accounts'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account)));
  });
};

export const subscribeToUserTransactions = (userId: string, callback: (transactions: Transaction[]) => void) => {
  const q = query(
    getCollection('transactions'), 
    where('userId', '==', userId), 
    orderBy('date', 'desc'),
    limit(200)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
  });
};

export const subscribeToUserCategories = (userId: string, callback: (categories: Category[]) => void) => {
  const q = query(getCollection('categories'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
  });
};

export const subscribeToUserBudgets = (userId: string, callback: (budgets: Budget[]) => void) => {
  const q = query(getCollection('budgets'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Budget)));
  });
};

export const subscribeToUserJars = (userId: string, callback: (jars: Jar[]) => void) => {
  const q = query(getCollection('jars'), where('userId', '==', userId));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Jar)));
  });
};

export const deleteAccountCascade = async (accountId: string) => {
  const batch = writeBatch(db);
  
  // Delete account
  batch.delete(doc(db, 'accounts', accountId));
  
  // Delete associated transactions
  const txQuery = query(getCollection('transactions'), where('accountId', '==', accountId));
  const txSnapshot = await getDocs(txQuery);
  txSnapshot.forEach(d => batch.delete(d.ref));
  
  // Delete associated jars
  const jarQuery = query(getCollection('jars'), where('accountId', '==', accountId));
  const jarSnapshot = await getDocs(jarQuery);
  jarSnapshot.forEach(d => batch.delete(d.ref));
  
  await batch.commit();
};

export const saveDocument = async <T extends { id: string }>(collectionName: string, data: T) => {
  const docRef = doc(db, collectionName, data.id);
  await setDoc(docRef, data);
};

export const updateDocument = async (collectionName: string, id: string, data: any) => {
  const docRef = doc(db, collectionName, id);
  await updateDoc(docRef, data);
};

export const deleteDocument = async (collectionName: string, id: string) => {
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
};

// Seeding initial categories
export const seedInitialCategories = async (userId: string) => {
  const defaultCategories: Omit<Category, 'id'>[] = [
    { userId, name: 'Comida', type: 'expense', icon: 'pizza', color: '#ef4444', isActive: true, createdAt: Date.now() },
    { userId, name: 'Hogar', type: 'expense', icon: 'home', color: '#3b82f6', isActive: true, createdAt: Date.now() },
    { userId, name: 'Transporte', type: 'expense', icon: 'car', color: '#f59e0b', isActive: true, createdAt: Date.now() },
    { userId, name: 'Compras', type: 'expense', icon: 'shopping-bag', color: '#ec4899', isActive: true, createdAt: Date.now() },
    { userId, name: 'Salud', type: 'expense', icon: 'heart', color: '#10b981', isActive: true, createdAt: Date.now() },
    { userId, name: 'Ocio', type: 'expense', icon: 'gamepad', color: '#8b5cf6', isActive: true, createdAt: Date.now() },
    { userId, name: 'Salario', type: 'income', icon: 'briefcase', color: '#10b981', isActive: true, createdAt: Date.now() },
    { userId, name: 'Negocio', type: 'income', icon: 'building', color: '#3b82f6', isActive: true, createdAt: Date.now() }
  ];

  const batch = writeBatch(db);
  for (const cat of defaultCategories) {
    const newDocRef = doc(getCollection('categories'));
    batch.set(newDocRef, { ...cat, id: newDocRef.id });
  }
  await batch.commit();
};

export const seedInitialJars = async (userId: string, accountId: string) => {
  const defaultJars: Omit<Jar, 'id'>[] = [
    { userId, accountId, name: 'Gastos Básicos', percentage: 55, balance: 0, color: '#3b82f6', icon: 'home', createdAt: Date.now() },
    { userId, accountId, name: 'Ocio y Diversión', percentage: 10, balance: 0, color: '#ec4899', icon: 'smile', createdAt: Date.now() },
    { userId, accountId, name: 'Ahorro a Largo Plazo', percentage: 10, balance: 0, color: '#10b981', icon: 'piggy-bank', createdAt: Date.now() },
    { userId, accountId, name: 'Libertad Financiera', percentage: 10, balance: 0, color: '#f59e0b', icon: 'trending-up', createdAt: Date.now() },
    { userId, accountId, name: 'Educación', percentage: 10, balance: 0, color: '#8b5cf6', icon: 'book', createdAt: Date.now() },
    { userId, accountId, name: 'Proyectos', percentage: 2.5, balance: 0, color: '#06b6d4', icon: 'star', createdAt: Date.now() },
    { userId, accountId, name: 'Donaciones', percentage: 2.5, balance: 0, color: '#f43f5e', icon: 'heart', createdAt: Date.now() }
  ];

  const batch = writeBatch(db);
  for (const jar of defaultJars) {
    const newDocRef = doc(getCollection('jars'));
    batch.set(newDocRef, { ...jar, id: newDocRef.id });
  }
  await batch.commit();
};

export const addTransactionAndUpdateBalances = async (tx: Transaction, jars: Jar[]) => {
  const batch = writeBatch(db);
  
  // 1. Save Transaction
  const txRef = doc(getCollection('transactions'), tx.id);
  batch.set(txRef, tx);

  // 2. Update Account Balances
  const accRef = doc(getCollection('accounts'), tx.accountId);
  
  if (tx.type === 'income') {
    batch.update(accRef, { balance: increment(tx.amount) });
  } else if (tx.type === 'expense') {
    batch.update(accRef, { balance: increment(-tx.amount) });
  } else if (tx.type === 'transfer') {
    // Decrease source account
    batch.update(accRef, { balance: increment(-tx.amount) });
    // Increase destination account
    if (tx.destinationAccountId) {
      const destAccRef = doc(getCollection('accounts'), tx.destinationAccountId);
      batch.update(destAccRef, { balance: increment(tx.amount) });
    }
  }

  // 3. Update Jars Balance
  if (tx.type === 'income' && tx.distributedToJars) {
    // Distribute to all jars for this account
    const accountJars = jars.filter(j => j.accountId === tx.accountId);
    accountJars.forEach(jar => {
      const jarRef = doc(getCollection('jars'), jar.id);
      const allocatedAmount = tx.amount * (jar.percentage / 100);
      batch.update(jarRef, { balance: increment(allocatedAmount) });
    });
  } else if (tx.jarId) {
    // Update specific jar (only for income/expense currently)
    if (tx.type === 'income' || tx.type === 'expense') {
      const jarRef = doc(getCollection('jars'), tx.jarId);
      const jarDiff = tx.type === 'income' ? tx.amount : -tx.amount;
      batch.update(jarRef, { balance: increment(jarDiff) });
    }
  }

  await batch.commit();
};

export const deleteTransactionAndUpdateBalances = async (tx: Transaction, jars: Jar[]) => {
  const batch = writeBatch(db);
  
  // 1. Delete Transaction
  const txRef = doc(getCollection('transactions'), tx.id);
  batch.delete(txRef);

  // 2. Reverse Account Balances
  const accRef = doc(getCollection('accounts'), tx.accountId);
  
  if (tx.type === 'income') {
    batch.update(accRef, { balance: increment(-tx.amount) });
  } else if (tx.type === 'expense') {
    batch.update(accRef, { balance: increment(tx.amount) });
  } else if (tx.type === 'transfer') {
    // Reverse source account decrease
    batch.update(accRef, { balance: increment(tx.amount) });
    // Reverse destination account increase
    if (tx.destinationAccountId) {
      const destAccRef = doc(getCollection('accounts'), tx.destinationAccountId);
      batch.update(destAccRef, { balance: increment(-tx.amount) });
    }
  }

  // 3. Reverse Jars Balance
  if (tx.type === 'income' && tx.distributedToJars) {
    const accountJars = jars.filter(j => j.accountId === tx.accountId);
    accountJars.forEach(jar => {
      const jarRef = doc(getCollection('jars'), jar.id);
      const allocatedAmount = tx.amount * (jar.percentage / 100);
      batch.update(jarRef, { balance: increment(-allocatedAmount) });
    });
  } else if (tx.jarId) {
    if (tx.type === 'income' || tx.type === 'expense') {
      const jarRef = doc(getCollection('jars'), tx.jarId);
      const jarDiff = tx.type === 'income' ? -tx.amount : tx.amount;
      batch.update(jarRef, { balance: increment(jarDiff) });
    }
  }

  await batch.commit();
};

export const editTransactionAndUpdateBalances = async (oldTx: Transaction, newTx: Transaction, jars: Jar[]) => {
  const batch = writeBatch(db);
  
  const accountDeltas: Record<string, number> = {};
  const jarDeltas: Record<string, number> = {};

  const addAccountDelta = (id: string, delta: number) => {
    if (!accountDeltas[id]) accountDeltas[id] = 0;
    accountDeltas[id] += delta;
  };

  const addJarDelta = (id: string, delta: number) => {
    if (!jarDeltas[id]) jarDeltas[id] = 0;
    jarDeltas[id] += delta;
  };

  // 1. REVERSE OLD TX
  if (oldTx.type === 'income') {
    addAccountDelta(oldTx.accountId, -oldTx.amount);
    if (oldTx.distributedToJars) {
      const accountJars = jars.filter(j => j.accountId === oldTx.accountId);
      accountJars.forEach(jar => {
        addJarDelta(jar.id, -(oldTx.amount * (jar.percentage / 100)));
      });
    } else if (oldTx.jarId) {
      addJarDelta(oldTx.jarId, -oldTx.amount);
    }
  } else if (oldTx.type === 'expense') {
    addAccountDelta(oldTx.accountId, oldTx.amount);
    if (oldTx.jarId) {
      addJarDelta(oldTx.jarId, oldTx.amount);
    }
  } else if (oldTx.type === 'transfer') {
    addAccountDelta(oldTx.accountId, oldTx.amount);
    if (oldTx.destinationAccountId) {
      addAccountDelta(oldTx.destinationAccountId, -oldTx.amount);
    }
  }

  // 2. APPLY NEW TX
  if (newTx.type === 'income') {
    addAccountDelta(newTx.accountId, newTx.amount);
    if (newTx.distributedToJars) {
      const accountJars = jars.filter(j => j.accountId === newTx.accountId);
      accountJars.forEach(jar => {
        addJarDelta(jar.id, (newTx.amount * (jar.percentage / 100)));
      });
    } else if (newTx.jarId) {
      addJarDelta(newTx.jarId, newTx.amount);
    }
  } else if (newTx.type === 'expense') {
    addAccountDelta(newTx.accountId, -newTx.amount);
    if (newTx.jarId) {
      addJarDelta(newTx.jarId, -newTx.amount);
    }
  } else if (newTx.type === 'transfer') {
    addAccountDelta(newTx.accountId, -newTx.amount);
    if (newTx.destinationAccountId) {
      addAccountDelta(newTx.destinationAccountId, newTx.amount);
    }
  }

  // 3. APPLY BATCH UPDATES
  Object.entries(accountDeltas).forEach(([accId, delta]) => {
    if (delta !== 0) {
      batch.update(doc(getCollection('accounts'), accId), { balance: increment(delta) });
    }
  });

  Object.entries(jarDeltas).forEach(([jarId, delta]) => {
    if (delta !== 0) {
      batch.update(doc(getCollection('jars'), jarId), { balance: increment(delta) });
    }
  });

  // 4. UPDATE TX DOC
  const txRef = doc(getCollection('transactions'), newTx.id);
  batch.set(txRef, newTx);

  await batch.commit();
};
