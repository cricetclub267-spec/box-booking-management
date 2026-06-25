'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DropdownContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left" ref={containerRef}>
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

export const DropdownMenuTrigger: React.FC<{ children: React.ReactElement<any>; asChild?: boolean }> = ({ children, asChild }) => {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error('DropdownMenuTrigger must be used within a DropdownMenu');
  const { open, setOpen } = context;
  
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      if (children.props && children.props.onClick) children.props.onClick(e);
      setOpen(!open);
    }
  });
};

export const DropdownMenuContent: React.FC<{
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  alignOffset?: number;
}> = ({ children, className = '', align = 'end', side = 'bottom', sideOffset = 4, alignOffset = 0 }) => {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error('DropdownMenuContent must be used within a DropdownMenu');
  const { open } = context;

  let alignClass = 'left-0 sm:left-auto sm:right-0';
  if (align === 'start') alignClass = 'left-0';
  if (align === 'center') alignClass = 'left-1/2 -translate-x-1/2';

  let sideClass = 'top-full mt-2';
  if (side === 'top') sideClass = 'bottom-full mb-2';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: side === 'top' ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: side === 'top' ? 4 : -4 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className={`absolute z-50 min-w-[10rem] overflow-hidden rounded-2xl border border-border/80 bg-card p-1.5 shadow-xl ${alignClass} ${sideClass} ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const DropdownMenuItem: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}> = ({ children, className = '', onClick, variant = 'default', disabled = false }) => {
  const context = React.useContext(DropdownContext);
  if (!context) throw new Error('DropdownMenuItem must be used within a DropdownMenu');
  const { setOpen } = context;

  let variantClass = 'hover:bg-muted text-foreground/80 hover:text-foreground';
  if (variant === 'destructive') variantClass = 'text-red-600 hover:bg-red-50 hover:text-red-700';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (onClick) onClick();
        setOpen(false);
      }}
      className={`w-full text-left flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 ${variantClass} ${className}`}
    >
      {children}
    </button>
  );
};

export const DropdownMenuLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest ${className}`}>
      {children}
    </div>
  );
};

export const DropdownMenuSeparator: React.FC = () => {
  return <div className="h-px bg-border/80 my-1.5" />;
};

export const DropdownMenuShortcut: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <span className="ml-auto text-[9px] font-mono font-bold text-muted-foreground/60 tracking-wider">
      {children}
    </span>
  );
};

export const DropdownMenuGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="space-y-0.5">{children}</div>;
};

export const DropdownMenuSub: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="relative">{children}</div>;
};

export const DropdownMenuSubTrigger: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="w-full text-left flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl text-foreground/80 hover:bg-muted cursor-pointer">
      {children}
    </div>
  );
};

export const DropdownMenuSubContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="pl-3 mt-1 space-y-0.5 border-l border-border/60 ml-2">
      {children}
    </div>
  );
};
