'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { Key, ShieldAlert, Check } from 'lucide-react';
import { supabase, hasSupabaseCredentials } from '@/lib/db/supabase';
import Link from 'next/link';
import { getErrorMessage } from '@/lib/security';

const resetSchema = zod.object({
  password: zod.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: zod.string().min(6, 'Confirm password must be at least 6 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetFormInputs = zod.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormInputs>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetFormInputs) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (hasSupabaseCredentials() && supabase) {
        const { error } = await supabase.auth.updateUser({
          password: data.password,
        });

        if (error) {
          throw new Error(error.message);
        }

        setSuccessMsg('Your password has been reset successfully! Redirecting you to login...');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        // Fallback mock update
        setSuccessMsg('Mock Mode: Password reset successfully! Redirecting...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } catch (err: any) {
      let msg = getErrorMessage(err, 'An error occurred while resetting password');
      if (msg.includes('Auth session missing') || msg.includes('session')) {
        msg = 'Session missing: To reset the password, you must click the link in the recovery email sent to you, or update it directly in the Supabase Dashboard (Authentication -> Users).';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/50 via-background to-background p-4 font-sans text-left">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border/80 overflow-hidden transition-all duration-300 hover:shadow-2xl">
        <div className="bg-primary p-8 text-center relative overflow-hidden flex flex-col items-center">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/20 rounded-full blur-xl transform translate-x-8 -translate-y-8"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/15 rounded-full blur-2xl transform -translate-x-12 translate-y-12"></div>
          
          <div className="z-10 mb-4 bg-white/10 p-2.5 rounded-2xl backdrop-blur-sm border border-white/10">
            <img 
              src="/logo.png" 
              alt="360 Club Box Logo" 
              className="h-16 w-auto object-contain max-w-[200px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          
          <h1 className="text-2xl font-bold text-white tracking-tight z-10">360 Club Box</h1>
          <p className="text-emerald-100 text-sm mt-1 z-10">Reset Your Account Password</p>
        </div>

        <div className="p-8">
          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-sm">
              <Check className="h-5 w-5 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div className="space-y-2">
                <span>{errorMsg}</span>
                {errorMsg.includes('Session missing') && (
                  <Link 
                    href="/login" 
                    className="block font-bold text-primary underline text-xs mt-1"
                  >
                    Back to Login Page
                  </Link>
                )}
              </div>
            </div>
          )}

          {!successMsg && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 block" htmlFor="password">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                    {...register('password')}
                  />
                </div>
                {errors.password && (
                  <p className="text-red-600 text-xs mt-1 pl-1">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/80 block" htmlFor="confirmPassword">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                    <Key className="h-4 w-4" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                    {...register('confirmPassword')}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-600 text-xs mt-1 pl-1">{errors.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary hover:bg-primary/95 active:bg-primary/90 text-white font-semibold rounded-xl text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-75 disabled:cursor-not-allowed hover:scale-[1.01]"
              >
                {loading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
