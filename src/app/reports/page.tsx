'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  getBookings, 
  getPayments, 
  getBookingPaymentSummaries 
} from '@/lib/db/db-service';
import { Booking, Payment } from '@/lib/db/types';
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
  const [loading, setLoading] = useState(true);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedReportTab, setSelectedReportTab] = useState<'bookings' | 'revenue' | 'payments' | 'discounts'>('bookings');
  const [methodFilter, setMethodFilter] = useState<string>('all');

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

  // Export handlers
  const handleExportPDF = async () => {
    const rangeText = `${startDate} to ${endDate}`;
    
    try {
      if (selectedReportTab === 'bookings' || selectedReportTab === 'revenue') {
        const activeList = getFilteredBookings();
        await exportRevenueReportPDF(activeList, paymentSummaries, rangeText, payments);
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

  // We want the metrics cards to show the total overall payments for the date range, regardless of payment method filter
  const overallCollectedPayments = payments.filter(p => {
    const pDate = getLocalFormattedDateFromTimestamp(p.payment_date);
    const parentBooking = bookings.find(b => b.id === p.booking_id);
    const isBookingActive = parentBooking && parentBooking.status !== 'Cancelled';
    return (!startDate || pDate >= startDate) && (!endDate || pDate <= endDate) && isBookingActive;
  });

  const totalBillable = filteredBookings.reduce((sum, b) => sum + Number(b.final_amount), 0);
  const totalCollected = overallCollectedPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const totalDues = Math.max(0, totalBillable - totalCollected);
  const totalDiscountAmount = filteredDiscounts.reduce((sum, b) => sum + Number(b.discount), 0);

  const totalUPI = overallCollectedPayments
    .filter(p => p.payment_method === 'UPI')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const totalCash = overallCollectedPayments
    .filter(p => p.payment_method === 'Cash')
    .reduce((sum, p) => sum + Number(p.amount_paid), 0);

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
          <div className="flex items-center gap-2 text-xs font-bold text-primary mr-2">
            <Filter className="h-4.5 w-4.5" /> Filter Parameters
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Bookings Count</span>
            <span className="text-lg font-bold text-foreground block mt-1">{filteredBookings.length} bookings</span>
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
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Dues Remaining</span>
            <span className="text-lg font-bold text-amber-600 block mt-1">₹{totalDues.toLocaleString('en-IN')}</span>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-4.5 shadow-sm">
            <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100 w-fit block">Discounts Given</span>
            <span className="text-lg font-bold text-purple-700 block mt-1">₹{totalDiscountAmount.toLocaleString('en-IN')}</span>
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
                        filteredBookings.map(b => (
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
                      filteredBookings.map(b => (
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
                        filteredBookings.map(b => {
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
                      filteredBookings.map(b => {
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
                        filteredPayments.map(p => {
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
                      filteredPayments.map(p => {
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
                              <span className="font-bold text-emerald-700 text-sm">₹{p.amount_paid}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40 font-mono">
                              Booking Ref: {p.booking_id}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
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
                        filteredDiscounts.map(b => (
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
                      filteredDiscounts.map(b => (
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
