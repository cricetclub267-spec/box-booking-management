'use client';

import React from 'react';
import { useToastStore, Toast } from '@/lib/store/toast-store';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const icons = {
  success: <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />,
  error: <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
};

const styles = {
  success: 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-100/20',
  error: 'bg-red-50/95 border-red-200 text-red-900 shadow-red-100/20',
  warning: 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-100/20',
  info: 'bg-blue-50/95 border-blue-200 text-blue-900 shadow-blue-100/20',
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismissToast } = useToastStore();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className={`pointer-events-auto w-full flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-lg ${styles[toast.type]}`}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-relaxed pr-2">{toast.message}</p>
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="text-muted-foreground/60 hover:text-foreground transition-colors p-0.5 rounded-lg hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastStore();

  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-[340px] sm:max-w-sm pointer-events-none px-4 sm:px-0">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
