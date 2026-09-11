import React, { useState } from 'react';
import { Home, PieChart, Plus, Wallet, LogOut, Settings, Briefcase, LayoutGrid } from 'lucide-react';
import { useFinanceData } from '../../hooks/useFinanceData';
import { logOut } from '../../services/firebase/auth';

interface AppLayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'accounts' | 'jars' | 'transactions' | 'analytics' | 'settings';
  onTabChange: (tab: 'dashboard' | 'accounts' | 'jars' | 'transactions' | 'analytics' | 'settings') => void;
  onOpenQuickAdd: () => void;
}

export const AppLayout = ({ children, activeTab, onTabChange, onOpenQuickAdd }: AppLayoutProps) => {
  const { user } = useFinanceData();

  return (
    <div className="min-h-screen bg-stone-50 font-sans flex flex-col md:flex-row pb-24 md:pb-0">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-stone-200 p-6 shadow-sm sticky top-0 h-screen shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-bold text-lg">
            F
          </div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Finanzas</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem icon={<Home />} label="Inicio" active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
          <NavItem icon={<Briefcase />} label="Cuentas" active={activeTab === 'accounts'} onClick={() => onTabChange('accounts')} />
          <NavItem icon={<LayoutGrid />} label="Jarras (Sobres)" active={activeTab === 'jars'} onClick={() => onTabChange('jars')} />
          <NavItem icon={<Wallet />} label="Movimientos" active={activeTab === 'transactions'} onClick={() => onTabChange('transactions')} />
          <NavItem icon={<PieChart />} label="Estadísticas" active={activeTab === 'analytics'} onClick={() => onTabChange('analytics')} />
          <NavItem icon={<Settings />} label="Ajustes" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
        </nav>

        <button 
          onClick={onOpenQuickAdd}
          className="mt-8 bg-emerald-600 text-white p-4 rounded-2xl font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Plus size={20} />
          Registrar Operación
        </button>

        <div className="mt-auto pt-6 border-t border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3 truncate">
            <img src={user?.photoURL || ''} alt="User" className="w-8 h-8 rounded-full bg-stone-200" />
            <p className="text-sm font-medium text-stone-700 truncate">{user?.displayName}</p>
          </div>
          <button onClick={logOut} className="text-stone-400 hover:text-stone-700 p-1">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 overflow-y-auto h-screen relative">
        {children}
      </main>

      {/* Floating Action Button (Mobile) */}
      <div className="md:hidden fixed bottom-24 right-4 z-40">
        <button 
          onClick={onOpenQuickAdd}
          className="w-14 h-14 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus size={28} />
        </button>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-stone-200 flex items-center justify-around pb-safe pt-2 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30">
        <MobileNavItem icon={<Home size={24} />} label="Inicio" active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
        <MobileNavItem icon={<Briefcase size={24} />} label="Cuentas" active={activeTab === 'accounts'} onClick={() => onTabChange('accounts')} />
        <MobileNavItem icon={<LayoutGrid size={24} />} label="Jarras" active={activeTab === 'jars'} onClick={() => onTabChange('jars')} />
        <MobileNavItem icon={<Wallet size={24} />} label="Flujo" active={activeTab === 'transactions'} onClick={() => onTabChange('transactions')} />
        <MobileNavItem icon={<Settings size={24} />} label="Más" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
      </nav>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm ${
      active ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
    }`}
  >
    {icon}
    {label}
  </button>
);

const MobileNavItem = ({ icon, label, active, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-16 h-14 gap-1 transition-colors ${
      active ? 'text-emerald-600' : 'text-stone-400 hover:text-stone-700'
    }`}
  >
    <div className={`p-1 rounded-xl transition-all ${active ? 'bg-emerald-50' : 'bg-transparent'}`}>
      {icon}
    </div>
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);
