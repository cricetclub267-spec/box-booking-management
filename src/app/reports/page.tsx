'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  getBookings, 
  getPayments, 
  getBookingPaymentSummaries,
  getExpenses
} from '@/lib/db/db-service';
import { Booking, Payment, Expense } from '@/lib/db/types';
import { 
  exportRevenueReportPDF, 
  exportPaymentsReportPDF, 
  exportDiscountReportPDF 
} from '@/lib/pdf-generator';
import { 
  FileText, 
  Download, 
  Calendar, 
  Filter, 
  TrendingUp, 
  Percent, 
  IndianRupee, 
  Clock, 
  CheckCircle,
  Database,
  ArrowDownCircle,
  ChevronDown
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';

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

export default function ReportsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSummaries, setPaymentSummaries] = useState<Record<string, { totalPaid: number; pendingAmount: number; status: string }>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedReportTab, setSelectedReportTab] = useState<'bookings' | 'revenue' | 'payments' | 'discounts'>('bookings');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Pagination states
  const [bookingsPage, setBookingsPage] = useState(1);
  const [revenueBookingsPage, setRevenueBookingsPage] = useState(1);
  const [revenueExpensesPage, setRevenueExpensesPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [discountsPage, setDiscountsPage] = useState(1);

  // Reset all page states on filter change
  useEffect(() => {
    setBookingsPage(1);
    setRevenueBookingsPage(1);
    setRevenueExpensesPage(1);
    setPaymentsPage(1);
    setDiscountsPage(1);
  }, [startDate, endDate, selectedReportTab, methodFilter]);

  useEffect(() => {
    setMethodFilter('all');
  }, [selectedReportTab]);

  // Initialize date range to current month
  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    setStartDate(getLocalFormattedDate(firstDay));
    setEndDate(getLocalFormattedDate(today));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allBookings = await getBookings();
      setBookings(allBookings);

      // Fetch payment summaries and payments in bulk to avoid O(N) database requests loop
      const { summaries, payments: allPayments } = await getBookingPaymentSummaries(allBookings);
      setPayments(allPayments);
      setPaymentSummaries(summaries);

      const allExpenses = await getExpenses();
      setExpenses(allExpenses);
    } catch (e) {
      console.error('Error loading reports data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      loadData();
    }
  }, [startDate, endDate]);

  // Filtering Logic
  const getFilteredBookings = () => {
    return bookings.filter(b => {
      const bookingDate = b.booking_date; // YYYY-MM-DD
      const inRange = (!startDate || bookingDate >= startDate) && (!endDate || bookingDate <= endDate);
      return inRange && b.status !== 'Cancelled'; // Active bookings
    });
  };

  const getFilteredPayments = () => {
    return payments.filter(p => {
      const pDate = getLocalFormattedDateFromTimestamp(p.payment_date);
      const parentBooking = bookings.find(b => b.id === p.booking_id);
      const isBookingActive = parentBooking && parentBooking.status !== 'Cancelled';
      const matchesDate = (!startDate || pDate >= startDate) && (!endDate || pDate <= endDate);
      const matchesMethod = methodFilter === 'all' || p.payment_method === methodFilter;
      return matchesDate && matchesMethod && isBookingActive;
    });
  };

  const getFilteredDiscounts = () => {
    return bookings.filter(b => {
      const bookingDate = b.booking_date;
      const inRange = (!startDate || bookingDate >= startDate) && (!endDate || bookingDate <= endDate);
      return inRange && Number(b.discount) > 0 && b.status !== 'Cancelled';
    });
  };

  const getFilteredExpenses = () => {
    return expenses.filter(e => {
      const eDate = e.expense_date;
      return (!startDate || eDate >= startDate) && (!endDate || eDate <= endDate);
    });
  };

  // Export handlers
  const handleExportPDF = async () => {
    const rangeText = `${startDate} to ${endDate}`;
    
    try {
      if (selectedReportTab === 'bookings' || selectedReportTab === 'revenue') {
        const activeList = getFilteredBookings();
        const activeExpenses = getFilteredExpenses();
        await exportRevenueReportPDF(activeList, paymentSummaries, rangeText, payments, activeExpenses);
      } else if (selectedReportTab === 'payments') {
        const activePayments = getFilteredPayments();
        await exportPaymentsReportPDF(activePayments, bookings, rangeText);
      } else if (selectedReportTab === 'discounts') {
        const activeDiscounts = getFilteredDiscounts();
        await exportDiscountReportPDF(activeDiscounts, rangeText);
      }
    } catch (e) {
      console.error('Error exporting PDF:', e);
    }
  };
  // Dynamic calculations for display tiles
  const filteredBookings = getFilteredBookings();
  const filteredPayments = getFilteredPayments();
  const filteredDiscounts = getFilteredDiscounts();
  const filteredExpenses = getFilteredExpenses();  // We want the metrics cards to show the total overall payments for the date range, regardless of payment method filter
  const overallCollectedPayments = payments.filter(p => {
    const pDate = getLocalFormattedDateFromTimestamp(p.payment_date);
    const parentBooking = bookings.find(b => b.id === p.booking_id);
    const isBookingActive = parentBooking && parentBooking.status !== 'Cancelled';
    return (!startDate || pDate >= startDate) && (!endDate || pDate <= endDate) && isBookingActive;
  });

  const totalBillable = filteredBookings.reduce((sum, b) => sum + Number(b.final_amount), 0);
  const totalCollected = overallCollectedPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netRevenue = Math.max(0, totalCollected - totalExpenses);
  const totalDues = Math.max(0, totalBillable - totalCollected);
  const totalDiscountAmount = filteredDiscounts.reduce((sum, b) => sum + Number(b.discount), 0);

  const totalUPI = overallCollectedPayments
    .filter(p => p.payment_method === 'UPI')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const totalCash = overallCollectedPayments
    .filter(p => p.payment_method === 'Cash')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);

  const getActiveRangeType = () => {
    const today = new Date();
    const todayStr = getLocalFormattedDate(today);
    
    // Day
    if (startDate === todayStr && endDate === todayStr) {
      return 'day';
    }
    
    // Week
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    if (startDate === getLocalFormattedDate(monday) && endDate === getLocalFormattedDate(sunday)) {
      return 'week';
    }
    
    // Month
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    if (startDate === getLocalFormattedDate(firstDay) && endDate === getLocalFormattedDate(lastDay)) {
      return 'month';
    }
    
    return null;
  };
  const activeRangeType = getActiveRangeType();

  const ENTRIES_PER_PAGE = 12;
  const paginatedBookings = filteredBookings.slice((bookingsPage - 1) * ENTRIES_PER_PAGE, bookingsPage * ENTRIES_PER_PAGE);
  const paginatedRevenueBookings = filteredBookings.slice((revenueBookingsPage - 1) * ENTRIES_PER_PAGE, revenueBookingsPage * ENTRIES_PER_PAGE);
  const paginatedRevenueExpenses = filteredExpenses.slice((revenueExpensesPage - 1) * ENTRIES_PER_PAGE, revenueExpensesPage * ENTRIES_PER_PAGE);
  const paginatedPayments = filteredPayments.slice((paymentsPage - 1) * ENTRIES_PER_PAGE, paymentsPage * ENTRIES_PER_PAGE);
  const paginatedDiscounts = filteredDiscounts.slice((discountsPage - 1) * ENTRIES_PER_PAGE, discountsPage * ENTRIES_PER_PAGE);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Reports & Auditing</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Audit transaction sheets, discounts, and print business receipt logs</p>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={loading}
            className="py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95 disabled:opacity-70"
          >
            <Download className="h-4 w-4" />
            Export Report PDF
          </button>
        </div>

        {/* Date Filter Panel */}
        <div className="bg-card rounded-2xl border border-border/80 p-5 shadow-sm flex flex-wrap gap-4 items-center text-left">
          <div className="flex items-center gap-2 text-xs font-bold text-primary mr-1">
            <Filter className="h-4.5 w-4.5" /> Filter Parameters
          </div>

          {/* Day / Week / Month selector buttons */}
          <div className="bg-muted/40 border border-border/80 rounded-xl p-1 flex shadow-sm mr-1">
            {(['day', 'week', 'month'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  const today = new Date();
                  if (type === 'day') {
                    const dateStr = getLocalFormattedDate(today);
                    setStartDate(dateStr);
                    setEndDate(dateStr);
                  } else if (type === 'week') {
                    const day = today.getDay();
                    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                    const monday = new Date(today);
                    monday.setDate(diff);
                    const sunday = new Date(monday);
                    sunday.setDate(monday.getDate() + 6);
                    setStartDate(getLocalFormattedDate(monday));
                    setEndDate(getLocalFormattedDate(sunday));
                  } else if (type === 'month') {
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    setStartDate(getLocalFormattedDate(firstDay));
                    setEndDate(getLocalFormattedDate(lastDay));
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                  activeRangeType === type
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type === 'day' ? 'Day' : type === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">From:</span>
            <DatePicker
              value={startDate}
              onChange={(val) => setStartDate(val)}
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">To:</span>
            <DatePicker
              value={endDate}
              onChange={(val) => setEndDate(val)}
              align="end"
            />
          </div>

          {selectedReportTab === 'payments' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-muted-foreground">Method:</span>
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

        {/* Tab Buttons */}
        <div className="border-b border-border flex gap-4">
          {(['bookings', 'revenue', 'payments', 'discounts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSelectedReportTab(tab)}
              className={`pb-3 text-xs font-bold border-b-2 px-1 capitalize transition-all cursor-pointer ${
                selectedReportTab === tab 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab} Report
            </button>
          ))}
        </div>

        {/* Dynamic Financial Cards (Changes dynamically according to calculations) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Bookings Count</span>
            <span className="text-lg font-bold text-foreground block mt-1">{filteredBookings.length} bookings</span>
            <div className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground font-semibold">
              Discounts: <strong className="text-foreground">₹{totalDiscountAmount.toLocaleString('en-IN')}</strong>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit block">Collected Volume</span>
            <span className="text-lg font-bold text-emerald-700 block mt-1">₹{totalCollected.toLocaleString('en-IN')}</span>
            <div className="mt-2 pt-2 border-t border-border/60 flex items-center justify-between text-[10px]">
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

          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100 w-fit block">Total Expenses</span>
            <span className="text-lg font-bold text-red-700 block mt-1">₹{totalExpenses.toLocaleString('en-IN')}</span>
            <div className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground font-semibold">
              Count: <strong className="text-foreground">{filteredExpenses.length} entries</strong>
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm bg-gradient-to-br from-emerald-50/10 to-primary/5">
            <span className="text-[10px] font-bold text-primary bg-accent px-2 py-0.5 rounded-lg border border-primary/20 w-fit block">Net Revenue</span>
            <span className="text-lg font-bold text-primary block mt-1">₹{netRevenue.toLocaleString('en-IN')}</span>
            <div className="mt-2 pt-2 border-t border-primary/10 text-[10px] text-muted-foreground font-semibold">
              Collected - Expenses
            </div>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Dues Remaining</span>
            <span className="text-lg font-bold text-amber-600 block mt-1">₹{totalDues.toLocaleString('en-IN')}</span>
            <div className="mt-2 pt-2 border-t border-border/60 text-[10px] text-muted-foreground font-semibold">
              From active bookings
            </div>
          </div>
        </div>

        {/* Dynamic Table Card */}
        <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden text-left">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-muted-foreground font-semibold">Running database audit queries...</p>
            </div>
          ) : (
            <div>
              {/* BOOKINGS REPORT VIEW */}
              {selectedReportTab === 'bookings' && (
                <div className="overflow-x-auto">
                  {/* Desktop view */}
                  <table className="w-full border-collapse hidden sm:table">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-5">Ref ID</th>
                        <th className="py-3 px-5">Customer</th>
                        <th className="py-3 px-5">Turf Ground</th>
                        <th className="py-3 px-5">Date</th>
                        <th className="py-3 px-5">Slot Time</th>
                        <th className="py-3 px-5">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                      {filteredBookings.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No bookings recorded in this range</td></tr>
                      ) : (
                        paginatedBookings.map(b => (
                          <tr key={b.id} className="hover:bg-muted/15 transition-colors">
                            <td className="py-3 px-5 font-mono text-[10px]">{b.id}</td>
                            <td className="py-3 px-5">{b.customer?.name}</td>
                            <td className="py-3 px-5">{b.ground?.name}</td>
                            <td className="py-3 px-5">{new Date(b.booking_date).toLocaleDateString()}</td>
                            <td className="py-3 px-5">{b.start_time} - {b.end_time}</td>
                            <td className="py-3 px-5 font-bold">₹{b.final_amount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Mobile view */}
                  <div className="block sm:hidden divide-y divide-border/60">
                    {filteredBookings.length === 0 ? (
                      <p className="text-center py-10 text-xs text-muted-foreground">No bookings recorded in this range</p>
                    ) : (
                      paginatedBookings.map(b => (
                        <div key={b.id} className="p-4 space-y-2 text-left">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-mono">{b.id}</span>
                            <span>{new Date(b.booking_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-bold text-foreground text-sm block">{b.customer?.name}</span>
                              <span className="text-xs text-muted-foreground block">{b.ground?.name}</span>
                            </div>
                            <span className="font-bold text-foreground text-xs">₹{b.final_amount}</span>
                          </div>
                          <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                            Time Slot: <span className="font-semibold text-foreground">{b.start_time} - {b.end_time}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredBookings.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                      <span className="text-muted-foreground text-center sm:text-left">
                        Showing <strong className="text-foreground">{(bookingsPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(bookingsPage * ENTRIES_PER_PAGE, filteredBookings.length)}</strong> of <strong className="text-foreground">{filteredBookings.length}</strong> entries
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setBookingsPage(prev => Math.max(prev - 1, 1))}
                          disabled={bookingsPage === 1}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) || Math.abs(page - bookingsPage) <= 1)
                          .map((page, idx, arr) => {
                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                                <button
                                  type="button"
                                  onClick={() => setBookingsPage(page)}
                                  className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                    bookingsPage === page
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
                          onClick={() => setBookingsPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))))}
                          disabled={bookingsPage === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* REVENUE REPORT VIEW */}
              {selectedReportTab === 'revenue' && (
                <div className="overflow-x-auto">
                  {/* Desktop view */}
                  <table className="w-full border-collapse hidden sm:table">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-5">Ref ID</th>
                        <th className="py-3 px-5">Date</th>
                        <th className="py-3 px-5">Customer</th>
                        <th className="py-3 px-5">Net Bill</th>
                        <th className="py-3 px-5">Amount Paid</th>
                        <th className="py-3 px-5">Dues</th>
                        <th className="py-3 px-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                      {filteredBookings.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No revenues logged in this range</td></tr>
                      ) : (
                        paginatedRevenueBookings.map(b => {
                          const pay = paymentSummaries[b.id];
                          let statClass = 'bg-red-50 text-red-805 border-red-200';
                          if (pay?.status === 'Paid') statClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                          if (pay?.status === 'Partial') statClass = 'bg-amber-50 text-amber-800 border-amber-200';

                          return (
                            <tr key={b.id} className="hover:bg-muted/15 transition-colors">
                              <td className="py-3 px-5 font-mono text-[10px]">{b.id}</td>
                              <td className="py-3 px-5">{new Date(b.booking_date).toLocaleDateString()}</td>
                              <td className="py-3 px-5">{b.customer?.name}</td>
                              <td className="py-3 px-5">₹{b.final_amount}</td>
                              <td className="py-3 px-5 text-emerald-700">₹{pay ? pay.totalPaid : 0}</td>
                              <td className={`py-3 px-5 font-bold ${pay && pay.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                                ₹{pay ? pay.pendingAmount : 0}
                              </td>
                              <td className="py-3 px-5">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[9px] font-bold ${statClass}`}>
                                  {pay?.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Mobile view */}
                  <div className="block sm:hidden divide-y divide-border/60">
                    {filteredBookings.length === 0 ? (
                      <p className="text-center py-10 text-xs text-muted-foreground">No revenues logged in this range</p>
                    ) : (
                      paginatedRevenueBookings.map(b => {
                        const pay = paymentSummaries[b.id];
                        let statClass = 'bg-red-50 text-red-808 border-red-200';
                        if (pay?.status === 'Paid') statClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                        if (pay?.status === 'Partial') statClass = 'bg-amber-50 text-amber-800 border-amber-200';

                        return (
                          <div key={b.id} className="p-4 space-y-2 text-left">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="font-mono">{b.id}</span>
                              <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[9px] font-bold ${statClass}`}>
                                {pay?.status || 'Pending'}
                              </span>
                            </div>
                            <div>
                              <span className="font-bold text-foreground text-sm block">{b.customer?.name}</span>
                              <span className="text-xs text-muted-foreground block">{new Date(b.booking_date).toLocaleDateString()}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 py-1 text-xs">
                              <div>
                                <span className="text-[9px] text-muted-foreground block uppercase">Bill</span>
                                <span className="font-semibold">₹{b.final_amount}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground block uppercase">Paid</span>
                                <span className="font-semibold text-emerald-700">₹{pay ? pay.totalPaid : 0}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-muted-foreground block uppercase">Dues</span>
                                <span className={`font-bold ${pay && pay.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                                  ₹{pay ? pay.pendingAmount : 0}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredBookings.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                      <span className="text-muted-foreground text-center sm:text-left">
                        Showing <strong className="text-foreground">{(revenueBookingsPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(revenueBookingsPage * ENTRIES_PER_PAGE, filteredBookings.length)}</strong> of <strong className="text-foreground">{filteredBookings.length}</strong> entries
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRevenueBookingsPage(prev => Math.max(prev - 1, 1))}
                          disabled={revenueBookingsPage === 1}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE)) || Math.abs(page - revenueBookingsPage) <= 1)
                          .map((page, idx, arr) => {
                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                                <button
                                  type="button"
                                  onClick={() => setRevenueBookingsPage(page)}
                                  className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                    revenueBookingsPage === page
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
                          onClick={() => setRevenueBookingsPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))))}
                          disabled={revenueBookingsPage === Math.max(1, Math.ceil(filteredBookings.length / ENTRIES_PER_PAGE))}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expenses Breakdown Section (Deducted from revenue) */}
                  <div className="mt-8 border-t border-border pt-6 px-5">
                    <h3 className="text-xs font-bold text-foreground mb-3 flex items-center gap-2">
                      <ArrowDownCircle className="h-4.5 w-4.5 text-red-600" />
                      Expenses Breakdown (Deducted from Revenue)
                    </h3>
                  </div>
                  
                  {/* Desktop view for expenses */}
                  <table className="w-full border-collapse hidden sm:table">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-5">Ref ID</th>
                        <th className="py-3 px-5">Requested By (Phone)</th>
                        <th className="py-3 px-5">Reason</th>
                        <th className="py-3 px-5">Date</th>
                        <th className="py-3 px-5">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                      {filteredExpenses.length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">No expenses recorded in this range</td></tr>
                      ) : (
                        paginatedRevenueExpenses.map(e => (
                          <tr key={e.id} className="hover:bg-muted/15 transition-colors">
                            <td className="py-3 px-5 font-mono text-[10px]">{e.id.substring(0, 8)}...</td>
                            <td className="py-3 px-5 font-bold">{e.user_phone}</td>
                            <td className="py-3 px-5">{e.reason}</td>
                            <td className="py-3 px-5">{new Date(e.expense_date).toLocaleDateString()}</td>
                            <td className="py-3 px-5 text-red-650 font-bold">₹{Number(e.amount).toLocaleString('en-IN')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Mobile view for expenses */}
                  <div className="block sm:hidden divide-y divide-border/60">
                    {filteredExpenses.length === 0 ? (
                      <p className="text-center py-10 text-xs text-muted-foreground">No expenses recorded in this range</p>
                    ) : (
                      paginatedRevenueExpenses.map(e => (
                        <div key={e.id} className="p-4 space-y-1.5 text-left">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-mono">{e.id.substring(0, 8)}...</span>
                            <span>{new Date(e.expense_date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="font-bold text-foreground text-xs block">{e.user_phone}</span>
                              <span className="text-xs text-muted-foreground block">{e.reason}</span>
                            </div>
                            <span className="font-bold text-red-650 text-xs">₹{Number(e.amount).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredExpenses.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                      <span className="text-muted-foreground text-center sm:text-left">
                        Showing <strong className="text-foreground">{(revenueExpensesPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(revenueExpensesPage * ENTRIES_PER_PAGE, filteredExpenses.length)}</strong> of <strong className="text-foreground">{filteredExpenses.length}</strong> entries
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setRevenueExpensesPage(prev => Math.max(prev - 1, 1))}
                          disabled={revenueExpensesPage === 1}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE)) || Math.abs(page - revenueExpensesPage) <= 1)
                          .map((page, idx, arr) => {
                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                                <button
                                  type="button"
                                  onClick={() => setRevenueExpensesPage(page)}
                                  className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                    revenueExpensesPage === page
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
                          onClick={() => setRevenueExpensesPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE))))}
                          disabled={revenueExpensesPage === Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE))}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Profitability / Net Revenue Summary Footer */}
                  <div className="bg-muted/10 p-5 border-t border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs font-semibold">
                    <div className="space-y-1 text-left">
                      <p className="text-muted-foreground">Gross Collected Revenue: <strong className="text-foreground">₹{totalCollected.toLocaleString('en-IN')}</strong></p>
                      <p className="text-muted-foreground">Total Expenses Deducted: <strong className="text-red-650">₹{totalExpenses.toLocaleString('en-IN')}</strong></p>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-left">
                      <span className="text-[10px] font-bold text-primary uppercase block">Net Turf Profitability</span>
                      <span className="text-lg font-black text-primary">₹{netRevenue.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* PAYMENTS REPORT VIEW */}
              {selectedReportTab === 'payments' && (
                <div className="overflow-x-auto">
                  {/* Desktop view */}
                  <table className="w-full border-collapse hidden sm:table">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-5">Receipt ID</th>
                        <th className="py-3 px-5">Booking Ref</th>
                        <th className="py-3 px-5">Collected On</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Method</th>
                        <th className="py-3 px-5">Amount Collected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                      {filteredPayments.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No payment receipts in this range</td></tr>
                      ) : (
                        paginatedPayments.map(p => {
                          const parentBooking = bookings.find(book => book.id === p.booking_id);
                          return (
                            <tr key={p.id} className="hover:bg-muted/15 transition-colors">
                              <td className="py-3 px-5 font-mono text-[10px]">{p.id}</td>
                              <td className="py-3 px-5 font-mono text-[10px]">{p.booking_id}</td>
                              <td className="py-3 px-5">{new Date(p.payment_date).toLocaleDateString()}</td>
                              <td className="py-3 px-5">{parentBooking?.customer?.name || 'Walk-in'}</td>
                              <td className="py-3 px-5">
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md border border-blue-100 text-[10px] font-bold">
                                  {p.payment_method}
                                </span>
                              </td>
                              <td className="py-3 px-5 font-bold text-emerald-700">₹{p.amount_paid}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Mobile view */}
                  <div className="block sm:hidden divide-y divide-border/60">
                    {filteredPayments.length === 0 ? (
                      <p className="text-center py-10 text-xs text-muted-foreground">No payment receipts in this range</p>
                    ) : (
                      paginatedPayments.map(p => {
                        const parentBooking = bookings.find(book => book.id === p.booking_id);
                        return (
                          <div key={p.id} className="p-4 space-y-2 text-left">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="font-mono">Receipt: {p.id}</span>
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md border border-blue-100 text-[10px] font-bold">
                                {p.payment_method}
                              </span>
                            </div>
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="font-bold text-foreground text-sm block">{parentBooking?.customer?.name || 'Walk-in'}</span>
                                <span className="text-xs text-muted-foreground block">Collected: {new Date(p.payment_date).toLocaleDateString()}</span>
                              </div>
                              <span className="font-bold text-emerald-705 text-sm">₹{p.amount_paid}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                              Booking Ref: {p.booking_id}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredPayments.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                      <span className="text-muted-foreground text-center sm:text-left">
                        Showing <strong className="text-foreground">{(paymentsPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(paymentsPage * ENTRIES_PER_PAGE, filteredPayments.length)}</strong> of <strong className="text-foreground">{filteredPayments.length}</strong> entries
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPaymentsPage(prev => Math.max(prev - 1, 1))}
                          disabled={paymentsPage === 1}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.max(1, Math.ceil(filteredPayments.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredPayments.length / ENTRIES_PER_PAGE)) || Math.abs(page - paymentsPage) <= 1)
                          .map((page, idx, arr) => {
                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                                <button
                                  type="button"
                                  onClick={() => setPaymentsPage(page)}
                                  className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                    paymentsPage === page
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
                          onClick={() => setPaymentsPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredPayments.length / ENTRIES_PER_PAGE))))}
                          disabled={paymentsPage === Math.max(1, Math.ceil(filteredPayments.length / ENTRIES_PER_PAGE))}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DISCOUNTS REPORT VIEW */}
              {selectedReportTab === 'discounts' && (
                <div className="overflow-x-auto">
                  {/* Desktop view */}
                  <table className="w-full border-collapse hidden sm:table">
                    <thead>
                      <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <th className="py-3 px-5">Booking ID</th>
                        <th className="py-3 px-5">Customer Name</th>
                        <th className="py-3 px-5">Scheduled Date</th>
                        <th className="py-3 px-5">Base Amount</th>
                        <th className="py-3 px-5">Discount Given</th>
                        <th className="py-3 px-5">Reason / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                      {filteredDiscounts.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">No discounts registered in this range</td></tr>
                      ) : (
                        paginatedDiscounts.map(b => (
                          <tr key={b.id} className="hover:bg-muted/15 transition-colors">
                            <td className="py-3 px-5 font-mono text-[10px]">{b.id}</td>
                            <td className="py-3 px-5">{b.customer?.name}</td>
                            <td className="py-3 px-5">{new Date(b.booking_date).toLocaleDateString()}</td>
                            <td className="py-3 px-5">₹{b.amount}</td>
                            <td className="py-3 px-5 text-purple-700 font-bold">₹{b.discount}</td>
                            <td className="py-3 px-5 text-muted-foreground italic font-normal">{b.notes || 'Regular Customer discount'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {/* Mobile view */}
                  <div className="block sm:hidden divide-y divide-border/60">
                    {filteredDiscounts.length === 0 ? (
                      <p className="text-center py-10 text-xs text-muted-foreground">No discounts registered in this range</p>
                    ) : (
                      paginatedDiscounts.map(b => (
                        <div key={b.id} className="p-4 space-y-2 text-left">
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="font-mono">{b.id}</span>
                            <span>{new Date(b.booking_date).toLocaleDateString()}</span>
                          </div>
                          <div>
                            <span className="font-bold text-foreground text-sm block">{b.customer?.name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 py-1 text-xs">
                            <div>
                              <span className="text-[9px] text-muted-foreground block uppercase">Base Amount</span>
                              <span>₹{b.amount}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-muted-foreground block uppercase">Discount</span>
                              <span className="text-purple-700 font-bold">₹{b.discount}</span>
                            </div>
                          </div>
                          {b.notes && (
                            <div className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/40">
                              Reason: {b.notes}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {filteredDiscounts.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                      <span className="text-muted-foreground text-center sm:text-left">
                        Showing <strong className="text-foreground">{(discountsPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(discountsPage * ENTRIES_PER_PAGE, filteredDiscounts.length)}</strong> of <strong className="text-foreground">{filteredDiscounts.length}</strong> entries
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDiscountsPage(prev => Math.max(prev - 1, 1))}
                          disabled={discountsPage === 1}
                          className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                        >
                          Previous
                        </button>
                        {Array.from({ length: Math.max(1, Math.ceil(filteredDiscounts.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                          .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredDiscounts.length / ENTRIES_PER_PAGE)) || Math.abs(page - discountsPage) <= 1)
                          .map((page, idx, arr) => {
                            const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                                <button
                                  type="button"
                                  onClick={() => setDiscountsPage(page)}
                                  className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                    discountsPage === page
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
                          onClick={() => setDiscountsPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredDiscounts.length / ENTRIES_PER_PAGE))))}
                          disabled={discountsPage === Math.max(1, Math.ceil(filteredDiscounts.length / ENTRIES_PER_PAGE))}
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
        </div>
      </div>
    </DashboardLayout>
  );
}
