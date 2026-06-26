'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { 
  getCustomers, 
  getBookings, 
  createCustomer,
  getBookingPaymentSummary
} from '@/lib/db/db-service';
import { Customer, Booking } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { 
  Search, 
  Plus, 
  User, 
  Phone, 
  Calendar, 
  IndianRupee, 
  TrendingUp, 
  FileSpreadsheet, 
  ChevronRight,
  UserPlus,
  X
} from 'lucide-react';
import Link from 'next/link';
import { hasSupabaseCredentials, supabase } from '@/lib/db/supabase';

interface CustomerWithStats extends Customer {
  totalBookings: number;
  totalRevenue: number;
}

export default function CustomersPage() {
  const { user } = useAuthStore();
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Create Customer Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allCustomers = await getCustomers();
      const allBookings = await getBookings();
      
      // Calculate dynamic stats
      const customersWithStats = await Promise.all(allCustomers.map(async (cust) => {
        const custBookings = allBookings.filter(b => b.customer_id === cust.id);
        const activeBookings = custBookings.filter(b => b.status !== 'Cancelled');
        
        let totalRevenue = 0;
        for (const booking of activeBookings) {
          totalRevenue += Number(booking.final_amount);
        }

        return {
          ...cust,
          totalBookings: custBookings.length,
          totalRevenue
        };
      }));

      // Sort by name
      customersWithStats.sort((a, b) => a.name.localeCompare(b.name));
      setCustomers(customersWithStats);
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // 1. Tab visibility/focus listener
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // 2. Realtime listener (if Supabase is active)
    let channel: any = null;
    if (hasSupabaseCredentials() && supabase) {
      channel = supabase
        .channel('customers-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          () => {
            loadData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            loadData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          () => {
            loadData();
          }
        )
        .subscribe();
    }

    // 3. Fallback polling (every 10 seconds)
    const interval = setInterval(() => {
      loadData();
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(interval);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Handle Query Search from global search bar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const querySearch = urlParams.get('search');
      if (querySearch) {
        setSearchTerm(querySearch);
        // Clear query param to allow clearing filter locally
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [customers]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newName.trim() || !newPhone.trim()) {
      setFormError('Please fill in all fields');
      return;
    }

    if (!newPhone.match(/^\d{10}$/)) {
      setFormError('Phone number must be exactly 10 digits');
      return;
    }

    setSubmitting(true);
    try {
      await createCustomer(newName.trim(), newPhone.trim());
      setNewName('');
      setNewPhone('');
      setShowAddModal(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Customer Directory</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Manage customer profiles and lifetime value tracking</p>
          </div>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Add Customer
            </button>
          )}
        </div>

        {/* Search and Filters Bar */}
        <div className="bg-card rounded-2xl border border-border/80 p-4 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or mobile number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all"
            />
          </div>
          <div className="text-xs text-muted-foreground w-full sm:text-right">
            Showing {filteredCustomers.length} of {customers.length} customers
          </div>
        </div>

        {/* Customer Table/Cards Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-muted-foreground font-medium">Loading customer database...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/80 p-12 text-center shadow-sm">
            <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-bold text-sm text-foreground">No Customers Found</p>
            <p className="text-xs text-muted-foreground mt-1">Try resetting your search filter or add a new customer profile.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCustomers.map((cust) => (
              <Link 
                key={cust.id}
                href={`/customers/${cust.id}`}
                className="bg-card border border-border/80 rounded-2xl p-5 hover:border-primary/30 hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 bg-accent text-primary rounded-xl flex items-center justify-center font-bold text-sm">
                      {cust.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-1" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground mt-3 group-hover:text-primary transition-colors">{cust.name}</h3>
                  
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span>{cust.phone}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 mt-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span>Registered: {new Date(cust.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-border/50 text-left">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Bookings</span>
                    <span className="text-sm font-bold text-foreground mt-0.5 block">{cust.totalBookings}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Spent</span>
                    <span className="text-sm font-bold text-primary flex items-center mt-0.5">
                      <IndianRupee className="h-3 w-3" />
                      {cust.totalRevenue.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Add Customer Modal Drawer */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in">
              <div className="bg-primary p-6 text-white flex items-center justify-between">
                <h3 className="font-bold text-md flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Register New Customer
                </h3>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-1 hover:bg-white/10 rounded-lg text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="p-6 space-y-4">
                {formError && (
                  <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">
                    {formError}
                  </p>
                )}

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-muted-foreground" htmlFor="custName">
                    Customer Name
                  </label>
                  <input
                    id="custName"
                    type="text"
                    placeholder="Enter full name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all"
                  />
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-muted-foreground" htmlFor="custPhone">
                    Mobile Number
                  </label>
                  <input
                    id="custPhone"
                    type="text"
                    maxLength={10}
                    placeholder="Enter 10-digit mobile number"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-2.5 bg-muted text-foreground/80 hover:bg-muted/80 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-primary text-white hover:bg-primary/95 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-75"
                  >
                    {submitting ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      'Save Customer'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
