import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  FileClock,
  KeyRound,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  UserRoundPlus,
  UserRoundX,
  X,
} from 'lucide-react';
import {
  createActivationRequest,
  createUser,
  deleteUser,
  getActivationRequests,
  getDemoRequests,
  getUsers,
  regenerateDemoRequestKey,
  reviewActivationRequest,
  reviewDemoRequest,
  updateUser,
} from './api';
import {
  adminLoginEmail,
  firebaseAuth,
  firebaseConfigured,
  firebaseWebConfigured,
  verifyPortalAdmin,
} from './firebase';
import { FirebaseError } from 'firebase/app';
import type { OAuthCredential, User } from 'firebase/auth';
import type {
  ActivationRequest,
  AppUser,
  AppVersion,
  CreateUserInput,
  DemoRequest,
  UpdateUserInput,
  ReviewedDemoRequest,
  UserRole,
  UserType,
} from './types';
import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

type PortalTab = 'current' | 'demo' | 'requests' | 'demo-requests';
type FlashMessage = { kind: 'success' | 'error'; text: string } | null;

const APP_VERSIONS: AppVersion[] = ['Soft', 'Silver', 'Standard'];

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusPill({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function UserEditor({
  user,
  defaultType,
  busy,
  onClose,
  onSubmit,
}: {
  user: AppUser | null;
  defaultType: UserType;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CreateUserInput | UpdateUserInput) => Promise<void>;
}) {
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user?.role || 'cashier');
  const [userType, setUserType] = useState<UserType>(user?.userType || defaultType);
  const [disabled, setDisabled] = useState(user?.disabled || false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!user && password.length < 8) {
      setError('Use a temporary password with at least 8 characters.');
      return;
    }
    try {
      if (user) {
        await onSubmit({
          username: username.trim(),
          email: email.trim(),
          displayName: displayName.trim(),
          password: password || undefined,
          role,
          userType,
          disabled,
        });
      } else {
        await onSubmit({
          username: username.trim(),
          email: email.trim(),
          displayName: displayName.trim(),
          password,
          role,
          userType,
        });
      }
    } catch (submitError) {
      setError(messageFrom(submitError));
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <form className="modal-card" onSubmit={(event) => void submit(event)}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{user ? 'ACCOUNT DETAILS' : 'NEW ACCOUNT'}</p>
            <h2>{user ? 'Edit app user' : 'Create app user'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus />
          </label>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label className="form-span">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Account type
            <select value={userType} onChange={(event) => setUserType(event.target.value as UserType)}>
              <option value="current">Current user</option>
              <option value="demo">Demo user</option>
            </select>
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="cashier">Cashier</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="form-span">
            {user ? 'New password (leave blank to keep current)' : 'Temporary password'}
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!user}
              minLength={8}
            />
          </label>
          {user && (
            <label className="checkbox-field form-span">
              <input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} />
              <span>Disable sign-in for this user</span>
            </label>
          )}
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {user ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ActivationRequestEditor({
  users,
  busy,
  onClose,
  onSubmit,
}: {
  users: AppUser[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { userId: string; appVersion: AppVersion; note: string }) => Promise<void>;
}) {
  const [userId, setUserId] = useState(users[0]?.uid || '');
  const [appVersion, setAppVersion] = useState<AppVersion>('Standard');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await onSubmit({ userId, appVersion, note: note.trim() });
    } catch (submitError) {
      setError(messageFrom(submitError));
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <form className="modal-card modal-card-narrow" onSubmit={(event) => void submit(event)}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">ACTIVATION</p>
            <h2>New activation request</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="form-grid one-column">
          <label>
            User
            <select value={userId} onChange={(event) => setUserId(event.target.value)} required>
              {users.map((user) => (
                <option key={user.uid} value={user.uid}>
                  {user.displayName} · {user.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            Requested version
            <select value={appVersion} onChange={(event) => setAppVersion(event.target.value as AppVersion)}>
              {APP_VERSIONS.map((version) => <option key={version}>{version}</option>)}
            </select>
          </label>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={500} />
          </label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || !userId}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <FileClock size={16} />}
            Submit request
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPortal() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [adminUsername, setAdminUsername] = useState('aptadmin');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginError, setLoginError] = useState('');
  const pendingGoogleCredential = useRef<OAuthCredential | null>(null);
  const [tab, setTab] = useState<PortalTab>('current');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<ActivationRequest[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [issuedDemoKeys, setIssuedDemoKeys] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [flash, setFlash] = useState<FlashMessage>(null);
  const [search, setSearch] = useState('');
  const [userEditor, setUserEditor] = useState<{ user: AppUser | null; type: UserType } | null>(null);
  const [requestEditorOpen, setRequestEditorOpen] = useState(false);

  const loadData = useCallback(async (user: User) => {
    setLoadingData(true);
    setPageError('');
    try {
      const [loadedUsers, loadedRequests, loadedDemoRequests] = await Promise.all([
        getUsers(user),
        getActivationRequests(user),
        getDemoRequests(user),
      ]);
      setUsers(loadedUsers);
      setRequests(loadedRequests);
      setDemoRequests(loadedDemoRequests);
    } catch (error) {
      setPageError(messageFrom(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const auth = firebaseAuth;
    if (!auth) return;
    void getRedirectResult(auth).catch((error: unknown) => {
      const pendingCredential =
        error instanceof FirebaseError ? GoogleAuthProvider.credentialFromError(error) : null;
      if (
        error instanceof FirebaseError
        && error.code === 'auth/account-exists-with-different-credential'
        && pendingCredential
      ) {
        pendingGoogleCredential.current = pendingCredential;
        setLoginError('This account already uses password sign-in. Enter its password and choose “Sign in securely” once to link Google.');
      } else {
        setLoginError(messageFrom(error));
      }
    });
  }, []);

  useEffect(() => {
    const auth = firebaseAuth;
    if (!auth) {
      setAuthChecking(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      if (pendingGoogleCredential.current) {
        setAuthChecking(false);
        return;
      }
      if (!user) {
        setAuthUser(null);
        setAuthChecking(false);
        return;
      }
      setAuthChecking(true);
      void Promise.resolve()
        .then(() => {
          if (user.email?.toLowerCase() !== adminLoginEmail?.toLowerCase()) {
            throw new Error(`Use the Google account configured for ${adminLoginEmail}.`);
          }
          return verifyPortalAdmin(user);
        })
        .then(async (session) => {
          setAdminUsername(session.username);
          setAuthUser(user);
          await loadData(user);
        })
        .catch(async (error: unknown) => {
          setLoginError(messageFrom(error));
          await signOut(auth);
          setAuthUser(null);
        })
        .finally(() => setAuthChecking(false));
    });
  }, [loadData]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError('');
    if (adminUsername.trim().toLowerCase() !== 'aptadmin') {
      setLoginError('Only the app admin account can sign in here.');
      return;
    }
    if (!firebaseAuth || !adminLoginEmail) {
      setLoginError('Firebase admin login is not configured.');
      return;
    }
    setLoginBusy(true);
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, adminLoginEmail, password);
      if (pendingGoogleCredential.current) {
        await linkWithCredential(credential.user, pendingGoogleCredential.current);
        pendingGoogleCredential.current = null;
      }
      const session = await verifyPortalAdmin(credential.user);
      setAdminUsername(session.username);
      setPassword('');
      setAuthUser(credential.user);
      await loadData(credential.user);
    } catch (error) {
      if (firebaseAuth.currentUser) await signOut(firebaseAuth);
      setLoginError(messageFrom(error));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    if (!firebaseAuth || !adminLoginEmail) {
      setLoginError('Firebase admin login is not configured.');
      return;
    }

    setLoginBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(firebaseAuth, provider);
    } catch (error) {
      setLoginError(messageFrom(error));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    if (firebaseAuth) await signOut(firebaseAuth);
    setAuthUser(null);
    setUsers([]);
    setRequests([]);
    setDemoRequests([]);
    setIssuedDemoKeys({});
    setTab('current');
  };

  const notify = (kind: 'success' | 'error', text: string) => {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 3600);
  };

  const handleSaveUser = async (input: CreateUserInput | UpdateUserInput) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      if (userEditor?.user && 'disabled' in input) {
        await updateUser(authUser, userEditor.user.uid, input);
        notify('success', 'User details saved.');
      } else if (!userEditor?.user && !('disabled' in input)) {
        await createUser(authUser, input);
        notify('success', 'User account created.');
      } else {
        throw new Error('The user form is in an invalid state. Close it and try again.');
      }
      setUserEditor(null);
      await loadData(authUser);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (!authUser || !window.confirm(`Permanently delete ${user.username} and their Firebase sign-in?`)) {
      return;
    }
    setActionBusy(true);
    try {
      await deleteUser(authUser, user.uid);
      await loadData(authUser);
      notify('success', 'User deleted.');
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleToggleUser = async (user: AppUser) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      await updateUser(authUser, user.uid, {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        userType: user.userType,
        disabled: !user.disabled,
      });
      await loadData(authUser);
      notify('success', user.disabled ? 'User access restored.' : 'User access disabled.');
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCreateRequest = async (input: {
    userId: string;
    appVersion: AppVersion;
    note: string;
  }) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      await createActivationRequest(authUser, input);
      setRequestEditorOpen(false);
      await loadData(authUser);
      notify('success', 'Activation request submitted.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReviewRequest = async (request: ActivationRequest, status: 'approved' | 'rejected') => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      await reviewActivationRequest(authUser, request.id, status);
      await loadData(authUser);
      notify('success', status === 'approved' ? 'Activation request approved.' : 'Activation request rejected.');
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReviewDemoRequest = async (request: DemoRequest, status: 'approved' | 'rejected') => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const result: ReviewedDemoRequest = await reviewDemoRequest(authUser, request.id, status);
      const demoKey = result.demoKey;
      if (demoKey) {
        setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: demoKey }));
      }
      await loadData(authUser);
      notify(
        'success',
        status === 'approved'
          ? 'Demo request approved. Copy the generated key and share it with the requester.'
          : 'Demo request rejected.'
      );
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyDemoKey = async (demoKey: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(demoKey);
      notify('success', 'Demo key copied.');
    } catch (error) {
      notify('error', messageFrom(error));
    }
  };

  const handleRegenerateDemoKey = async (request: DemoRequest) => {
    if (!authUser || !window.confirm('Generate a replacement key? Any previously shared key for this request will stop working.')) {
      return;
    }
    setActionBusy(true);
    try {
      const { demoKey } = await regenerateDemoRequestKey(authUser, request.id);
      setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: demoKey }));
      notify('success', 'Replacement demo key generated. Copy and share it with the requester.');
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const currentUsers = useMemo(
    () => users.filter((user) => user.userType === 'current'),
    [users]
  );
  const demoUsers = useMemo(
    () => users.filter((user) => user.userType === 'demo'),
    [users]
  );
  const visibleUsers = (tab === 'current' ? currentUsers : demoUsers).filter((user) => {
    const query = search.trim().toLowerCase();
    return !query || [user.username, user.displayName, user.email].some((value) =>
      value.toLowerCase().includes(query)
    );
  });
  const pendingRequests = requests.filter((request) => request.status === 'pending').length;
  const pendingDemoRequests = demoRequests.filter((request) => request.status === 'pending').length;

  if (!firebaseConfigured) {
    return (
      <div className="setup-screen">
        <div className="setup-card">
          <div className="brand-mark"><ShieldCheck size={25} /></div>
          <p className="eyebrow">APTPos ADMIN PORTAL</p>
          <h1>{firebaseWebConfigured ? 'Finish portal setup' : 'Firebase settings are missing'}</h1>
          <p className="muted-copy">
            {firebaseWebConfigured
              ? <>Set <code>VITE_ADMIN_LOGIN_EMAIL</code> as a GitHub Actions repository variable, then redeploy.</>
              : <>Add the required Firebase web settings and <code>VITE_ADMIN_LOGIN_EMAIL</code> as GitHub Actions
                repository variables, then rerun the Pages workflow.</>}
          </p>
          <div className="setup-checklist">
            <span><Check size={15} /> Set <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>, and <code>VITE_FIREBASE_APP_ID</code></span>
            <span><Check size={15} /> Set <code>VITE_ADMIN_LOGIN_EMAIL</code> to the Firebase Auth email for aptadmin</span>
            <span><Check size={15} /> Enable Firebase Authentication: Email/Password</span>
            <span><Check size={15} /> Firestore: create <code>portalAdmins/{'{uid}'}</code> with <code>active: true</code></span>
            <span><Check size={15} /> Set <code>VITE_API_BASE_URL</code> to the hosted Node API for portal data and management; keep service-account credentials on that server</span>
          </div>
          <a className="button button-primary setup-link" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
            Open Firebase Console <ArrowUpRight size={16} />
          </a>
        </div>
      </div>
    );
  }

  if (authChecking) {
    return <div className="loading-screen"><LoaderCircle className="spin" size={24} /> Checking admin access…</div>;
  }

  if (!authUser) {
    return (
      <div className="login-shell">
        <div className="login-pane">
          <div className="login-card">
            <div className="brand-mark"><ShieldCheck size={23} /></div>
            <p className="eyebrow">APTPos ADMIN</p>
            <h2>Sign in</h2>
            <form onSubmit={(event) => void handleLogin(event)} className="login-form">
              <label>
                Username
                <div className="input-with-icon">
                  <UserRound size={17} />
                  <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} autoComplete="username" required />
                </div>
              </label>
              <label>
                Password
                <div className="input-with-icon">
                  <KeyRound size={17} />
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                </div>
              </label>
              {loginError && <p className="inline-error" role="alert">{loginError}</p>}
              <button type="submit" className="button button-primary login-submit" disabled={loginBusy}>
                {loginBusy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
                {loginBusy ? 'Signing in…' : 'Sign in securely'}
              </button>
            </form>
            <div className="login-divider"><span>or</span></div>
            <button
              type="button"
              className="button button-google"
              onClick={() => void handleGoogleLogin()}
              disabled={loginBusy}
            >
              {loginBusy ? <LoaderCircle className="spin" size={17} /> : <span className="google-mark" aria-hidden="true">G</span>}
              {loginBusy ? 'Connecting…' : 'Continue with Google'}
            </button>
            <p className="login-footnote"><ShieldCheck size={14} /> Sign-in is verified by Firebase; the API is used for portal data and management.</p>
          </div>
        </div>
      </div>
    );
  }

  const activeTitle =
    tab === 'current' ? 'Current Users' : tab === 'demo' ? 'Demo Users' : 'Activation Requests';
  const resolvedTitle = tab === 'demo-requests' ? 'Demo Requests' : activeTitle;
  const navItems: Array<{ id: PortalTab; label: string; icon: typeof Users; badge?: number }> = [
    { id: 'current', label: 'Current Users', icon: Users },
    { id: 'demo', label: 'Demo Users', icon: UserRoundPlus },
    { id: 'requests', label: 'Activation Requests', icon: FileClock, badge: pendingRequests },
    { id: 'demo-requests', label: 'Demo Requests', icon: KeyRound, badge: pendingDemoRequests },
  ];

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div><strong>aptPOS</strong><span>Admin Portal</span></div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="Admin sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item${tab === item.id ? ' nav-item-active' : ''}`} onClick={() => { setTab(item.id); setSearch(''); }}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-note"><ShieldCheck size={16} /><span>Firebase secured<br /><small>Admin access only</small></span></div>
          <button className="logout-button" onClick={() => void handleLogout()}><LogOut size={17} /> Sign out</button>
          <span className="sidebar-version">APTPos User Manager</span>
        </div>
      </aside>

      <main className="portal-main">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{resolvedTitle}</strong></div>
          <div className="admin-chip">
            <span className="admin-avatar">{adminUsername.slice(0, 1).toUpperCase()}</span>
            <span><strong>{adminUsername}</strong><small>Application admin</small></span>
            <button className="button button-quiet top-logout" onClick={() => void handleLogout()}>
              <LogOut size={15} /> Log out
            </button>
          </div>
        </header>

        <section className="page-content">
          <div className="page-title-row">
            <div>
              <p className="eyebrow">USER MANAGEMENT</p>
              <h1>{resolvedTitle}</h1>
              <p className="muted-copy">
                {tab === 'current'
                  ? 'Manage active app accounts and their access.'
                  : tab === 'demo'
                    ? 'Manage demo accounts separately from current users.'
                    : tab === 'demo-requests'
                      ? 'Review two-day demo activation and extension requests from aptPOS.'
                    : 'Review and process app version activation requests.'}
              </p>
            </div>
            {tab === 'requests' ? (
              <button className="button button-primary" onClick={() => setRequestEditorOpen(true)} disabled={!users.length}>
                <Plus size={17} /> New request
              </button>
            ) : tab === 'current' || tab === 'demo' ? (
              <button className="button button-primary" onClick={() => setUserEditor({ user: null, type: tab })}>
                <Plus size={17} /> Add {tab === 'demo' ? 'demo user' : 'user'}
              </button>
            ) : null}
          </div>

          <div className="stats-grid">
            <div className="stat-card"><span className="stat-icon stat-blue"><Users size={18} /></span><span className="stat-label">Current users</span><strong>{currentUsers.length}</strong><small>Firebase accounts</small></div>
            <div className="stat-card"><span className="stat-icon stat-violet"><UserRoundPlus size={18} /></span><span className="stat-label">Demo users</span><strong>{demoUsers.length}</strong><small>Trial access accounts</small></div>
            <div className="stat-card"><span className="stat-icon stat-amber"><Clock3 size={18} /></span><span className="stat-label">Pending requests</span><strong>{pendingRequests}</strong><small>Awaiting a decision</small></div>
            <div className="stat-card"><span className="stat-icon stat-green"><Activity size={18} /></span><span className="stat-label">Enabled accounts</span><strong>{users.filter((user) => !user.disabled).length}</strong><small>Sign-in enabled</small></div>
          </div>

          {flash && <div className={`flash-message flash-${flash.kind}`} role="status">{flash.kind === 'success' ? <Check size={16} /> : <CircleAlert size={16} />}{flash.text}</div>}
          {pageError && <div className="flash-message flash-error" role="alert"><CircleAlert size={16} />{pageError}</div>}

          {tab === 'current' || tab === 'demo' ? (
            <section className="table-card">
              <div className="table-toolbar">
                <div><h2>{tab === 'demo' ? 'Demo account directory' : 'User directory'}</h2><p>{visibleUsers.length} {visibleUsers.length === 1 ? 'account' : 'accounts'}</p></div>
                <label className="search-box"><Search size={16} /><input placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              </div>
              {loadingData ? (
                <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading users…</div>
              ) : visibleUsers.length === 0 ? (
                <div className="empty-state"><UserRoundX size={25} /><strong>No {tab === 'demo' ? 'demo' : 'current'} users found</strong><span>Add an account to see it here.</span></div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>USER</th><th>ROLE</th><th>TYPE</th><th>STATUS</th><th>CREATED</th><th className="actions-heading">ACTIONS</th></tr></thead>
                    <tbody>
                      {visibleUsers.map((user) => (
                        <tr key={user.uid}>
                          <td data-label="User"><div className="user-cell"><span className="user-avatar">{user.displayName.slice(0, 1).toUpperCase() || 'U'}</span><span><strong>{user.displayName}</strong><small>@{user.username} · {user.email}</small></span></div></td>
                          <td data-label="Role"><span className="role-label">{user.role}</span></td>
                          <td data-label="Type"><StatusPill tone={user.userType === 'demo' ? 'blue' : 'neutral'}>{user.userType}</StatusPill></td>
                          <td data-label="Status"><StatusPill tone={user.disabled ? 'red' : 'green'}>{user.disabled ? 'Disabled' : 'Active'}</StatusPill></td>
                          <td data-label="Created" className="date-cell">{formatDate(user.createdAt)}</td>
                          <td data-label="Actions">
                            <div className="row-actions">
                              <button className="icon-button" title="Edit user" aria-label={`Edit ${user.username}`} onClick={() => setUserEditor({ user, type: user.userType })} disabled={actionBusy}><Pencil size={16} /></button>
                              <button className="icon-button" title={user.disabled ? 'Enable sign-in' : 'Disable sign-in'} aria-label={`${user.disabled ? 'Enable' : 'Disable'} ${user.username}`} onClick={() => void handleToggleUser(user)} disabled={actionBusy}>{user.disabled ? <BadgeCheck size={16} /> : <UserRoundX size={16} />}</button>
                              <button className="icon-button icon-danger" title="Delete user" aria-label={`Delete ${user.username}`} onClick={() => void handleDeleteUser(user)} disabled={actionBusy}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : tab === 'demo-requests' ? (
            <section className="table-card">
              <div className="table-toolbar">
                <div><h2>Demo activation queue</h2><p>{demoRequests.length} total requests</p></div>
                <div className="request-toolbar-note"><Clock3 size={15} /> Each approved key starts a two-day demo when redeemed.</div>
              </div>
              {loadingData ? (
                <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading requests…</div>
              ) : demoRequests.length === 0 ? (
                <div className="empty-state"><KeyRound size={25} /><strong>No demo requests yet</strong><span>Requests from aptPOS will appear here.</span></div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>TYPE</th><th>REQUESTED BY</th><th>SYSTEM CODE</th><th>REQUESTED</th><th>STATUS</th><th>DEMO ACCESS</th><th className="actions-heading">ACTIONS</th></tr></thead>
                    <tbody>
                      {demoRequests.map((request) => (
                        <tr key={request.id}>
                          <td data-label="Type"><StatusPill tone={request.requestType === 'extension' ? 'neutral' : 'blue'}>{request.requestType === 'extension' ? 'Demo extension' : 'Demo activation'}</StatusPill></td>
                          <td data-label="Requested by">{request.requestedBy}</td>
                          <td data-label="System code" className="date-cell"><code>{request.systemCode}</code></td>
                          <td data-label="Requested" className="date-cell">{formatDate(request.requestedAt)}</td>
                          <td data-label="Status"><StatusPill tone={request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}>{request.status}</StatusPill></td>
                          <td data-label="Demo access" className="date-cell">
                            {request.expiresAt
                              ? `${request.keyUsed ? 'Redeemed' : 'Key not used'} · ${formatDate(request.expiresAt)}`
                              : '—'}
                          </td>
                          <td data-label="Actions">
                            {request.status === 'pending' ? (
                              <div className="row-actions">
                                <button className="button button-approve" onClick={() => void handleReviewDemoRequest(request, 'approved')} disabled={actionBusy}><Check size={15} /> Approve & generate key</button>
                                <button className="icon-button icon-danger" title="Reject demo request" aria-label="Reject demo request" onClick={() => void handleReviewDemoRequest(request, 'rejected')} disabled={actionBusy}><X size={16} /></button>
                              </div>
                            ) : issuedDemoKeys[request.id] ? (
                              <div className="row-actions">
                                <input className="w-64 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs" readOnly value={issuedDemoKeys[request.id]} aria-label="Generated demo key" />
                                <button className="button button-quiet" onClick={() => void handleCopyDemoKey(issuedDemoKeys[request.id])}><Check size={15} /> Copy key</button>
                              </div>
                            ) : request.status === 'approved' && !request.keyUsed ? (
                              <button className="button button-quiet" onClick={() => void handleRegenerateDemoKey(request)} disabled={actionBusy}>
                                <KeyRound size={15} /> Generate replacement key
                              </button>
                            ) : request.reviewedAt ? (
                              <span className="reviewed-note">Reviewed {formatDate(request.reviewedAt)}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="table-card">
              <div className="table-toolbar">
                <div><h2>Activation request queue</h2><p>{requests.length} total requests</p></div>
                <div className="request-toolbar-note"><Clock3 size={15} /> Approve a request to assign its requested app version.</div>
              </div>
              {loadingData ? (
                <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading requests…</div>
              ) : requests.length === 0 ? (
                <div className="empty-state"><FileClock size={25} /><strong>No activation requests yet</strong><span>Submit a request for a user to begin the review workflow.</span></div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>USER</th><th>REQUESTED VERSION</th><th>REQUESTED</th><th>STATUS</th><th>NOTE</th><th className="actions-heading">ACTIONS</th></tr></thead>
                    <tbody>
                      {requests.map((request) => (
                        <tr key={request.id}>
                          <td data-label="User"><div className="user-cell"><span className="user-avatar avatar-request"><FileClock size={16} /></span><span><strong>{request.username}</strong><small>{request.email}</small></span></div></td>
                          <td data-label="Requested version"><strong className="version-name">{request.appVersion}</strong></td>
                          <td data-label="Requested" className="date-cell">{formatDate(request.requestedAt)}</td>
                          <td data-label="Status"><StatusPill tone={request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}>{request.status}</StatusPill></td>
                          <td data-label="Note" className="note-cell">{request.note || '—'}</td>
                          <td data-label="Actions">
                            {request.status === 'pending' ? (
                              <div className="row-actions">
                                <button className="button button-approve" onClick={() => void handleReviewRequest(request, 'approved')} disabled={actionBusy}><Check size={15} /> Approve</button>
                                <button className="icon-button icon-danger" title="Reject request" aria-label="Reject request" onClick={() => void handleReviewRequest(request, 'rejected')} disabled={actionBusy}><X size={16} /></button>
                              </div>
                            ) : <span className="reviewed-note">Reviewed {formatDate(request.reviewedAt)}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <footer className="page-footer"><span>Independent admin portal</span><span>Firebase Authentication · Cloud Firestore</span></footer>
        </section>
      </main>

      {userEditor && (
        <UserEditor
          user={userEditor.user}
          defaultType={userEditor.type}
          busy={actionBusy}
          onClose={() => setUserEditor(null)}
          onSubmit={handleSaveUser}
        />
      )}
      {requestEditorOpen && (
        <ActivationRequestEditor
          users={users}
          busy={actionBusy}
          onClose={() => setRequestEditorOpen(false)}
          onSubmit={handleCreateRequest}
        />
      )}
    </div>
  );
}
