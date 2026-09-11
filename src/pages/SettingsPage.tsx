import React from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import { logOut } from '../services/firebase/auth';
import { LogOut, User, Bell, Shield, Wallet } from 'lucide-react';

export const SettingsPage = () => {
  const { user } = useFinanceData();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
      <header className="mb-2">
        <p className="text-stone-500 font-medium text-sm mb-1 uppercase tracking-wider">Preferencias</p>
        <h1 className="text-2xl font-bold text-stone-900">Ajustes</h1>
      </header>

      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex items-center gap-4">
        <img src={user?.photoURL || ''} alt="Profile" className="w-16 h-16 rounded-2xl bg-stone-100 object-cover" />
        <div>
          <h2 className="font-bold text-stone-900 text-lg">{user?.displayName}</h2>
          <p className="text-stone-500 text-sm">{user?.email}</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl overflow-hidden border border-stone-200 shadow-sm">
        <div className="divide-y divide-stone-100">
          <SettingItem icon={<User size={20} />} title="Perfil de usuario" description="Gestiona tu información personal" />
          <SettingItem icon={<Wallet size={20} />} title="Moneda principal" description="USD ($) - Dólar Estadounidense" />
          <SettingItem icon={<Bell size={20} />} title="Notificaciones" description="Avisos de presupuesto y recordatorios" />
          <SettingItem icon={<Shield size={20} />} title="Privacidad y Seguridad" description="FaceID y bloqueo automático" />
        </div>
      </div>

      <button 
        onClick={logOut}
        className="mt-4 bg-rose-50 text-rose-600 font-bold py-4 rounded-2xl flex justify-center items-center gap-2 hover:bg-rose-100 transition-colors w-full"
      >
        <LogOut size={20} />
        Cerrar Sesión
      </button>
    </div>
  );
};

const SettingItem = ({ icon, title, description }: any) => (
  <button className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors text-left">
    <div className="flex items-center gap-4">
      <div className="p-2 bg-stone-100 text-stone-600 rounded-xl">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-stone-900">{title}</h3>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
    </div>
    <div className="text-stone-400">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </div>
  </button>
);
