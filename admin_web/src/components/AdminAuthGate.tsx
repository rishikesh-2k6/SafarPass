import { useState, useEffect, type FC, type FormEvent, type ReactNode } from 'react';
import {
  fetchAuthSession,
  getCurrentUser,
  signIn,
  confirmSignIn,
  signOut,
} from 'aws-amplify/auth';
import {
  ShieldCheck,
  Lock,
  Mail,
  LogOut,
  AlertTriangle,
  Bus as BusIcon,
  KeyRound,
} from 'lucide-react';

interface AdminSessionInfo {
  email: string;
  signOut: () => Promise<void>;
}

interface AdminAuthGateProps {
  children: (session: AdminSessionInfo) => ReactNode;
}

export const AdminAuthGate: FC<AdminAuthGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'unauthenticated' | 'unauthorized' | 'authenticated'>('checking');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSetupHint, setShowSetupHint] = useState(false);

  const verifyAdminSession = async () => {
    const user = await getCurrentUser();
    const session = await fetchAuthSession({ forceRefresh: false });
    const rawGroups = session.tokens?.accessToken?.payload?.['cognito:groups'];
    const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : [];

    const displayEmail =
      (session.tokens?.idToken?.payload?.email as string | undefined) ??
      user.signInDetails?.loginId ??
      user.username;

    setAdminEmail(displayEmail);

    if (groups.includes('ADMINS')) {
      setStatus('authenticated');
    } else {
      setStatus('unauthorized');
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        const session = await fetchAuthSession({ forceRefresh: false });
        if (!active) return;

        const rawGroups = session.tokens?.accessToken?.payload?.['cognito:groups'];
        const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : [];
        const displayEmail =
          (session.tokens?.idToken?.payload?.email as string | undefined) ??
          user.signInDetails?.loginId ??
          user.username;

        setAdminEmail(displayEmail);
        setStatus(groups.includes('ADMINS') ? 'authenticated' : 'unauthorized');
      } catch {
        if (active) setStatus('unauthenticated');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (needsNewPassword) {
        const res = await confirmSignIn({ challengeResponse: newPassword });
        if (res.isSignedIn) {
          setNeedsNewPassword(false);
          setNewPassword('');
          await verifyAdminSession();
        } else {
          setErrorMsg(`Additional challenge required: ${res.nextStep.signInStep}`);
        }
        return;
      }

      const res = await signIn({
        username: email.trim(),
        password,
      });

      if (res.isSignedIn) {
        await verifyAdminSession();
      } else if (res.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setNeedsNewPassword(true);
        setErrorMsg('First-time login: please set a permanent password.');
      } else {
        setErrorMsg(`Sign-in incomplete: ${res.nextStep.signInStep}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setAdminEmail('');
    setPassword('');
    setNewPassword('');
    setNeedsNewPassword(false);
    setStatus('unauthenticated');
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <ShieldCheck size={36} className="text-emerald-400 animate-pulse" />
          <span className="text-sm font-medium">Verifying Cognito Admin Session...</span>
        </div>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0f172a] border border-red-500/40 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Admin Role Required</h2>
              <p className="text-xs text-slate-400">Signed in as {adminEmail}</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed mb-5">
            Your Cognito account is authenticated, but it is not a member of the{' '}
            <code className="text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded">ADMINS</code>{' '}
            security group. Add this user to the <code className="text-emerald-400">ADMINS</code>{' '}
            group in AWS Cognito Console and sign back in.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="btn-secondary w-full justify-center"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'authenticated') {
    return <>{children({ email: adminEmail, signOut: handleSignOut })}</>;
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl p-7 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="brand-icon-box">
            <BusIcon size={24} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-100">
              VahanSync Admin Gate
            </h1>
            <p className="text-xs text-slate-400">
              Protected by AWS Cognito (ADMINS Group)
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSignIn} className="flex flex-col gap-4">
          {!needsNewPassword ? (
            <>
              <div className="form-group">
                <label className="flex items-center gap-1.5">
                  <Mail size={13} />
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@campus.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="flex items-center gap-1.5">
                  <Lock size={13} />
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="flex items-center gap-1.5">
                <KeyRound size={13} />
                Set New Permanent Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Min 8 chars, upper, lower, number, symbol"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary justify-center py-3 mt-1"
          >
            <ShieldCheck size={17} />
            <span>
              {isSubmitting
                ? 'Authenticating...'
                : needsNewPassword
                ? 'Confirm New Password'
                : 'Sign In to Fleet Console'}
            </span>
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-800">
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
            onClick={() => setShowSetupHint((prev) => !prev)}
          >
            {showSetupHint ? 'Hide AWS Admin Setup' : 'First time? How to create an Admin user'}
          </button>
          {showSetupHint && (
            <ol className="mt-2.5 text-[11px] text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>Open AWS Amplify Console &gt; Authentication &gt; User management (or AWS Cognito).</li>
              <li>Create an admin user with an email &amp; temporary password.</li>
              <li>Assign that user to the <code className="text-emerald-400">ADMINS</code> group, then sign in above.</li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};
