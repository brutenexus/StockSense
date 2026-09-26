'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Eye, EyeOff, KeyRound, ShieldCheck, Truck, Warehouse } from 'lucide-react';
import { api, errorMessage, RequestFailed } from '@/lib/api';
import { passwordStrength } from '@/lib/domain/validation';
import { Badge, Button, Card, cx, Divider, Field, Input } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Logo } from '@/components/app/logo';

type Mode = 'signin' | 'signup' | 'forgot';

const DEMO_ACCOUNTS = [
  { role: 'Inventory Manager', loginId: 'manager', password: 'Manage@123', blurb: 'Products, warehouses, users, receipts & deliveries' },
  { role: 'Warehouse Staff', loginId: 'staff01', password: 'Staff@123', blurb: 'Transfers, adjustments, picking and counts' },
];

export function LoginView({ next }: { next: string }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [signup, setSignup] = useState({ loginId: '', email: '', name: '', password: '', confirmPassword: '' });

  const [forgot, setForgot] = useState({ identifier: '', code: '', password: '', confirmPassword: '' });
  const [otpSent, setOtpSent] = useState<{ destination: string | null; otp: string | null } | null>(null);

  function reset(nextMode: Mode) {
    setMode(nextMode);
    setErrors({});
  }

  function capture(error: unknown, fallback: string) {
    if (error instanceof RequestFailed) {
      setErrors(error.fieldErrors ?? {});
      toast.error(fallback, error.message);
    } else {
      toast.error(fallback, errorMessage(error));
    }
  }

  async function submitSignin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/api/auth/login', { body: { identifier, password } });
      toast.success('Signed in', 'Loading your workspace…');
      router.replace(next);
      router.refresh();
    } catch (error) {
      capture(error, 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/api/auth/signup', { body: signup });
      toast.success('Account created', 'Welcome to StockSense.');
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      capture(error, 'Could not create the account');
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const result = await api<{ destination: string | null; otp: string | null }>('/api/auth/forgot', {
        body: { identifier: forgot.identifier },
      });
      setOtpSent(result);
      setForgot((state) => ({ ...state, code: result.otp ?? state.code }));
      toast.info('Reset code sent', result.destination ? `Sent to ${result.destination}` : 'Check your inbox for the code.');
    } catch (error) {
      capture(error, 'Could not start the reset');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api('/api/auth/reset', { body: { identifier: forgot.identifier, code: forgot.code, password: forgot.password, confirmPassword: forgot.confirmPassword } });
      toast.success('Password updated', 'Sign in with your new password.');
      setIdentifier(forgot.identifier);
      setPassword('');
      setForgot({ identifier: forgot.identifier, code: '', password: '', confirmPassword: '' });
      setOtpSent(null);
      reset('signin');
    } catch (error) {
      capture(error, 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  }

  const strength = passwordStrength(signup.password);

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* -------------------------------------------------------- brand panel */}
      <section className="relative hidden overflow-hidden bg-ink-950 px-10 py-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo size={40} className="h-10 w-10 shrink-0 rounded-lg object-contain" />
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-white">StockSense</p>
            <p className="text-[11.5px] text-ink-400">Inventory Management System</p>
          </div>
        </div>

        <div className="relative mt-16 max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.15] tracking-tight text-white">
            Every receipt, delivery and transfer — on one ledger.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-300">
            Receive stock, ship to customers, move goods between locations and reconcile counts. Balances, alerts and
            reports stay in step because they are all derived from the same immutable movement ledger.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: <Truck size={15} />, text: 'Receipts & deliveries with a draft → ready → done workflow' },
              { icon: <Warehouse size={15} />, text: 'Multi-warehouse stock with per-location balances' },
              { icon: <ShieldCheck size={15} />, text: 'Role based access for managers and warehouse staff' },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-[13px] text-ink-200">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand-300">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-auto pt-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Demo accounts</p>
          <div className="mt-3 grid gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.loginId}
                type="button"
                onClick={() => {
                  setIdentifier(account.loginId);
                  setPassword(account.password);
                  reset('signin');
                  toast.info('Credentials filled in', `Signing in as ${account.role}`);
                }}
                className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-white/10"
              >
                <span>
                  <span className="block text-[12.5px] font-semibold text-white">{account.role}</span>
                  <span className="block text-[11.5px] text-ink-400">{account.blurb}</span>
                </span>
                <span className="flex items-center gap-2 text-[11.5px] text-ink-300">
                  <code className="rounded bg-ink-900/80 px-1.5 py-0.5 font-mono text-[11px]">{account.loginId}</code>
                  <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- form panel */}
      <section className="flex items-center justify-center bg-ink-50 px-5 py-10 dark:bg-ink-950">
        <div className="w-full max-w-[26rem]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Logo size={36} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
            <p className="text-[15px] font-semibold tracking-tight text-ink-900 dark:text-white">StockSense</p>
          </div>

          <Card className="p-6">
            {mode !== 'forgot' ? (
              <div className="mb-5 flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
                {(['signin', 'signup'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => reset(value)}
                    className={cx(
                      'focus-ring h-8 flex-1 rounded-lg text-[12.5px] font-medium transition-colors',
                      mode === value
                        ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white'
                        : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100',
                    )}
                  >
                    {value === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                  <KeyRound size={15} />
                </span>
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white">Reset your password</p>
                  <p className="text-[11.5px] text-ink-500 dark:text-ink-400">We email a 6-digit code to your registered address</p>
                </div>
              </div>
            )}

            {mode === 'signin' ? (
              <form className="space-y-4" onSubmit={submitSignin}>
                <Field label="Login Id or Email" error={errors.identifier} required htmlFor="identifier">
                  <Input
                    id="identifier"
                    autoFocus
                    autoComplete="username"
                    placeholder="manager"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                  />
                </Field>
                <Field label="Password" error={errors.password} required htmlFor="password">
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="focus-ring absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] text-ink-400">Sessions last 72 hours</span>
                  <button
                    type="button"
                    onClick={() => reset('forgot')}
                    className="focus-ring rounded text-[12px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Forgot password?
                  </button>
                </div>
                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  Sign in
                </Button>
              </form>
            ) : null}

            {mode === 'signup' ? (
              <form className="space-y-4" onSubmit={submitSignup}>
                <Field label="Full name" error={errors.name} required htmlFor="name">
                  <Input id="name" placeholder="Neha Kulkarni" value={signup.name} onChange={(event) => setSignup({ ...signup, name: event.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Login Id" error={errors.loginId} hint="6–12 characters" required htmlFor="loginId">
                    <Input id="loginId" placeholder="neha.k" value={signup.loginId} onChange={(event) => setSignup({ ...signup, loginId: event.target.value })} />
                  </Field>
                  <Field label="Email Id" error={errors.email} required htmlFor="email">
                    <Input id="email" type="email" placeholder="neha@stocksense.io" value={signup.email} onChange={(event) => setSignup({ ...signup, email: event.target.value })} />
                  </Field>
                </div>
                <Field label="Password" error={errors.password} required htmlFor="new-password">
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 9 characters"
                    value={signup.password}
                    onChange={(event) => setSignup({ ...signup, password: event.target.value })}
                  />
                </Field>
                {signup.password ? <StrengthMeter strength={strength} /> : null}
                <Field label="Re-enter password" error={errors.confirmPassword} required htmlFor="confirm">
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat the password"
                    value={signup.confirmPassword}
                    onChange={(event) => setSignup({ ...signup, confirmPassword: event.target.value })}
                  />
                </Field>
                <ul className="grid gap-1.5 text-[11.5px] text-ink-500 dark:text-ink-400">
                  {Object.entries(strength.checks).map(([rule, passed]) => (
                    <li key={rule} className="flex items-center gap-1.5">
                      <span className={cx('flex h-4 w-4 items-center justify-center rounded-full', passed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>
                        <Check size={11} />
                      </span>
                      {rule === 'length' ? 'More than 8 characters' : `Contains a ${rule} letter${rule === 'special' ? ' or symbol' : ''}`}
                    </li>
                  ))}
                </ul>
                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  Create account
                </Button>
                <p className="text-center text-[11.5px] text-ink-400">
                  New accounts start with the Warehouse Staff role. A manager can promote you later.
                </p>
              </form>
            ) : null}

            {mode === 'forgot' ? (
              <form className="space-y-4" onSubmit={otpSent ? submitReset : requestOtp}>
                <Field label="Login Id or Email" error={errors.identifier} required htmlFor="forgot-identifier">
                  <Input
                    id="forgot-identifier"
                    autoFocus
                    placeholder="manager"
                    disabled={Boolean(otpSent)}
                    value={forgot.identifier}
                    onChange={(event) => setForgot({ ...forgot, identifier: event.target.value })}
                  />
                </Field>

                {otpSent ? (
                  <>
                    {otpSent.otp ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-3 py-2.5 dark:border-brand-500/40 dark:bg-brand-500/10">
                        <span className="text-[12px] text-brand-700 dark:text-brand-300">Demo mode — your code</span>
                        <code className="tnum rounded-md bg-white px-2 py-1 font-mono text-[13px] font-semibold tracking-[0.2em] text-brand-700 dark:bg-ink-900 dark:text-brand-300">
                          {otpSent.otp}
                        </code>
                      </div>
                    ) : (
                      <p className="rounded-xl bg-ink-100 px-3 py-2.5 text-[12px] text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                        If {forgot.identifier} matches an account, a 6-digit code is on its way.
                      </p>
                    )}
                    <Field label="OTP" error={errors.code} required htmlFor="otp">
                      <Input
                        id="otp"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        className="tnum tracking-[0.4em]"
                        value={forgot.code}
                        onChange={(event) => setForgot({ ...forgot, code: event.target.value })}
                      />
                    </Field>
                    <Field label="New password" error={errors.password} required htmlFor="reset-password">
                      <Input
                        id="reset-password"
                        type="password"
                        value={forgot.password}
                        onChange={(event) => setForgot({ ...forgot, password: event.target.value })}
                      />
                    </Field>
                    <Field label="Re-enter password" error={errors.confirmPassword} required htmlFor="reset-confirm">
                      <Input
                        id="reset-confirm"
                        type="password"
                        value={forgot.confirmPassword}
                        onChange={(event) => setForgot({ ...forgot, confirmPassword: event.target.value })}
                      />
                    </Field>
                  </>
                ) : null}

                <Button type="submit" size="lg" className="w-full" loading={busy}>
                  {otpSent ? 'Update password' : 'Send reset code'}
                </Button>
                <Divider label="or" />
                <Button type="button" variant="ghost" className="w-full" onClick={() => reset('signin')}>
                  Back to sign in
                </Button>
                {otpSent ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(null);
                      setErrors({});
                    }}
                    className="focus-ring mx-auto block rounded text-[12px] font-medium text-brand-600 dark:text-brand-400"
                  >
                    Use a different account
                  </button>
                ) : null}
              </form>
            ) : null}
          </Card>

          <p className="mt-5 text-center text-[11.5px] text-ink-400">
            StockSense keeps an audit trail of every sign-in, document and stock movement.
          </p>
        </div>
      </section>
    </div>
  );
}

function StrengthMeter({ strength }: { strength: ReturnType<typeof passwordStrength> }) {
  const tones = ['bg-rose-500', 'bg-rose-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'];
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cx('h-1.5 flex-1 rounded-full', index < strength.score ? tones[strength.score] : 'bg-ink-200 dark:bg-ink-700')}
          />
        ))}
      </div>
      <Badge tone={strength.score >= 4 ? 'success' : strength.score >= 2 ? 'warning' : 'danger'}>{strength.label}</Badge>
    </div>
  );
}
