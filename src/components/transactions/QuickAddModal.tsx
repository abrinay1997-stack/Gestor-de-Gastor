import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { QuickAddForm } from './QuickAddForm';
import { Transaction } from '../../types';

export const QuickAddModal = ({ isOpen, onClose, initialData }: { isOpen: boolean, onClose: () => void, initialData?: Transaction }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-40"
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 w-full bg-white rounded-t-3xl z-50 p-6 shadow-2xl md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-3xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-stone-900 tracking-tight">
                {initialData ? 'Editar Operación' : 'Registrar Operación'}
              </h2>
              <button onClick={onClose} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:text-stone-900">
                <X size={20} />
              </button>
            </div>
            
            <QuickAddForm onClose={onClose} initialData={initialData} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
