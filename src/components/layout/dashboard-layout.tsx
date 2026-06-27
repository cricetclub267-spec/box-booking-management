'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  CreditCard, 
  FileText, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Search, 
  Bell, 
  HelpCircle,
  Activity,
  ChevronRight,
  TrendingUp,
  Sparkles,
  ArrowDownCircle,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import Link from 'next/link';

// Simple mock in-app notifications
interface TurfNotification {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'upcoming' | 'payment' | 'cancelled' | 'system';
  read: boolean;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout, initialize } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Persist sidebar state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') setSidebarCollapsed(true);
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
  };
  
  // Close popovers on click outside
  const notificationRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<TurfNotification[]>([]);

  useEffect(() => {
    const defaultNotifs: TurfNotification[] = [
      { id: 'n1', title: 'Upcoming Booking', desc: 'Sachin Tendulkar is scheduled tomorrow at 7:00 AM (Box 1)', time: '10m ago', type: 'upcoming', read: false },
      { id: 'n2', title: 'Pending Payment', desc: 'Virat Kohli has ₹500 outstanding dues on today\'s booking', time: '1h ago', type: 'payment', read: false },
      { id: 'n3', title: 'Booking Cancelled', desc: 'Booking #book_1928 for Box 2 has been cancelled', time: '3h ago', type: 'cancelled', read: true },
    ];

    const saved = localStorage.getItem('turf_notifications');
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        setNotifications(defaultNotifs);
      }
    } else {
      setNotifications(defaultNotifs);
      localStorage.setItem('turf_notifications', JSON.stringify(defaultNotifs));
    }
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    // Close mobile menu on route change
    setMobileMenuOpen(false);
    setShowNotifications(false);
  }, [pathname]);

  // Click outside to close notifications
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center flex-col gap-4">
        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Calendar / Bookings', path: '/bookings', icon: Calendar },
    { name: 'Customers', path: '/customers', icon: Users },
    { name: 'Payments', path: '/payments', icon: CreditCard },
    { name: 'Expenses', path: '/expenses', icon: ArrowDownCircle },
    { name: 'Reports', path: '/reports', icon: FileText },
  ];

  const generalItems = [
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    localStorage.setItem('turf_notifications', JSON.stringify(updated));
  };

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    
    // Redirect to bookings or customers page with query parameters
    if (globalSearch.match(/^\d+$/)) {
      // Numbers -> check customers
      router.push(`/customers?search=${encodeURIComponent(globalSearch)}`);
    } else {
      router.push(`/bookings?search=${encodeURIComponent(globalSearch)}`);
    }
  };

  return (
    <div className="min-h-screen flex bg-background font-sans">
      {/* SIDEBAR - DESKTOP */}
      <aside className={`hidden lg:flex flex-col bg-card border-r border-border/80 shrink-0 relative transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-[72px] p-3' : 'w-64 p-6'}`}>
        {/* Brand Logo */}
        <div className={`flex items-center mb-8 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-2'}`}>
          <img 
            src="/logo.png" 
            alt="360 Club Box Logo" 
            className={`object-contain ${sidebarCollapsed ? 'h-8 max-w-[32px]' : 'h-9 max-w-[45px]'}`}
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {!sidebarCollapsed && (
            <div>
              <h2 className="font-bold text-sm text-foreground tracking-tight leading-tight">360 Club Box</h2>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider leading-none mt-0.5">Management</p>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 flex flex-col justify-between">
          <div className="space-y-6">
            <div>
              {!sidebarCollapsed && (
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest px-3 mb-3">Menu</p>
              )}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center rounded-xl font-semibold transition-all group ${
                        sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5 text-sm'
                      } ${
                        isActive
                          ? 'bg-primary text-white shadow-md shadow-primary/10'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-105 ${isActive ? 'text-white' : 'text-muted-foreground/75 group-hover:text-foreground'}`} />
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div>
              {!sidebarCollapsed && (
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest px-3 mb-3">General</p>
              )}
              <nav className="space-y-1">
                {generalItems.map((item) => {
                  const isActive = pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      title={sidebarCollapsed ? item.name : undefined}
                      className={`flex items-center rounded-xl font-semibold transition-all group ${
                        sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5 text-sm'
                      } ${
                        isActive
                          ? 'bg-primary text-white shadow-md shadow-primary/10'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground/75 group-hover:text-foreground'}`} />
                      {!sidebarCollapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* User Section + Collapse Toggle */}
          <div className="pt-6 border-t border-border/80 space-y-3">
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/25 text-xs" title={user.email}>
                  {user.role === 'admin' ? 'A' : 'P'}
                </div>
              </div>
            ) : (
              <div className="bg-accent/40 rounded-xl p-3.5 border border-primary/10 relative overflow-hidden flex items-center gap-2">
                <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 opacity-5">
                  <Sparkles className="h-16 w-16" />
                </div>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/25">
                  {user.role === 'admin' ? 'A' : 'P'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-foreground">{user.email}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-wider -mt-0.5">
                    {user.role === 'admin' ? 'Turf Owner' : 'Partner (Read-only)'}
                  </p>
                </div>
              </div>
            )}

            {/* Collapse / Expand Toggle */}
            <button
              onClick={toggleSidebar}
              className={`w-full flex items-center gap-2 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-all cursor-pointer ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'}`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE SIDEBAR (Drawer overlay) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden bg-black/40 backdrop-blur-sm">
          <aside className="w-64 bg-card p-6 flex flex-col justify-between border-r border-border h-full animate-slide-in">
            <div>
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <img 
                    src="/logo.png" 
                    alt="360 Club Box Logo" 
                    className="h-8 w-auto object-contain max-w-[40px]"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <h2 className="font-bold text-sm text-foreground leading-tight">360 Club Box</h2>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 hover:bg-muted rounded-lg"
                >
                  <X className="h-5 w-5 text-foreground" />
                </button>
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="h-px bg-border/80 my-4"></div>

              <nav className="space-y-1">
                {generalItems.map((item) => {
                  const isActive = pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="bg-accent/40 rounded-xl p-3 border border-primary/10 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {user.role === 'admin' ? 'A' : 'P'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-foreground">{user.email}</p>
                  <p className="text-[9px] font-bold text-primary uppercase">{user.role}</p>
                </div>
              </div>
              
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* HEADER BAR */}
        <header className="h-16 bg-card border-b border-border/80 flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-30">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Search Bar */}
            <form onSubmit={handleGlobalSearch} className="hidden md:flex items-center max-w-sm w-full relative">
              <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search phone, customer, or booking ID..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-10 pr-12 py-1.5 bg-muted/40 rounded-xl border border-border/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all placeholder:text-muted-foreground/60"
              />
              <kbd className="absolute right-2 px-1.5 py-0.5 border border-border rounded-lg text-[9px] text-muted-foreground bg-card pointer-events-none font-sans font-semibold">
                ↵
              </kbd>
            </form>
          </div>

          {/* Quick Actions & Notifications */}
          <div className="flex items-center gap-3">
            {/* Read-only warning for partner */}
            {user.role === 'partner' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                View-Only Access
              </span>
            )}

            {/* Notification Badge & Menu */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all relative cursor-pointer"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-card animate-pulse"></span>
                )}
              </button>

              {/* Notification Dropdown Popover */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-card rounded-2xl shadow-xl border border-border overflow-hidden animate-slide-up z-50">
                  <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-primary" />
                      In-App Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button 
                        onClick={markAllRead}
                        className="text-[10px] text-primary hover:underline font-bold cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border/60">
                    {notifications.length === 0 ? (
                      <p className="text-center py-8 text-xs text-muted-foreground">No recent alerts</p>
                    ) : (
                      notifications.map((notif) => {
                        let colorClass = 'bg-primary/10 text-primary';
                        if (notif.type === 'payment') colorClass = 'bg-amber-100 text-amber-800';
                        if (notif.type === 'cancelled') colorClass = 'bg-red-100 text-red-800';

                        return (
                          <div 
                            key={notif.id} 
                            className={`p-3.5 text-left transition-colors flex items-start gap-3 hover:bg-muted/30 ${
                              notif.read ? 'opacity-70' : 'bg-primary/5 font-semibold'
                            }`}
                          >
                            <div className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold ${colorClass}`}>
                              {notif.type === 'upcoming' && '🏏'}
                              {notif.type === 'payment' && '₹'}
                              {notif.type === 'cancelled' && '✕'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-foreground leading-tight">{notif.title}</p>
                              <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 truncate-2-lines">{notif.desc}</p>
                              <p className="text-[9px] text-muted-foreground/60 mt-1">{notif.time}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Help Link */}
            <button className="hidden sm:inline-flex p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer">
              <HelpCircle className="h-5 w-5" />
            </button>

            {/* Small divider */}
            <div className="h-6 w-px bg-border/80 hidden sm:block"></div>

            {/* Header Logout Button replacing owner account text */}
            <div className="hidden sm:flex items-center gap-3 pl-1">
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground font-semibold leading-tight">{user.email}</p>
                <p className="text-[9px] text-primary font-black uppercase tracking-wider leading-none mt-0.5">
                  {user.role === 'admin' ? 'Admin' : 'Partner'}
                </p>
              </div>
              <button
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="flex items-center gap-2 px-3.5 py-2 border border-red-200 bg-red-50/50 hover:bg-red-50 hover:border-red-300 text-red-600 font-bold rounded-xl text-xs transition-all cursor-pointer group shadow-sm"
              >
                <LogOut className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 bg-background/50 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
