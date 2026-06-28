'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { 
  getBookings, 
  getPayments, 
  getBookingPaymentSummaries,
  addPayment,
  getBookingStatus
} from '@/lib/db/db-service';
import { Booking, Payment, PaymentMethod, PaymentStatus } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToastStore } from '@/lib/store/toast-store';
import { sanitizeInput, checkRateLimit, getErrorMessage } from '@/lib/security';
import { hasSupabaseCredentials, supabase } from '@/lib/db/supabase';
import { exportBookingReceiptPDF } from '@/lib/pdf-generator';

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
  ChevronDown,
  Download,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';
import { DatePicker } from '@/components/ui/date-picker';

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

  // Pagination states
  const [balancesPage, setBalancesPage] = useState(1);
  const [receiptsPage, setReceiptsPage] = useState(1);

  // Date Filtering states
  const [dateFilterType, setDateFilterType] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [selectedFilterDate, setSelectedFilterDate] = useState<string>('');

  // Initialize selectedFilterDate on mount
  useEffect(() => {
    setSelectedFilterDate(getLocalFormattedDate(new Date()));
  }, []);

  // Reset pages when filters change
  useEffect(() => {
    setBalancesPage(1);
  }, [searchTerm, statusFilter, dateFilterType, selectedFilterDate]);

  useEffect(() => {
    setReceiptsPage(1);
  }, [searchTerm, methodFilter, dateFilterType, selectedFilterDate]);

  // Log Payment Form
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [logAmount, setLogAmount] = useState<string>('');
  const [logPaymentMode, setLogPaymentMode] = useState<'UPI' | 'Cash' | 'Split'>('UPI');
  const [logUpiSplit, setLogUpiSplit] = useState<string>('0');
  const [logCashSplit, setLogCashSplit] = useState<string>('0');
  const [logError, setLogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogUpiChange = (val: string) => {
    const total = Number(logAmount) || 0;
    const numVal = Number(val) || 0;
    if (numVal > total) {
      setLogUpiSplit(total.toString());
      setLogCashSplit('0');
    } else {
      setLogUpiSplit(val);
      setLogCashSplit((total - numVal).toString());
    }
  };

  const handleLogCashChange = (val: string) => {
    const total = Number(logAmount) || 0;
    const numVal = Number(val) || 0;
    if (numVal > total) {
      setLogCashSplit(total.toString());
      setLogUpiSplit('0');
    } else {
      setLogCashSplit(val);
      setLogUpiSplit((total - numVal).toString());
    }
  };

  const handleLogTotalChange = (val: string) => {
    setLogAmount(val);
    const total = Number(val) || 0;
    if (logPaymentMode === 'Split') {
      setLogUpiSplit(Math.round(total / 2).toString());
      setLogCashSplit((total - Math.round(total / 2)).toString());
    }
  };

  const getLocalFormattedDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getLocalFormattedDateFromTimestamp = (timestampStr: string) => {
    if (!timestampStr) return '';
    return getLocalFormattedDate(new Date(timestampStr));
  };

  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const isDateWithinFilter = (dateStr: string) => {
    if (!dateStr || !selectedFilterDate) return false;
    if (dateFilterType === 'all') return true;

    const checkDate = parseLocalDate(dateStr);
    const refDate = parseLocalDate(selectedFilterDate);

    if (dateFilterType === 'today') {
      return dateStr === selectedFilterDate;
    }

    if (dateFilterType === 'yesterday') {
      const yesterday = new Date(refDate);
      yesterday.setDate(refDate.getDate() - 1);
      const yesterdayStr = getLocalFormattedDate(yesterday);
      return dateStr === yesterdayStr;
    }

    if (dateFilterType === 'week') {
      const day = refDate.getDay();
      const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(refDate);
      monday.setDate(diff);
      monday.setHours(0,0,0,0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23,59,59,999);

      return checkDate >= monday && checkDate <= sunday;
    }

    if (dateFilterType === 'month') {
      return checkDate.getFullYear() === refDate.getFullYear() && checkDate.getMonth() === refDate.getMonth();
    }

    return false;
  };

  const handlePrevPaymentsPeriod = () => {
    if (!selectedFilterDate) return;
    const current = parseLocalDate(selectedFilterDate);
    if (dateFilterType === 'today' || dateFilterType === 'yesterday') {
      current.setDate(current.getDate() - 1);
    } else if (dateFilterType === 'week') {
      current.setDate(current.getDate() - 7);
    } else if (dateFilterType === 'month') {
      current.setMonth(current.getMonth() - 1);
    }
    setSelectedFilterDate(getLocalFormattedDate(current));
  };

  const handleNextPaymentsPeriod = () => {
    if (!selectedFilterDate) return;
    const current = parseLocalDate(selectedFilterDate);
    if (dateFilterType === 'today' || dateFilterType === 'yesterday') {
      current.setDate(current.getDate() + 1);
    } else if (dateFilterType === 'week') {
      current.setDate(current.getDate() + 7);
    } else if (dateFilterType === 'month') {
      current.setMonth(current.getMonth() + 1);
    }
    setSelectedFilterDate(getLocalFormattedDate(current));
  };

  const handleResetPaymentsToday = () => {
    setSelectedFilterDate(getLocalFormattedDate(new Date()));
  };

  const getPaymentsFilterTitle = () => {
    if (dateFilterType === 'all') return 'All Time';
    if (!selectedFilterDate) return '';
    const dateObj = parseLocalDate(selectedFilterDate);
    if (dateFilterType === 'today') {
      return dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else if (dateFilterType === 'yesterday') {
      const yesterday = new Date(dateObj);
      yesterday.setDate(dateObj.getDate() - 1);
      return `Yesterday (${yesterday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })})`;
    } else if (dateFilterType === 'week') {
      const day = dateObj.getDay();
      const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dateObj);
      monday.setDate(diff);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `Week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return dateObj.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const allBookings = await getBookings();
      setBookings(allBookings);

      // Fetch payment summaries and payments in bulk O(1) database queries
      const { summaries, payments: allPayments } = await getBookingPaymentSummaries(allBookings);
      setPayments(allPayments);
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
      loadData(true);
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
            loadData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            loadData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          () => {
            loadData(true);
          }
        )
        .subscribe();
    }

    // 3. Fallback polling (only if Supabase is NOT active, or run less frequently, e.g. every 60 seconds)
    let interval: any = null;
    if (!hasSupabaseCredentials() || !supabase) {
      interval = setInterval(() => {
        loadData(true);
      }, 60000);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      if (interval) clearInterval(interval);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Totals calculations based on active (non-cancelled) bookings and selected date filter
  const activeBookings = bookings.filter(b => b.status !== 'Cancelled');

  // Helper to determine advance payment for a booking
  const getAdvanceReceived = (bookingId: string): number => {
    const bookingPayments = payments.filter(p => p.booking_id === bookingId);
    if (bookingPayments.length === 0) return 0;

    // Sort payments by payment_date ascending
    const sortedPayments = [...bookingPayments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );

    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return 0;

    const firstPayment = sortedPayments[0];
    
    // If there is only one payment and its amount is equal to or greater than the booking final_amount,
    // it was a full payment, so advance is 0.
    if (sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount)) {
      return 0;
    }

    return Number(firstPayment.amount_paid);
  };

  // Filter bookings and payments for metrics according to the selected date filter
  const periodBookings = activeBookings.filter(b => isDateWithinFilter(b.booking_date));
  
  const periodPayments = payments.filter(p => {
    const booking = bookings.find(b => b.id === p.booking_id);
    return booking && isDateWithinFilter(booking.booking_date);
  });
  
  const totalOutstanding = periodBookings.reduce((sum, b) => {
    const summary = paymentSummaries[b.id];
    return sum + (summary ? summary.pendingAmount : 0);
  }, 0);

  const totalCollected = periodPayments.reduce((sum, p) => {
    return sum + Number(p.amount_paid);
  }, 0);

  const totalUPI = periodPayments.filter(p => p.payment_method === 'UPI').reduce((sum, p) => {
    return sum + Number(p.amount_paid);
  }, 0);

  const totalCash = periodPayments.filter(p => p.payment_method === 'Cash').reduce((sum, p) => {
    return sum + Number(p.amount_paid);
  }, 0);

  const totalAdvanceCollected = periodPayments.reduce((sum, p) => {
    // Find all payments for this booking
    const bookingPayments = payments.filter(pay => pay.booking_id === p.booking_id);
    const sortedPayments = [...bookingPayments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );
    
    const firstPayment = sortedPayments[0];
    // If current payment is the first payment of the booking
    if (firstPayment && firstPayment.id === p.id) {
      const booking = bookings.find(b => b.id === p.booking_id);
      if (booking) {
        // If it was a full payment, it's not an advance
        if (sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount)) {
          return sum;
        }
        return sum + Number(p.amount_paid);
      }
    }
    return sum;
  }, 0);

  const totalAdvanceUPI = periodPayments.reduce((sum, p) => {
    const bookingPayments = payments.filter(pay => pay.booking_id === p.booking_id);
    const sortedPayments = [...bookingPayments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );
    
    const firstPayment = sortedPayments[0];
    if (firstPayment && firstPayment.id === p.id && p.payment_method === 'UPI') {
      const booking = bookings.find(b => b.id === p.booking_id);
      if (booking && !(sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount))) {
        return sum + Number(p.amount_paid);
      }
    }
    return sum;
  }, 0);

  const totalAdvanceCash = periodPayments.reduce((sum, p) => {
    const bookingPayments = payments.filter(pay => pay.booking_id === p.booking_id);
    const sortedPayments = [...bookingPayments].sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    );
    
    const firstPayment = sortedPayments[0];
    if (firstPayment && firstPayment.id === p.id && p.payment_method === 'Cash') {
      const booking = bookings.find(b => b.id === p.booking_id);
      if (booking && !(sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount))) {
        return sum + Number(p.amount_paid);
      }
    }
    return sum;
  }, 0);

  const totalDiscounts = periodBookings.reduce((sum, b) => sum + Number(b.discount), 0);

  // Filtered Bookings (Balances tab)
  const filteredBookings = activeBookings.filter(b => {
    const summary = paymentSummaries[b.id];
    const matchSearch = b.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        b.customer?.phone.includes(searchTerm) || 
                        b.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchStatus = statusFilter === 'all' || (summary && summary.status === statusFilter);
    const matchDate = isDateWithinFilter(b.booking_date);
    return matchSearch && matchStatus && matchDate;
  });

  // Filtered Receipts (Receipts tab)
  const filteredReceipts = payments.filter(p => {
    const booking = bookings.find(b => b.id === p.booking_id);
    const matchSearch = booking?.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        booking?.customer?.phone.includes(searchTerm) ||
                        p.booking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchMethod = methodFilter === 'all' || p.payment_method === methodFilter;
    const matchDate = booking ? isDateWithinFilter(booking.booking_date) : false;
    return matchSearch && matchMethod && matchDate;
  });

  // Pagination slices
  const ENTRIES_PER_PAGE = 12;
  const paginatedBookings = filteredBookings.slice((balancesPage - 1) * ENTRIES_PER_PAGE, balancesPage * ENTRIES_PER_PAGE);
  const paginatedReceipts = filteredReceipts.slice((receiptsPage - 1) * ENTRIES_PER_PAGE, receiptsPage * ENTRIES_PER_PAGE);

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

    const summary = paymentSummaries[selectedBooking.id];
    const outstanding = summary ? summary.pendingAmount : 0;

    setSubmitting(true);
    try {
      if (logPaymentMode === 'Split') {
        const upiVal = Number(logUpiSplit) || 0;
        const cashVal = Number(logCashSplit) || 0;
        const total = upiVal + cashVal;

        if (total <= 0) {
          throw new Error('Total payment amount must be greater than 0');
        }
        if (total > outstanding) {
          throw new Error(`Total payment amount (₹${total}) exceeds outstanding balance (₹${outstanding})`);
        }

        // Add separate payments for UPI and Cash
        if (upiVal > 0) {
          await addPayment({
            booking_id: selectedBooking.id,
            amount_paid: upiVal,
            payment_method: 'UPI',
            payment_status: total >= outstanding ? 'Paid' : 'Partial'
          }, user?.email);
        }

        if (cashVal > 0) {
          await addPayment({
            booking_id: selectedBooking.id,
            amount_paid: cashVal,
            payment_method: 'Cash',
            payment_status: total >= outstanding ? 'Paid' : 'Partial'
          }, user?.email);
        }

        showToast(`Logged split payment of ₹${total} (UPI: ₹${upiVal}, Cash: ₹${cashVal}) successfully!`, 'success');

      } else {
        const amt = Number(logAmount);
        if (!amt || amt <= 0) {
          throw new Error('Please enter a valid payment amount greater than 0');
        }
        if (amt > outstanding) {
          throw new Error(`Payment amount (₹${amt}) exceeds outstanding balance (₹${outstanding})`);
        }

        await addPayment({
          booking_id: selectedBooking.id,
          amount_paid: amt,
          payment_method: logPaymentMode,
          payment_status: amt >= outstanding ? 'Paid' : 'Partial'
        }, user?.email);

        showToast(`Logged payment of ₹${amt} via ${logPaymentMode} successfully!`, 'success');
      }

      setShowLogModal(false);
      setLogAmount('');
      setSelectedBooking(null);
      await loadData();
    } catch (err: any) {
      const errMsg = getErrorMessage(err, 'Failed to record payment');
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
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit customer deposits, collect pending balances, and trace receipts for <span className="font-extrabold text-primary">{getPaymentsFilterTitle()}</span>
          </p>
        </div>

        {/* Date Filter Toolbar */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevPaymentsPeriod}
              disabled={dateFilterType === 'all'}
              className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={handleNextPaymentsPeriod}
              disabled={dateFilterType === 'all'}
              className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button 
              onClick={handleResetPaymentsToday}
              disabled={dateFilterType === 'all'}
              className="px-3.5 py-2 hover:bg-muted border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Today
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-end">
            {/* Period selector */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-1 flex shadow-sm">
              {(['today', 'yesterday', 'week', 'month', 'all'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setDateFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    dateFilterType === type
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'today' ? 'Day' : type === 'yesterday' ? 'Yesterday' : type === 'week' ? 'Week' : type === 'month' ? 'Month' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Date Picker Input */}
            {dateFilterType !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase hidden sm:inline-block">Date:</span>
                <DatePicker
                  value={selectedFilterDate}
                  onChange={(val) => {
                    if (val) setSelectedFilterDate(val);
                  }}
                  align="end"
                />
              </div>
            )}
          </div>
        </div>

        {/* Financial Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit block">Collected Revenue</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-emerald-700 shrink-0" />
              <span className="text-xl font-bold text-emerald-700 leading-tight">
                {totalCollected.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                UPI: <strong className="text-foreground">₹{totalUPI.toLocaleString('en-IN')}</strong>
              </span>
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Cash: <strong className="text-foreground">₹{totalCash.toLocaleString('en-IN')}</strong>
              </span>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 w-fit block">Advance Received</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-blue-700 shrink-0" />
              <span className="text-xl font-bold text-blue-700 leading-tight">
                {totalAdvanceCollected.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                UPI: <strong className="text-foreground">₹{totalAdvanceUPI.toLocaleString('en-IN')}</strong>
              </span>
              <span className="text-muted-foreground font-semibold flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Cash: <strong className="text-foreground">₹{totalAdvanceCash.toLocaleString('en-IN')}</strong>
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
                {/* Desktop View Table */}
                <table className="w-full text-left border-collapse hidden sm:table">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3 px-5">Booking Ref</th>
                      <th className="py-3 px-5">Customer</th>
                      <th className="py-3 px-5">Date</th>
                      <th className="py-3 px-5">Final Bill</th>
                      <th className="py-3 px-5">Amount Paid</th>
                      <th className="py-3 px-5">Pending Amount</th>
                      <th className="py-3 px-5">Payment Status</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                    {paginatedBookings.map((b) => {
                      const summary = paymentSummaries[b.id];
                      
                      let badgeStyle = 'bg-red-50 text-red-808 border-red-200';
                      if (summary?.status === 'Paid') badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                      if (summary?.status === 'Partial') badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';

                      return (
                        <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                          <td className="py-3.5 px-5 font-mono text-[10px]">{b.id}</td>
                          <td className="py-3.5 px-5">
                            <span className="font-bold text-foreground block">{b.customer?.name}</span>
                            <span className="text-[10px] text-muted-foreground">{b.customer?.phone}</span>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className="block">{new Date(b.booking_date).toLocaleDateString()}</span>
                            {(() => {
                              const status = getBookingStatus(b);
                              let statusStyle = 'text-blue-600 bg-blue-50 border-blue-100';
                              if (status === 'Completed') statusStyle = 'text-emerald-700 bg-emerald-50 border-emerald-100';
                              if (status === 'Running') statusStyle = 'text-amber-600 bg-amber-50 border-amber-100 animate-pulse';
                              
                              return (
                                <span className={`inline-flex items-center px-1.5 py-0.25 mt-1 rounded-md border text-[8px] font-extrabold uppercase ${statusStyle}`}>
                                  {status}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-3.5 px-5">₹{Number(b.final_amount).toLocaleString('en-IN')}</td>
                          <td className="py-3.5 px-5 text-emerald-700">
                            <span className="block">₹{summary ? summary.totalPaid.toLocaleString('en-IN') : 0}</span>
                            {getAdvanceReceived(b.id) > 0 && (
                              <span className="text-[10px] text-blue-600 font-bold block mt-0.5">
                                Advance: ₹{getAdvanceReceived(b.id).toLocaleString('en-IN')}
                              </span>
                            )}
                          </td>
                          <td className={`py-3.5 px-5 font-bold ${summary && summary.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                            ₹{summary ? summary.pendingAmount.toLocaleString('en-IN') : 0}
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeStyle}`}>
                              {summary?.status || 'Pending'}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right flex items-center justify-end gap-2">
                            {user?.role === 'admin' && summary && summary.pendingAmount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBooking(b);
                                  const pending = summary ? summary.pendingAmount : 0;
                                  setLogAmount(pending.toString());
                                  setLogPaymentMode('UPI');
                                  setLogUpiSplit(pending.toString());
                                  setLogCashSplit('0');
                                  setLogError(null);
                                  setShowLogModal(true);
                                }}
                                className="py-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-95"
                              >
                                Collect
                              </button>
                            ) : (
                              summary && summary.pendingAmount === 0 && (
                                <span className="text-[10px] text-emerald-700 font-bold flex items-center justify-end gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Settled
                                </span>
                              )
                            )}
                            
                            <button
                              type="button"
                              onClick={async () => {
                                  await exportBookingReceiptPDF(b, summary || { totalPaid: 0, pendingAmount: b.final_amount, status: 'Pending' });
                              }}
                              className="p-1.5 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center justify-center"
                              title="Download Receipt"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile View Card List */}
                <div className="block sm:hidden divide-y divide-border/60">
                  {paginatedBookings.map((b) => {
                    const summary = paymentSummaries[b.id];
                    let badgeStyle = 'bg-red-50 text-red-808 border-red-200';
                    if (summary?.status === 'Paid') badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    if (summary?.status === 'Partial') badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
                    
                    return (
                      <div key={b.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-muted-foreground">{b.id}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeStyle}`}>
                            {summary?.status || 'Pending'}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-foreground block text-sm">{b.customer?.name}</span>
                          <span className="text-xs text-muted-foreground">{b.customer?.phone}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 py-1 text-xs">
                          <div>
                            <span className="text-[9px] text-muted-foreground block uppercase">Bill</span>
                            <span className="font-semibold text-foreground">₹{Number(b.final_amount).toLocaleString('en-IN')}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground block uppercase">Paid</span>
                            <span className="font-semibold text-emerald-700 block">₹{summary ? summary.totalPaid.toLocaleString('en-IN') : 0}</span>
                            {getAdvanceReceived(b.id) > 0 && (
                              <span className="text-[8px] text-blue-600 font-bold block mt-0.5">
                                Adv: ₹{getAdvanceReceived(b.id).toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground block uppercase">Pending</span>
                            <span className={`font-bold ${summary && summary.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                              ₹{summary ? summary.pendingAmount.toLocaleString('en-IN') : 0}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{new Date(b.booking_date).toLocaleDateString()}</span>
                            {(() => {
                              const status = getBookingStatus(b);
                              let statusStyle = 'text-blue-600 bg-blue-50 border-blue-100';
                              if (status === 'Completed') statusStyle = 'text-emerald-700 bg-emerald-50 border-emerald-100';
                              if (status === 'Running') statusStyle = 'text-amber-600 bg-amber-50 border-amber-100 animate-pulse';
                              
                              return (
                                <span className={`px-1.5 py-0.25 rounded-md border text-[8px] font-extrabold uppercase ${statusStyle}`}>
                                  {status}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2">
                            {user?.role === 'admin' && summary && summary.pendingAmount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBooking(b);
                                  const pending = summary ? summary.pendingAmount : 0;
                                  setLogAmount(pending.toString());
                                  setLogPaymentMode('UPI');
                                  setLogUpiSplit(pending.toString());
                                  setLogCashSplit('0');
                                  setLogError(null);
                                  setShowLogModal(true);
                                }}
                                className="py-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Collect
                              </button>
                            ) : (
                              summary && summary.pendingAmount === 0 && (
                                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Settled
                                </span>
                              )
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await exportBookingReceiptPDF(b, summary || { totalPaid: 0, pendingAmount: b.final_amount, status: 'Pending' });
                              }}
                              className="p-2 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-xs transition-all cursor-pointer inline-flex items-center justify-center"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Pagination Controls */}
                {filteredBookings.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                    <span className="text-muted-foreground text-center sm:text-left">
                      Showing <strong className="text-foreground">{(balancesPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(balancesPage * ENTRIES_PER_PAGE, filteredBookings.length)}</strong> of <strong className="text-foreground">{filteredBookings.length}</strong> entries
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBalancesPage(prev => Math.max(prev - 1, 1))}
                        disabled={balancesPage === 1}
                        className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                      >
                        Previous
                      </button>
                      {Array.from({ length: Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                        .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) || Math.abs(page - balancesPage) <= 1)
                        .map((page, idx, arr) => {
                          const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                              <button
                                type="button"
                                onClick={() => setBalancesPage(page)}
                                className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                  balancesPage === page
                                    ? 'bg-primary text-white border-primary shadow-sm'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
                                  }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      <button
                        type="button"
                        onClick={() => setBalancesPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))))}
                        disabled={balancesPage === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))}
                        className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
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
              <>
                <div className="px-5 py-2.5 bg-muted/10 border-b border-border/60 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-medium">
                  <span>Showing {filteredReceipts.length} transactions</span>
                  <span>
                    Total Filtered Amount: <strong className="text-emerald-700">₹{filteredReceipts.reduce((sum, p) => sum + Number(p.amount_paid), 0).toLocaleString('en-IN')}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                {/* Desktop View Table */}
                <table className="w-full text-left border-collapse hidden sm:table">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <th className="py-3 px-5">Receipt ID</th>
                      <th className="py-3 px-5">Booking Ref</th>
                      <th className="py-3 px-5">Customer</th>
                      <th className="py-3 px-5">Collected On</th>
                      <th className="py-3 px-5">Payment Method</th>
                      <th className="py-3 px-5">Amount Collected</th>
                      <th className="py-3 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                    {paginatedReceipts.map((p) => {
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
                          <td className="py-3.5 px-5 text-emerald-700">
                            <span className="font-bold block">₹{Number(p.amount_paid).toLocaleString('en-IN')}</span>
                            {(() => {
                              const bookingPayments = payments.filter(pay => pay.booking_id === p.booking_id);
                              const sortedPayments = [...bookingPayments].sort((a, b) => 
                                new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
                              );
                              const firstPayment = sortedPayments[0];
                              if (firstPayment && firstPayment.id === p.id) {
                                const booking = bookings.find(book => book.id === p.booking_id);
                                if (booking && sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount)) {
                                  return null;
                                }
                                return (
                                  <span className="text-[10px] text-blue-600 font-bold block mt-0.5">
                                    (Advance)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            {b && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const summary = paymentSummaries[p.booking_id] || { totalPaid: Number(p.amount_paid), pendingAmount: 0, status: 'Paid' };
                                  await exportBookingReceiptPDF(b, summary);
                                }}
                                className="p-1.5 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center justify-center"
                                title="Download Receipt"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile View Card List */}
                <div className="block sm:hidden divide-y divide-border/60">
                  {paginatedReceipts.map((p) => {
                    const b = bookings.find(book => book.id === p.booking_id);
                    let methodStyle = 'bg-muted text-muted-foreground border-border';
                    if (p.payment_method === 'UPI') methodStyle = 'bg-blue-50 text-blue-800 border-blue-200';
                    if (p.payment_method === 'Cash') methodStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';

                    return (
                      <div key={p.id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] text-muted-foreground">Receipt: {p.id}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[9px] font-bold ${methodStyle}`}>
                            {p.payment_method}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-foreground block text-sm">{b?.customer?.name || 'Customer'}</span>
                          <span className="text-xs text-muted-foreground">{b?.customer?.phone || ''}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                          <div>
                            <span className="text-[9px] text-muted-foreground block uppercase">Collected On</span>
                            <span className="text-foreground">{new Date(p.payment_date).toLocaleDateString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-muted-foreground block uppercase">Amount</span>
                            <span className="font-bold text-emerald-700 text-sm block">₹{Number(p.amount_paid).toLocaleString('en-IN')}</span>
                            {(() => {
                              const bookingPayments = payments.filter(pay => pay.booking_id === p.booking_id);
                              const sortedPayments = [...bookingPayments].sort((a, b) => 
                                new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
                              );
                              const firstPayment = sortedPayments[0];
                              if (firstPayment && firstPayment.id === p.id) {
                                const booking = bookings.find(book => book.id === p.booking_id);
                                if (booking && sortedPayments.length === 1 && Number(firstPayment.amount_paid) >= Number(booking.final_amount)) {
                                  return null;
                                }
                                return (
                                  <span className="text-[8px] text-blue-600 font-bold block mt-0.5">
                                    (Advance)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                          <span className="font-mono text-[9px] text-muted-foreground">Booking: {p.booking_id}</span>
                          {b && (
                            <button
                              type="button"
                              onClick={async () => {
                                const summary = paymentSummaries[p.booking_id] || { totalPaid: Number(p.amount_paid), pendingAmount: 0, status: 'Paid' };
                                await exportBookingReceiptPDF(b, summary);
                              }}
                              className="p-2 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-xs transition-all cursor-pointer inline-flex items-center justify-center"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                {filteredReceipts.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                    <span className="text-muted-foreground text-center sm:text-left">
                      Showing <strong className="text-foreground">{(receiptsPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(receiptsPage * ENTRIES_PER_PAGE, filteredReceipts.length)}</strong> of <strong className="text-foreground">{filteredReceipts.length}</strong> entries
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setReceiptsPage(prev => Math.max(prev - 1, 1))}
                        disabled={receiptsPage === 1}
                        className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                      >
                        Previous
                      </button>
                      {Array.from({ length: Math.max(1, Math.ceil(filteredReceipts.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                        .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredReceipts.length / ENTRIES_PER_PAGE)) || Math.abs(page - receiptsPage) <= 1)
                        .map((page, idx, arr) => {
                          const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                          return (
                            <React.Fragment key={page}>
                              {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                              <button
                                type="button"
                                onClick={() => setReceiptsPage(page)}
                                className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                  receiptsPage === page
                                    ? 'bg-primary text-white border-primary shadow-sm'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
                                  }`}
                              >
                                {page}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      <button
                        type="button"
                        onClick={() => setReceiptsPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredReceipts.length / ENTRIES_PER_PAGE))))}
                        disabled={receiptsPage === Math.max(1, Math.ceil(filteredReceipts.length / ENTRIES_PER_PAGE))}
                        className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
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

                {/* Payment Mode Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Payment Mode</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['UPI', 'Cash', 'Split'] as const).map(mode => {
                      const isSelected = logPaymentMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            setLogPaymentMode(mode);
                            setLogError(null);
                            const total = Number(paymentSummaries[selectedBooking.id]?.pendingAmount || 0);
                            if (mode === 'Split') {
                              setLogUpiSplit(Math.round(total / 2).toString());
                              setLogCashSplit((total - Math.round(total / 2)).toString());
                              setLogAmount(total.toString());
                            } else {
                              setLogAmount(total.toString());
                            }
                          }}
                          className={`py-2.5 px-1 rounded-xl text-xs font-bold cursor-pointer transition-all text-center ${
                            isSelected
                              ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10 font-black'
                              : 'bg-card border-border hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Conditional inputs */}
                {logPaymentMode === 'Split' ? (
                  <div className="grid grid-cols-2 gap-4 bg-muted/20 rounded-xl p-4 border border-border/50">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">UPI Amount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={logUpiSplit}
                        onChange={(e) => handleLogUpiChange(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5 text-left">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Amount (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={logCashSplit}
                        onChange={(e) => handleLogCashChange(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2 text-[10px] font-bold text-muted-foreground text-center pt-1 border-t border-border/40">
                      Total Collected: <strong className="text-primary font-black">₹{logAmount}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-semibold text-muted-foreground">Amount Received (₹)</label>
                      <input
                        type="number"
                        min={0.01}
                        step="any"
                        value={logAmount}
                        onChange={(e) => handleLogTotalChange(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all font-bold"
                      />
                    </div>

                    <div className="bg-muted/10 p-3 border border-border/40 rounded-xl text-xs font-semibold text-muted-foreground text-center">
                      Payment of <strong className="text-primary font-black">₹{logAmount}</strong> will be logged via <strong className="uppercase">{logPaymentMode}</strong>.
                    </div>
                  </div>
                )}

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
