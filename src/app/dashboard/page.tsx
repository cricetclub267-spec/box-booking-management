'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { 
  getBookings, 
  getCustomers, 
  getPayments, 
  getActivityLogs, 
  getBookingPaymentSummary 
} from '@/lib/db/db-service';
import { Booking, Payment, ActivityLog } from '@/lib/db/types';
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
  Plus
} from 'lucide-react';
import Link from 'next/link';

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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic statistics
  const [stats, setStats] = useState({
    todayBookings: 0,
    todayRevenue: 0,
    monthlyRevenue: 0,
    pendingPayments: 0,
    totalCustomers: 0
  });

  // Chart data
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const b = await getBookings();
        const c = await getCustomers();
        const p = await getPayments();
        const l = await getActivityLogs();

        setBookings(b);
        setCustomers(c);
        setPayments(p);
        setLogs(l);

        // 1. Calculations
        const todayStr = getLocalFormattedDate(new Date());
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // Today's Bookings
        const todayB = b.filter(book => book.booking_date === todayStr && book.status !== 'Cancelled');
        
        // Today's Revenue (payments logged today)
        const todayR = p.filter(pay => getLocalFormattedDateFromTimestamp(pay.payment_date) === todayStr)
                        .reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

        // Monthly Revenue (payments logged this month)
        const monthR = p.filter(pay => {
          const payDate = new Date(pay.payment_date);
          return payDate.getMonth() === currentMonth && payDate.getFullYear() === currentYear;
        }).reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

        // Pending Payments
        let totalDues = 0;
        for (const booking of b.filter(book => book.status !== 'Cancelled')) {
          const summary = await getBookingPaymentSummary(booking.id);
          totalDues += summary.pendingAmount;
        }

        setStats({
          todayBookings: todayB.length,
          todayRevenue: todayR,
          monthlyRevenue: monthR,
          pendingPayments: totalDues,
          totalCustomers: c.length
        });

        // 2. Generate past 7 days trend data for charts
        const trend: any[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = getLocalFormattedDate(d);
          const label = d.toLocaleDateString(undefined, { weekday: 'short' });

          const dailyBookingsCount = b.filter(book => book.booking_date === dateStr && book.status !== 'Cancelled').length;
          const dailyPaymentsCollected = p.filter(pay => getLocalFormattedDateFromTimestamp(pay.payment_date) === dateStr)
                                          .reduce((sum, pay) => sum + Number(pay.amount_paid), 0);

          trend.push({
            name: label,
            bookings: dailyBookingsCount,
            revenue: dailyPaymentsCollected
          });
        }
        setChartData(trend);

      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Turf Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Plan, schedule, and audit turf reservations with ease.</p>
          </div>
          <Link
            href="/bookings"
            className="py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Manage Bookings
          </Link>
        </div>

        {/* Dynamic Metric Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1 */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Today's Slots</span>
            <div className="flex items-baseline justify-between mt-3 text-left">
              <span className="text-2xl font-extrabold text-foreground">{stats.todayBookings}</span>
              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                Active
              </span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 w-fit block">Today's Revenue</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-emerald-700 shrink-0" />
              <span className="text-2xl font-extrabold text-emerald-700 leading-tight">
                {stats.todayRevenue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-primary bg-accent/60 px-2 py-0.5 rounded-lg border border-primary/10 w-fit block">Monthly Revenue</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-primary shrink-0" />
              <span className="text-2xl font-extrabold text-primary leading-tight">
                {stats.monthlyRevenue.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Pending Dues</span>
            <div className="flex items-baseline gap-0.5 mt-3 text-left">
              <IndianRupee className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="text-2xl font-extrabold text-amber-600 leading-tight">
                {stats.pendingPayments.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Card 5 */}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Trend Area Chart */}
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm lg:col-span-2 text-left">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-foreground">Revenue Collection Trend</h3>
                <p className="text-[10px] text-muted-foreground">Daily payment receipt volumes over the past 7 days</p>
              </div>
              <span className="text-[10px] font-bold text-primary bg-accent/50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Tracked Weekly
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
            <p className="text-[10px] text-muted-foreground mb-4">Volume of matches played weekly</p>
            
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
              <h3 className="font-bold text-sm text-foreground mb-1">Today's Schedule Quick View</h3>
              <p className="text-[10px] text-muted-foreground mb-4">Immediate snapshot of upcoming matches today</p>
              
              <div className="space-y-2.5">
                {loading ? (
                  <div className="py-8 flex justify-center">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : bookings.filter(b => b.booking_date === getLocalFormattedDate(new Date()) && b.status !== 'Cancelled').length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">No matches scheduled today.</p>
                ) : (
                  bookings
                    .filter(b => b.booking_date === getLocalFormattedDate(new Date()) && b.status !== 'Cancelled')
                    .slice(0, 3)
                    .map(b => (
                      <div key={b.id} className="flex items-center justify-between p-2.5 border border-border/60 bg-muted/20 rounded-xl text-xs font-semibold">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{b.customer?.name}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{b.ground?.name.split(' ')[0]}</p>
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
