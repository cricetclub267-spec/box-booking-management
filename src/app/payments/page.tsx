'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { 
  getBookings, 
  getPayments, 
  getBookingPaymentSummary,
  addPayment,
  getBookingStatus
} from '@/lib/db/db-service';
import { Booking, Payment, PaymentMethod, PaymentStatus } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToastStore } from '@/lib/store/toast-store';
import { sanitizeInput, checkRateLimit } from '@/lib/security';
import { hasSupabaseCredentials, supabase } from '@/lib/db/supabase';

import { 
  IndianRupee, 
  Search, 
  Filter, 
  CreditCard, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  Plus, 
  X, 
  AlertCircle,
  FileSpreadsheet,
  Receipt,
  ChevronDown
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';

export default function PaymentsPage() {
  const { user } = useAuthStore();
  const { showToast } = useToastStore();
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummaries, setPaymentSummaries] = useState<Record<string, { totalPaid: number; pendingAmount: number; status: PaymentStatus }>>({});
  const [loading, setLoading] = useState(true);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'balances' | 'receipts'>('balances');

  // Log Payment Form
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [logAmount, setLogAmount] = useState<string>('');
  const [logMethod, setLogMethod] = useState<PaymentMethod>('UPI');
  const [logError, setLogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allBookings = await getBookings();
      const allPayments = await getPayments();
      setPayments(allPayments);
      setBookings(allBookings);

      const summaries: typeof paymentSummaries = {};
      for (const b of allBookings) {
        summaries[b.id] = await getBookingPaymentSummary(b.id);
      }
      setPaymentSummaries(summaries);
    } catch (e) {
      console.error(e);
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
        .channel('payments-realtime')
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
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Totals calculations based on active (non-cancelled) bookings
  const activeBookings = bookings.filter(b => b.status !== 'Cancelled');
  
  const totalOutstanding = activeBookings.reduce((sum, b) => {
    const summary = paymentSummaries[b.id];
    return sum + (summary ? summary.pendingAmount : 0);
  }, 0);

  const totalCollected = payments.reduce((sum, p) => {
    // Only sum payments for bookings that are not soft-deleted
    const bookingExists = bookings.some(b => b.id === p.booking_id);
    return sum + (bookingExists ? Number(p.amount_paid) : 0);
  }, 0);

  const totalDiscounts = activeBookings.reduce((sum, b) => sum + Number(b.discount), 0);

  // Filtered Bookings (Balances tab)
  const filteredBookings = activeBookings.filter(b => {
    const summary = paymentSummaries[b.id];
    const matchSearch = b.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        b.customer?.phone.includes(searchTerm) || 
                        b.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchStatus = statusFilter === 'all' || (summary && summary.status === statusFilter);
    return matchSearch && matchStatus;
  });

  // Filtered Receipts (Receipts tab)
  const filteredReceipts = payments.filter(p => {
    const booking = bookings.find(b => b.id === p.booking_id);
    const matchSearch = booking?.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        booking?.customer?.phone.includes(searchTerm) ||
                        p.booking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchMethod = methodFilter === 'all' || p.payment_method === methodFilter;
    return matchSearch && matchMethod;
  });

  // Log Payment submit
  const handleLogPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogError(null);
    if (!selectedBooking) return;

    // Rate Limiting Check
    const rateCheck = checkRateLimit('payment_submit', 5, 10000, 5000);
    if (!rateCheck.allowed) {
      const errMsg = `Too many payment actions. Please wait ${rateCheck.retryAfterSeconds} seconds.`;
      setLogError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    const amt = Number(logAmount);
    if (!amt || amt <= 0) {
      const errMsg = 'Please enter a valid payment amount greater than 0';
      setLogError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const summary = paymentSummaries[selectedBooking.id];
      const remaining = summary ? summary.pendingAmount : 0;

      await addPayment({
        booking_id: selectedBooking.id,
        amount_paid: amt,
        payment_method: logMethod,
        payment_status: amt >= remaining ? 'Paid' : 'Partial'
      }, user?.email);

      setShowLogModal(false);
      setLogAmount('');
      setSelectedBooking(null);
      await loadData();
      showToast(`Logged payment of ₹${amt} successfully!`, 'success');
    } catch (err: any) {
      const errMsg = err.message || 'Failed to record payment';
      setLogError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Payments Ledger</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Audit customer deposits, collect pending balances, and trace receipts</p>
        </div>

        {/* Financial Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit block">Collected Revenue</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-emerald-700 shrink-0" />
              <span className="text-xl font-bold text-emerald-700 leading-tight">
                {totalCollected.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Outstanding Collections</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="text-xl font-bold text-amber-600 leading-tight">
                {totalOutstanding.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/80 w-fit block">Discounts Given</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-xl font-bold text-foreground/80 leading-tight">
                {totalDiscounts.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="border-b border-border flex gap-4">
          <button
            onClick={() => {
              setActiveTab('balances');
              setSearchTerm('');
            }}
            className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all cursor-pointer ${
              activeTab === 'balances' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Bookings & Balances
          </button>
          <button
            onClick={() => {
              setActiveTab('receipts');
              setSearchTerm('');
            }}
            className={`pb-3 text-xs font-bold border-b-2 px-1 transition-all cursor-pointer ${
              activeTab === 'receipts' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Transaction Receipts
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-card rounded-2xl border border-border/80 p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={activeTab === 'balances' ? "Search customer name, phone, or booking reference..." : "Search receipt ID, phone, or customer..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all"
            />
          </div>

          {activeTab === 'balances' ? (
            <div className="flex items-center gap-2 self-end md:self-auto">
              <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Status:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 border border-border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer select-none">
                    {statusFilter === 'all' ? 'All Statuses' : statusFilter}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-40" align="end">
                  <DropdownMenuItem onClick={() => setStatusFilter('all')}>All Statuses</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('Paid')}>Paid</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('Partial')}>Partial</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter('Pending')}>Pending</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-2 self-end md:self-auto">
              <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Method:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/20 border border-border rounded-xl text-xs font-semibold focus:outline-none cursor-pointer select-none">
                    {methodFilter === 'all' ? 'All Methods' : methodFilter}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-44" align="end">
                  <DropdownMenuItem onClick={() => setMethodFilter('all')}>All Methods</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMethodFilter('UPI')}>UPI</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMethodFilter('Cash')}>Cash</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMethodFilter('Card')}>Card</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMethodFilter('Bank Transfer')}>Bank Transfer</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* 1. BALANCES TAB CONTENT */}
        {activeTab === 'balances' && (
          <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden text-left">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-muted-foreground">Loading ledger records...</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="p-16 text-center">
                <p className="text-xs text-muted-foreground font-semibold">No bookings match the selected search/filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3 px-5">Booking Ref</th>
                      <th className="py-3 px-5">Customer</th>
                      <th className="py-3 px-5">Date</th>
                      <th className="py-3 px-5">Final Bill</th>
                      <th className="py-3 px-5">Amount Paid</th>
                      <th className="py-3 px-5">Pending Amount</th>
                      <th className="py-3 px-5">Payment Status</th>
                      {user?.role === 'admin' && <th className="py-3 px-5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                    {filteredBookings.map((b) => {
                      const summary = paymentSummaries[b.id];
                      
                      let badgeStyle = 'bg-red-50 text-red-800 border-red-200';
                      if (summary?.status === 'Paid') badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                      if (summary?.status === 'Partial') badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';

                      return (
                        <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-3.5 px-5 font-mono text-[10px]">{b.id}</td>
                          <td className="py-3.5 px-5">
                            <span className="font-bold text-foreground block">{b.customer?.name}</span>
                            <span className="text-[10px] text-muted-foreground">{b.customer?.phone}</span>
                          </td>
                          <td className="py-3.5 px-5">{new Date(b.booking_date).toLocaleDateString()}</td>
                          <td className="py-3.5 px-5">₹{Number(b.final_amount).toLocaleString('en-IN')}</td>
                          <td className="py-3.5 px-5 text-emerald-700">₹{summary ? summary.totalPaid.toLocaleString('en-IN') : 0}</td>
                          <td className={`py-3.5 px-5 font-bold ${summary && summary.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                            ₹{summary ? summary.pendingAmount.toLocaleString('en-IN') : 0}
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeStyle}`}>
                              {summary?.status || 'Pending'}
                            </span>
                          </td>
                          {user?.role === 'admin' && (
                            <td className="py-3.5 px-5 text-right">
                              {summary && summary.pendingAmount > 0 ? (
                                <button
                                  onClick={() => {
                                    setSelectedBooking(b);
                                    setLogAmount(summary.pendingAmount.toString());
                                    setLogError(null);
                                    setShowLogModal(true);
                                  }}
                                  className="py-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-95"
                                >
                                  Collect
                                </button>
                              ) : (
                                <span className="text-[10px] text-emerald-700 font-bold flex items-center justify-end gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Settled
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. RECEIPTS TAB CONTENT */}
        {activeTab === 'receipts' && (
          <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden text-left">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs text-muted-foreground">Loading transaction logs...</p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="p-16 text-center">
                <p className="text-xs text-muted-foreground font-semibold">No transactions recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3 px-5">Receipt ID</th>
                      <th className="py-3 px-5">Booking Ref</th>
                      <th className="py-3 px-5">Customer</th>
                      <th className="py-3 px-5">Collected On</th>
                      <th className="py-3 px-5">Payment Method</th>
                      <th className="py-3 px-5">Amount Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                    {filteredReceipts.map((p) => {
                      const b = bookings.find(book => book.id === p.booking_id);
                      
                      let methodStyle = 'bg-muted text-muted-foreground border-border';
                      if (p.payment_method === 'UPI') methodStyle = 'bg-blue-50 text-blue-800 border-blue-200';
                      if (p.payment_method === 'Cash') methodStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';

                      return (
                        <tr key={p.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-3.5 px-5 font-mono text-[10px]">{p.id}</td>
                          <td className="py-3.5 px-5 font-mono text-[10px]">{p.booking_id}</td>
                          <td className="py-3.5 px-5">
                            <span className="font-bold text-foreground block">{b?.customer?.name || 'Customer'}</span>
                            <span className="text-[10px] text-muted-foreground">{b?.customer?.phone || ''}</span>
                          </td>
                          <td className="py-3.5 px-5">
                            {new Date(p.payment_date).toLocaleDateString()} at {new Date(p.payment_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-lg border text-[9px] font-bold ${methodStyle}`}>
                              {p.payment_method}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 font-bold text-emerald-700">₹{Number(p.amount_paid).toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* LOG PAYMENT DRAWER */}
        {showLogModal && selectedBooking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left">
              <div className="bg-primary p-6 text-white flex items-center justify-between">
                <h3 className="font-bold text-md flex items-center gap-2">
                  <Receipt className="h-5 w-5" /> Collect Booking Payment
                </h3>
                <button 
                  onClick={() => {
                    setShowLogModal(false);
                    setSelectedBooking(null);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleLogPayment} className="p-6 space-y-4">
                {logError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-xl">
                    {logError}
                  </div>
                )}

                <div className="bg-accent/40 rounded-xl p-3 border border-primary/10 space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Outstanding Balance</p>
                  <p className="text-lg font-extrabold text-primary">
                    ₹{selectedBooking.id ? (paymentSummaries[selectedBooking.id]?.pendingAmount || 0) : 0}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Amount Received (₹)</label>
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={logAmount}
                    onChange={(e) => setLogAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Payment Mode</label>
                  <select
                    value={logMethod}
                    onChange={(e) => setLogMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-2.5 bg-muted/20 border border-border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  >
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogModal(false);
                      setSelectedBooking(null);
                    }}
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
                      'Save Receipt'
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
