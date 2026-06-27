'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  getExpenses, 
  createExpense, 
  updateExpense, 
  deleteExpense, 
  getUsersList 
} from '@/lib/db/db-service';
import { Expense, User } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToastStore } from '@/lib/store/toast-store';
import { sanitizeInput, checkRateLimit, getErrorMessage } from '@/lib/security';
import { hasSupabaseCredentials, supabase } from '@/lib/db/supabase';

import { 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  X, 
  AlertCircle, 
  IndianRupee, 
  Coins, 
  Calendar,
  UserCheck
} from 'lucide-react';

export default function ExpensesPage() {
  const { user } = useAuthStore();
  const { showToast } = useToastStore();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination State
  const [expensesPage, setExpensesPage] = useState(1);

  // Reset page when search changes
  useEffect(() => {
    setExpensesPage(1);
  }, [searchTerm]);

  // Add/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Form Fields
  const [formPhone, setFormPhone] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Get current date formatted in local time
  const getTodayFormatted = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      try {
        const allUsers = await getUsersList();
        setUsersList(allUsers);
        if (allUsers.length > 0 && !formPhone) {
          setFormPhone(allUsers[0].phone);
        }
      } catch (err) {
        console.error('Error loading users list:', err);
      }

      try {
        const allExpenses = await getExpenses();
        setExpenses(allExpenses);
      } catch (err) {
        console.error('Error loading expenses:', err);
      }
    } catch (e) {
      console.error('Error loading expenses page data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Focus/Visibility Listeners
    const handleFocus = () => {
      loadData(true);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // Realtime Supabase Channel
    let channel: any = null;
    if (hasSupabaseCredentials() && supabase) {
      channel = supabase
        .channel('expenses-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'expenses' },
          () => {
            loadData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users' },
          () => {
            loadData(true);
          }
        )
        .subscribe();
    }

    // Fallback polling if no Supabase
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

  // Filtered Expenses
  const filteredExpenses = expenses.filter(e => {
    const matchSearch = e.reason.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        e.user_phone.includes(searchTerm) || 
                        (e.id && e.id.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchSearch;
  });

  const ENTRIES_PER_PAGE = 12;
  const paginatedExpenses = filteredExpenses.slice((expensesPage - 1) * ENTRIES_PER_PAGE, expensesPage * ENTRIES_PER_PAGE);

  // Calculate Metrics
  const totalExpenseSum = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const currentMonthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();
  const mtdExpenseSum = expenses
    .filter(e => e.expense_date >= currentMonthStart)
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Form Handlers
  const handleOpenAddModal = () => {
    setModalMode('add');
    setSelectedExpense(null);
    setFormPhone(usersList[0]?.phone || '');
    setFormReason('');
    setFormAmount('');
    setFormDate(getTodayFormatted());
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (expense: Expense) => {
    setModalMode('edit');
    setSelectedExpense(expense);
    setFormPhone(expense.user_phone);
    setFormReason(expense.reason);
    setFormAmount(expense.amount.toString());
    setFormDate(expense.expense_date);
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Form Validation
    if (!formPhone.trim()) {
      setFormError('Please select a partner or admin phone number');
      return;
    }
    if (!formReason.trim()) {
      setFormError('Please specify the reason for this expense');
      return;
    }
    const amt = Number(formAmount);
    if (!formAmount || isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid expense amount greater than 0');
      return;
    }
    if (!formDate) {
      setFormError('Please select an expense date');
      return;
    }

    // Rate Limiting
    const rateCheck = checkRateLimit('expense_save', 10, 10000, 5000);
    if (!rateCheck.allowed) {
      const errMsg = `Too many actions. Please wait ${rateCheck.retryAfterSeconds} seconds.`;
      setFormError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    // Retrieve corresponding user_id (if available)
    const matchingUser = usersList.find(u => u.phone === formPhone);
    const userId = matchingUser ? matchingUser.id : null;

    const payload = {
      user_phone: sanitizeInput(formPhone),
      reason: sanitizeInput(formReason),
      amount: amt,
      expense_date: formDate,
      user_id: userId
    };

    setSubmitting(true);
    try {
      if (modalMode === 'add') {
        await createExpense(payload, user?.email);
        showToast('Expense recorded successfully!', 'success');
      } else {
        if (!selectedExpense) return;
        await updateExpense({
          ...selectedExpense,
          ...payload
        }, user?.email);
        showToast('Expense updated successfully!', 'success');
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      const errMsg = getErrorMessage(err, 'Failed to save expense');
      setFormError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Handlers
  const handleOpenDeleteModal = (expense: Expense) => {
    setExpenseToDelete(expense);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!expenseToDelete) return;
    setDeleting(true);
    try {
      await deleteExpense(expenseToDelete.id, user?.email);
      showToast('Expense deleted successfully!', 'success');
      setShowDeleteModal(false);
      setExpenseToDelete(null);
      await loadData();
    } catch (err: any) {
      const errMsg = getErrorMessage(err, 'Failed to delete expense');
      showToast(errMsg, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Expenses Ledger</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Record business expenses, allocate partner debits, and audit turf cash outflows</p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Record Expense
          </button>
        </div>

        {/* Expense Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100 w-fit block">Total Expenses</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-red-700 shrink-0" />
              <span className="text-xl font-bold text-red-700 leading-tight">
                {totalExpenseSum.toLocaleString('en-IN')}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/60 mt-1 font-medium">All-time tracked expenses</p>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 w-fit block">Month-to-Date Expenses</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <IndianRupee className="h-5 w-5 text-amber-700 shrink-0" />
              <span className="text-xl font-bold text-amber-700 leading-tight">
                {mtdExpenseSum.toLocaleString('en-IN')}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/60 mt-1 font-medium">Outflows recorded this calendar month</p>
          </div>

          <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border/80 w-fit block">Transaction Count</span>
            <div className="flex items-baseline gap-0.5 mt-2 text-left">
              <Coins className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-xl font-bold text-foreground/80 leading-tight">
                {expenses.length}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/60 mt-1 font-medium">Total number of expense entries</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-card rounded-2xl border border-border/80 p-4 shadow-sm">
          <div className="relative w-full max-w-md text-left">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search expenses by reason, partner phone, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all"
            />
          </div>
        </div>

        {/* Expenses List */}
        <div className="bg-card border border-border/80 rounded-2xl shadow-sm overflow-hidden text-left">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs text-muted-foreground">Loading expenses...</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-xs text-muted-foreground font-semibold">No expenses found matching the criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Desktop Table View */}
              <table className="w-full text-left border-collapse hidden sm:table">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-5">Expense Ref</th>
                    <th className="py-3 px-5">Requested By (Phone)</th>
                    <th className="py-3 px-5">Reason</th>
                    <th className="py-3 px-5">Expense Date</th>
                    <th className="py-3 px-5">Amount</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs text-foreground font-medium">
                  {filteredExpenses.map((exp) => {
                    const matchingUser = usersList.find(u => u.phone === exp.user_phone);
                    const displayRole = matchingUser?.role ? ` (${matchingUser.role})` : '';

                    return (
                      <tr key={exp.id} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3.5 px-5 font-mono text-[10px]">{exp.id.substring(0, 8)}...</td>
                        <td className="py-3.5 px-5">
                          <span className="font-bold text-foreground block">{exp.user_phone}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">{displayRole}</span>
                        </td>
                        <td className="py-3.5 px-5 max-w-xs truncate" title={exp.reason}>
                          {exp.reason}
                        </td>
                        <td className="py-3.5 px-5">
                          {new Date(exp.expense_date).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-5 font-bold text-red-750">
                          ₹{Number(exp.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-5 text-right flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(exp)}
                            className="p-1.5 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Edit Expense"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(exp)}
                            className="p-1.5 border border-red-200 bg-red-50/50 hover:bg-red-50 hover:border-red-300 text-red-600 font-bold rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Delete Expense"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Card Grid View */}
              <div className="block sm:hidden divide-y divide-border/60">
                {paginatedExpenses.map((exp) => {
                  const matchingUser = usersList.find(u => u.phone === exp.user_phone);
                  const displayRole = matchingUser?.role ? ` (${matchingUser.role})` : '';

                  return (
                    <div key={exp.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-muted-foreground">ID: {exp.id.substring(0, 8)}...</span>
                        <span className="font-bold text-red-750">₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span className="font-bold text-foreground block text-sm">{exp.user_phone}</span>
                        <span className="text-xs text-muted-foreground capitalize">{displayRole}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">{exp.reason}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                        <span className="text-muted-foreground">{new Date(exp.expense_date).toLocaleDateString()}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(exp)}
                            className="p-2 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-lg text-xs cursor-pointer inline-flex items-center justify-center"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDeleteModal(exp)}
                            className="p-2 border border-red-205 bg-red-50/50 hover:bg-red-50 text-red-650 font-bold rounded-lg text-xs cursor-pointer inline-flex items-center justify-center"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {filteredExpenses.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-border bg-muted/10 text-xs font-semibold gap-3">
                  <span className="text-muted-foreground text-center sm:text-left">
                    Showing <strong className="text-foreground">{(expensesPage - 1) * ENTRIES_PER_PAGE + 1}</strong> to <strong className="text-foreground">{Math.min(expensesPage * ENTRIES_PER_PAGE, filteredExpenses.length)}</strong> of <strong className="text-foreground">{filteredExpenses.length}</strong> entries
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpensesPage(prev => Math.max(prev - 1, 1))}
                      disabled={expensesPage === 1}
                      className="px-3 py-1.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all select-none cursor-pointer"
                    >
                      Previous
                    </button>
                    {Array.from({ length: Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE)) }, (_, i) => i + 1)
                      .filter(page => page === 1 || page === Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE)) || Math.abs(page - expensesPage) <= 1)
                      .map((page, idx, arr) => {
                        const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                        return (
                          <React.Fragment key={page}>
                            {showEllipsis && <span className="px-2 text-muted-foreground">...</span>}
                            <button
                              type="button"
                              onClick={() => setExpensesPage(page)}
                              className={`px-3 py-1.5 border rounded-lg transition-all select-none cursor-pointer ${
                                expensesPage === page
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
                      onClick={() => setExpensesPage(prev => Math.min(prev + 1, Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE))))}
                      disabled={expensesPage === Math.max(1, Math.ceil(filteredExpenses.length / ENTRIES_PER_PAGE))}
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
      </div>

      {/* RECORD / EDIT EXPENSE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left">
            <div className="bg-primary p-6 text-white flex items-center justify-between">
              <h3 className="font-bold text-md flex items-center gap-2">
                <Coins className="h-5 w-5" /> 
                {modalMode === 'add' ? 'Record Business Expense' : 'Modify Expense Record'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              {formError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-808 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Partner/Admin Select dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Allocated Partner / Owner</label>
                <div className="relative">
                  <select
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all appearance-none pr-8 cursor-pointer font-medium"
                  >
                    {usersList.length === 0 ? (
                      <option value="">No users available</option>
                    ) : (
                      usersList.map((u) => (
                        <option key={u.id} value={u.phone}>
                          {u.phone} ({u.role})
                        </option>
                      ))
                    )}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <ChevronDownIcon />
                  </div>
                </div>
              </div>

              {/* Expense Date Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Expense Date</label>
                <DatePicker
                  value={formDate}
                  onChange={(val) => setFormDate(val)}
                  placeholder="Select Date"
                  className="w-full justify-between py-2 border-border/80"
                />
              </div>

              {/* Reason Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Reason / Details</label>
                <textarea
                  placeholder="e.g. Repairs for Box 1 net, Turf lighting maintenance..."
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all font-medium placeholder:text-muted-foreground/60"
                />
              </div>

              {/* Amount Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Amount Paid (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full pl-7 pr-3 py-2 bg-muted/30 border border-border/80 rounded-xl focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-border hover:bg-muted font-bold rounded-xl text-xs text-foreground/80 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-70 text-center flex items-center justify-center"
                >
                  {submitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left">
            <div className="p-6 space-y-4">
              <div className="h-10 w-10 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-200">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-sm text-foreground">Confirm Expense Deletion</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Are you sure you want to delete this expense of <strong className="text-foreground">₹{expenseToDelete.amount}</strong> for "<span className="italic">{expenseToDelete.reason}</span>"? This action is permanent.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setExpenseToDelete(null);
                  }}
                  className="flex-1 py-2.5 border border-border hover:bg-muted font-bold rounded-xl text-xs text-foreground/80 transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer disabled:opacity-70 text-center"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Simple Helper Icon
const ChevronDownIcon = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="14" 
    height="14" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className="lucide lucide-chevron-down shrink-0 text-muted-foreground/70"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);
