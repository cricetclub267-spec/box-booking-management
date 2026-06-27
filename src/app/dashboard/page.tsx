'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { 
  getBookings, 
  getCustomers, 
  getPayments, 
  getActivityLogs, 
  getBookingPaymentSummary,
  getExpenses 
} from '@/lib/db/db-service';
import { Booking, Payment, ActivityLog, Expense } from '@/lib/db/types';
import { 
  CalendarDays, 
  IndianRupee, 
  Users, 
  CreditCard, 
  TrendingUp, 
  Clock, 
  ArrowRight,
  TrendingDown,
  Activity,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useToastStore } from '@/lib/store/toast-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { DatePicker } from '@/components/ui/date-picker';

import dynamic from 'next/dynamic';

const RevenueChart = dynamic(() => import('@/components/dashboard/revenue-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  )
});

const BookingsChart = dynamic(() => import('@/components/dashboard/bookings-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  )
});

const PaymentModeChart = dynamic(() => import('@/components/dashboard/payment-mode-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center">
      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  )
});

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

export default function DashboardPage() {
  const { showToast } = useToastStore();
  const { user } = useAuthStore();
  const [filterType, setFilterType] = useState<'today' | 'week' | 'month'>('today');
  const [filterDate, setFilterDate] = useState<string>('');

  // Raw fetched arrays
  const [rawBookings, setRawBookings] = useState<Booking[]>([]);
  const [rawCustomers, setRawCustomers] = useState<any[]>([]);
  const [rawPayments, setRawPayments] = useState<Payment[]>([]);
  const [rawExpenses, setRawExpenses] = useState<Expense[]>([]);
  
  const [bookings, setBookings] = useState<Booking[]>([]); // Current filtered bookings for other components
  const [customers, setCustomers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic statistics
  const [stats, setStats] = useState({
    todayBookings: 0,
    todayRevenue: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
    pendingPayments: 0,
    totalCustomers: 0
  });

  // Chart data
  const [chartData, setChartData] = useState<any[]>([]);
  const [paymentModeStats, setPaymentModeStats] = useState<{ name: string; value: number }[]>([]);

  // Initialize filterDate on mount
  useEffect(() => {
    setFilterDate(getLocalFormattedDate(new Date()));
  }, []);

  // 1. Fetch raw data once on mount
  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const b = await getBookings();
        const c = await getCustomers();
        const p = await getPayments();
        const l = await getActivityLogs();

        // Load expenses (gracefully handle if table doesn't exist yet)
        let allExpenses: Expense[] = [];
        try {
          allExpenses = await getExpenses();
        } catch (err) {
          console.warn('Could not load expenses:', err);
        }

        // Filter out payments for deleted/cancelled bookings
        const activeBookingIds = new Set(b.filter(book => book.status !== 'Cancelled').map(book => book.id));
        const activePayments = p.filter(pay => activeBookingIds.has(pay.booking_id));

        setRawBookings(b);
        setRawCustomers(c);
        setRawPayments(activePayments);
        setRawExpenses(allExpenses);
        setLogs(l);
        
        setCustomers(c);
      } catch (err: any) {
        console.error('Error loading dashboard stats:', err);
        showToast(`Database error: ${err.message || err}`, 'error');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Helper: Parse date YYYY-MM-DD locally (avoiding UTC conversion shift)
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // 2. Perform stats and charts calculation when raw data or filters change
  useEffect(() => {
    if (!filterDate || loading) return;

    // Helper: Check if a date string falls within active range
    const isWithinRange = (dateStr: string) => {
      if (!dateStr) return false;
      const checkDate = parseLocalDate(dateStr);
      const refDate = parseLocalDate(filterDate);

      if (filterType === 'today') {
        return dateStr === filterDate;
      }

      if (filterType === 'week') {
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

      if (filterType === 'month') {
        return checkDate.getFullYear() === refDate.getFullYear() && checkDate.getMonth() === refDate.getMonth();
      }

      return false;
    };

    // Filter Bookings, Payments, Expenses for active period
    const periodBookings = rawBookings.filter(b => b.status !== 'Cancelled' && isWithinRange(b.booking_date));
    
    // For payments, we parse payment_date timestamp to YYYY-MM-DD
    const periodPayments = rawPayments.filter(p => isWithinRange(getLocalFormattedDateFromTimestamp(p.payment_date)));
    
    const periodExpenses = rawExpenses.filter(e => isWithinRange(e.expense_date));

    // Expose filtered list to children schedule views
    setBookings(rawBookings.filter(b => isWithinRange(b.booking_date)));
    setPayments(periodPayments);

    // Calculate dynamic stats
    const revenueSum = periodPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
    const expenseSum = periodExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    
    // Calculate bookingsValue (sum of final bill amounts of bookings scheduled in this period)
    const bookingsValueSum = periodBookings.reduce((sum, b) => sum + Number(b.final_amount), 0);

    // Calculate pending dues for bookings scheduled in this period
    const paymentsByBooking: Record<string, number> = {};
    for (const pay of rawPayments) {
      paymentsByBooking[pay.booking_id] = (paymentsByBooking[pay.booking_id] || 0) + Number(pay.amount_paid);
    }
    
    let totalDues = 0;
    for (const booking of periodBookings) {
      const totalPaid = paymentsByBooking[booking.id] || 0;
      const finalAmount = Number(booking.final_amount) || 0;
      totalDues += Math.max(0, finalAmount - totalPaid);
    }

    setStats({
      todayBookings: periodBookings.length,
      todayRevenue: revenueSum,
      monthlyRevenue: bookingsValueSum, // Representing bookings value
      monthlyExpenses: expenseSum, // Period expenses
      pendingPayments: totalDues,
      totalCustomers: rawCustomers.length
    });

    // Payment mode share for the selected period
    const upiTotal = periodPayments.filter(pay => pay.payment_method === 'UPI').reduce((sum, pay) => sum + Number(pay.amount_paid), 0);
    const cashTotal = periodPayments.filter(pay => pay.payment_method === 'Cash').reduce((sum, pay) => sum + Number(pay.amount_paid), 0);
    const cardTotal = periodPayments.filter(pay => pay.payment_method === 'Card').reduce((sum, pay) => sum + Number(pay.amount_paid), 0);
    const bankTotal = periodPayments.filter(pay => pay.payment_method === 'Bank Transfer').reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

    setPaymentModeStats([
      { name: 'UPI', value: upiTotal },
      { name: 'Cash', value: cashTotal },
      { name: 'Card', value: cardTotal },
      { name: 'Bank Transfer', value: bankTotal }
    ]);

    // 2. Generate trend data for charts based on period
    const trend: any[] = [];

    if (filterType === 'today') {
      // Hourly trend for the day
      const activeHours = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
      for (let i = 0; i < activeHours.length; i++) {
        const startStr = activeHours[i];
        const endStr = i < activeHours.length - 1 ? activeHours[i + 1] : '24:00';
        const startHourNum = parseInt(startStr.split(':')[0]);
        const endHourNum = parseInt(endStr.split(':')[0]);
        
        const displayLabel = startHourNum === 12 ? '12 PM' : startHourNum > 12 ? `${startHourNum - 12} PM` : `${startHourNum} AM`;

        // Bookings in this time range
        const hourBookingsCount = rawBookings.filter(book => {
          if (book.booking_date !== filterDate || book.status === 'Cancelled') return false;
          const bookStart = parseInt(book.start_time.split(':')[0]);
          return bookStart >= startHourNum && bookStart < endHourNum;
        }).length;

        // Payments in this hour range
        const hourPaymentsCollected = rawPayments.filter(pay => {
          const payDate = new Date(pay.payment_date);
          const payDateStr = getLocalFormattedDate(payDate);
          const payHour = payDate.getHours();
          return payDateStr === filterDate && payHour >= startHourNum && payHour < endHourNum;
        }).reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

        trend.push({
          name: displayLabel,
          bookings: hourBookingsCount,
          revenue: hourPaymentsCollected
        });
      }
    } else if (filterType === 'week') {
      // Daily trend for the week (Monday - Sunday)
      const refDate = parseLocalDate(filterDate);
      const day = refDate.getDay();
      const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(refDate);
      monday.setDate(diff);

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = getLocalFormattedDate(d);
        const label = d.toLocaleDateString(undefined, { weekday: 'short' });

        const dailyBookingsCount = rawBookings.filter(book => book.booking_date === dateStr && book.status !== 'Cancelled').length;
        const dailyPaymentsCollected = rawPayments.filter(pay => getLocalFormattedDateFromTimestamp(pay.payment_date) === dateStr)
                                        .reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

        trend.push({
          name: label,
          bookings: dailyBookingsCount,
          revenue: dailyPaymentsCollected
        });
      }
    } else if (filterType === 'month') {
      // Weekly trend for the current month
      const refDate = parseLocalDate(filterDate);
      const year = refDate.getFullYear();
      const month = refDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // Group days into 4 blocks
      const weekStarts = [1, 9, 17, 25];
      for (let w = 0; w < 4; w++) {
        const startDay = weekStarts[w];
        const endDay = w < 3 ? weekStarts[w + 1] - 1 : daysInMonth;
        const label = `Days ${startDay}-${endDay}`;

        let rangeBookings = 0;
        let rangeRevenue = 0;

        for (let day = startDay; day <= endDay; day++) {
          const d = new Date(year, month, day);
          const dateStr = getLocalFormattedDate(d);
          
          rangeBookings += rawBookings.filter(book => book.booking_date === dateStr && book.status !== 'Cancelled').length;
          rangeRevenue += rawPayments.filter(pay => getLocalFormattedDateFromTimestamp(pay.payment_date) === dateStr)
                            .reduce((sum, pay) => sum + Number(pay.amount_paid), 0);
        }

        trend.push({
          name: label,
          bookings: rangeBookings,
          revenue: rangeRevenue
        });
      }
    }

    setChartData(trend);
  }, [rawBookings, rawPayments, rawExpenses, rawCustomers, filterType, filterDate, loading]);

  const handlePrevPeriod = () => {
    if (!filterDate) return;
    const current = parseLocalDate(filterDate);
    if (filterType === 'today') {
      current.setDate(current.getDate() - 1);
    } else if (filterType === 'week') {
      current.setDate(current.getDate() - 7);
    } else if (filterType === 'month') {
      current.setMonth(current.getMonth() - 1);
    }
    setFilterDate(getLocalFormattedDate(current));
  };

  const handleNextPeriod = () => {
    if (!filterDate) return;
    const current = parseLocalDate(filterDate);
    if (filterType === 'today') {
      current.setDate(current.getDate() + 1);
    } else if (filterType === 'week') {
      current.setDate(current.getDate() + 7);
    } else if (filterType === 'month') {
      current.setMonth(current.getMonth() + 1);
    }
    setFilterDate(getLocalFormattedDate(current));
  };

  const handleResetToday = () => {
    setFilterDate(getLocalFormattedDate(new Date()));
  };

  const getFilterTitle = () => {
    if (!filterDate) return '';
    const dateObj = parseLocalDate(filterDate);
    if (filterType === 'today') {
      return dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else if (filterType === 'week') {
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Turf Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analytics for <span className="font-extrabold text-primary">{getFilterTitle()}</span>
            </p>
          </div>
          <Link
            href="/bookings"
            className="py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {user?.role !== 'partner' ? 'Add Booking' : 'View Bookings'}
          </Link>
        </div>

        {/* Date / Period Filter Control Bar */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={handlePrevPeriod}
              className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={handleNextPeriod}
              className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button 
              onClick={handleResetToday}
              className="px-3.5 py-2 hover:bg-muted border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              Today
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-end">
            {/* Period selector */}
            <div className="bg-muted/40 border border-border/80 rounded-xl p-1 flex shadow-sm">
              {(['today', 'week', 'month'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    filterType === type
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {type === 'today' ? 'Day' : type === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>

            {/* Date Picker Input */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase hidden sm:inline-block">Date:</span>
              <DatePicker
                value={filterDate}
                onChange={(val) => {
                  if (val) setFilterDate(val);
                }}
                align="end"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          {/* Card 1 - Slots Booked */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Slots Booked</span>
            <div className="flex items-baseline justify-between mt-3 text-left">
              <span className="text-2xl font-extrabold text-foreground">{stats.todayBookings}</span>
              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                Active
              </span>
            </div>
          </div>

          {/* Card 2 - Revenue Collected */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit block">Revenue Collected</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-emerald-700 shrink-0" />
              <span className="text-2xl font-extrabold text-emerald-700 leading-tight">
                {stats.todayRevenue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 3 - Bookings Value */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-primary bg-accent/60 px-2 py-0.5 rounded-lg border border-primary/10 w-fit block">Bookings Value</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-primary shrink-0" />
              <span className="text-2xl font-extrabold text-primary leading-tight">
                {stats.monthlyRevenue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 4 - Expenses Paid */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100 w-fit block">Expenses Paid</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-red-600 shrink-0" />
              <span className="text-2xl font-extrabold text-red-600 leading-tight">
                {stats.monthlyExpenses.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 5 - Net Profit */}
          {(() => {
            const netProfit = stats.todayRevenue - stats.monthlyExpenses;
            const isProfit = netProfit >= 0;
            return (
              <div className={`bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${isProfit ? 'border-emerald-200/80' : 'border-red-200/80'}`}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border w-fit block ${isProfit ? 'text-emerald-800 bg-emerald-50 border-emerald-100' : 'text-red-800 bg-red-50 border-red-100'}`}>
                  {isProfit ? 'Net Profit' : 'Net Loss'}
                </span>
                <div className="flex items-baseline gap-0.5 mt-3 text-left">
                  <IndianRupee className={`h-5 w-5 shrink-0 ${isProfit ? 'text-emerald-600' : 'text-red-600'}`} />
                  <span className={`text-2xl font-extrabold leading-tight ${isProfit ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Math.abs(netProfit).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground/60 mt-1.5 font-medium">Revenue − Expenses</p>
              </div>
            );
          })()}

          {/* Card 6 - Pending Dues */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Pending Dues</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="text-2xl font-extrabold text-amber-600 leading-tight">
                {stats.pendingPayments.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 7 - Total Customers */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Customers</span>
            <div className="flex items-baseline justify-between mt-3 text-left">
              <span className="text-2xl font-extrabold text-foreground">{stats.totalCustomers}</span>
              <span className="text-[9px] font-bold text-primary bg-accent/50 px-2 py-0.5 rounded-lg">
                Profiles
              </span>
            </div>
          </div>
        </div>

        {/* Charts & Analytics Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Revenue Trend Area Chart */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm md:col-span-2 text-left">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-foreground">Revenue Collection Trend</h3>
                <p className="text-[10px] text-muted-foreground">
                  {filterType === 'today' ? 'Hourly' : filterType === 'week' ? 'Daily' : 'Weekly'} payment receipt volumes
                </p>
              </div>
              <span className="text-[10px] font-bold text-primary bg-accent/50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Tracked Periodically
              </span>
            </div>
            
            <div className="h-64 w-full">
              {loading ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <RevenueChart data={chartData} />
              )}
            </div>
          </div>

          {/* Bookings Trend Bar Chart */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm text-left">
            <h3 className="font-bold text-sm text-foreground mb-1">Slots Booking Frequency</h3>
            <p className="text-[10px] text-muted-foreground mb-4">
              Volume of matches played in this period
            </p>
            
            <div className="h-64 w-full">
              {loading ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <BookingsChart data={chartData} />
              )}
            </div>
          </div>

          {/* Payment Method Share Pie Chart */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm text-left">
            <h3 className="font-bold text-sm text-foreground mb-1">Payment Method Share</h3>
            <p className="text-[10px] text-muted-foreground mb-4">Breakdown of collections by payment mode</p>
            
            <div className="h-64 w-full">
              {loading ? (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <PaymentModeChart data={paymentModeStats} />
              )}
            </div>
          </div>
        </div>

        {/* Bottom Row - Logs & Quick Bookings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
          {/* Logs Activity Feed */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-primary" /> Recent Audit Activity
              </h3>
              <span className="text-[9px] font-bold text-muted-foreground uppercase">Real-time</span>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center py-10 text-xs text-muted-foreground">No recent actions recorded</p>
            ) : (
              <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                {logs.slice(0, 5).map((log) => {
                  const initials = log.user_email.split('@')[0].substring(0, 2).toUpperCase();
                  return (
                    <div key={log.id} className="flex items-start gap-3 text-xs leading-normal">
                      <div className="h-7 w-7 rounded-lg bg-muted text-foreground/80 font-bold border border-border flex items-center justify-center text-[10px] shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{log.action}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <span>By: {log.user_email}</span>
                          <span>•</span>
                          <span>{new Date(log.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Slot Display */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-sm text-foreground mb-1">
                Schedule Quick View ({filterDate === getLocalFormattedDate(new Date()) ? 'Today' : filterDate})
              </h3>
              <p className="text-[10px] text-muted-foreground mb-4">Immediate snapshot of scheduled matches</p>
              
              <div className="space-y-2.5">
                {loading ? (
                  <div className="py-8 flex justify-center">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : rawBookings.filter(b => b.booking_date === filterDate && b.status !== 'Cancelled').length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">No matches scheduled for this date.</p>
                ) : (
                  rawBookings
                    .filter(b => b.booking_date === filterDate && b.status !== 'Cancelled')
                    .slice(0, 3)
                    .map(b => (
                      <div key={b.id} className="flex items-center justify-between p-2.5 border border-border/60 bg-muted/20 rounded-xl text-xs font-semibold">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{b.customer?.name}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{b.ground?.name.split(' (')[0]}</p>
                        </div>
                        <span className="text-[10px] text-primary bg-accent border border-primary/20 rounded-lg px-2 py-0.5 font-bold shrink-0">
                          {b.start_time} - {b.end_time}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
            
            <Link 
              href="/bookings"
              className="mt-5 w-full py-2 bg-muted text-foreground/80 hover:bg-muted/80 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all group"
            >
              Open Full Scheduler
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


