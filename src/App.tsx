import { useState } from 'react';
import { FinanceProvider, useFinanceData } from './hooks/useFinanceData';
import { AppLayout } from './components/layout/AppLayout';
import { signInWithGoogle } from './services/firebase/auth';
import { Wallet, Loader2, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { JarsPage } from './pages/JarsPage';
import { QuickAddModal } from './components/transactions/QuickAddModal';

function MainApp() {
  const { user, isLoading } = useFinanceData();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'jars' | 'transactions' | 'analytics' | 'settings'>('dashboard');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
        <p className="text-stone-500 font-medium">Cargando tus finanzas...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 flex flex-col items-center text-center border border-stone-100"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mb-8 rotate-3 shadow-sm border border-emerald-200">
            <Wallet size={40} />
          </div>
          <h1 className="text-3xl font-bold text-stone-900 mb-3 tracking-tight">Finanzas Claras</h1>
          <p className="text-stone-500 mb-10 leading-relaxed">
            Controla tu dinero, entiende tus hábitos y toma mejores decisiones financieras en segundos.
          </p>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-stone-900 hover:bg-stone-800 text-white py-4 px-6 rounded-2xl font-medium transition-colors shadow-md"
          >
            <LogIn size={20} />
            <span>Comenzar con Google</span>
          </button>
          
          <p className="text-xs text-stone-400 mt-6 max-w-[280px]">
            Tus datos están encriptados y se almacenan de forma segura en la nube.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <AppLayout 
      activeTab={activeTab as any} 
      onTabChange={setActiveTab as any}
      onOpenQuickAdd={() => setIsQuickAddOpen(true)}
    >
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'accounts' && <AccountsPage />}
      {activeTab === 'jars' && <JarsPage />}
      {activeTab === 'transactions' && <TransactionsPage />}
      {activeTab === 'analytics' && <AnalyticsPage />}
      {activeTab === 'settings' && <SettingsPage />}
      
      <QuickAddModal isOpen={isQuickAddOpen} onClose={() => setIsQuickAddOpen(false)} />
    </AppLayout>
  );
}

export default function App() {
  return (
    <FinanceProvider>
      <MainApp />
    </FinanceProvider>
  );
}
