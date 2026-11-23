import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  KeyRound,
  LoaderCircle,
  LogOut,
  Pencil,
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
  deactivateDemoRequest,
  deleteDemoSystemData,
  deleteUser,
  extendDemoRequest,
  convertDemoSystemToRegistered,
  getDemoRequests,
  getDemoSystemActivity,
  getRegisteredSystems,
  getUsers,
  regenerateDemoRequestKey,
  reviewDemoRequest,
  updateUser,
  updateDemoRequestExpiry,
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
  AppUser,
  AppVersion,
  DemoRequest,
  DemoSystemActivity,
  UpdateUserInput,
  ReviewedDemoRequest,
  RegisteredSystem,
  UserRole,
  UserType,
} from './types';
import { APP_VERSIONS } from './types';
import {
  GoogleAuthProvider,
  getRedirectResult,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

type PortalTab = 'current' | 'demo' | 'demo-requests';
type FlashMessage = { kind: 'success' | 'error'; text: string } | null;

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

function dateTimeLocalValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = Math.max(0, bytes);
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function StatusPill({ children, tone = 'neutral' }: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function UserEditor({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: AppUser;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: UpdateUserInput) => Promise<void>;
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user.role);
  const [userType, setUserType] = useState<UserType>(user.userType);
  const [disabled, setDisabled] = useState(user.disabled);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await onSubmit({
        username: username.trim(),
        email: email.trim(),
        displayName: displayName.trim(),
        password: password || undefined,
        role,
        userType,
        disabled,
      });
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
            <p className="eyebrow">ACCOUNT DETAILS</p>
            <h2>Edit app user</h2>
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
            New password (leave blank to keep current)
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
            />
          </label>
          <label className="checkbox-field form-span">
            <input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} />
            <span>Disable sign-in for this user</span>
          </label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function RegistrationConversionEditor({
  systemCode,
  busy,
  onClose,
  onSubmit,
}: {
  systemCode: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    appVersion: AppVersion;
    username: string;
    password: string;
  }) => Promise<void>;
}) {
  const [appVersion, setAppVersion] = useState<AppVersion>('Standard');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await onSubmit({ appVersion, username: username.trim(), password });
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
            <p className="eyebrow">REGISTER SYSTEM</p>
            <h2>Convert demo to registered</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <p className="muted-copy">
          Choose a version and create the owner login for system <code>{systemCode}</code>.
          The registration key will be shown once after conversion.
        </p>
        <div className="form-grid one-column">
          <label>
            Registered version
            <select value={appVersion} onChange={(event) => setAppVersion(event.target.value as AppVersion)}>
              {APP_VERSIONS.map((version) => <option key={version}>{version}</option>)}
            </select>
          </label>
          <label>
            POS username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={32}
              required
            />
          </label>
          <label>
            POS password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
            {busy ? 'Converting…' : 'Convert and create key'}
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
  const [registeredSystems, setRegisteredSystems] = useState<RegisteredSystem[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [demoSystemActivity, setDemoSystemActivity] = useState<DemoSystemActivity | null>(null);
  const [loadingDemoActivity, setLoadingDemoActivity] = useState(false);
  const [demoActivityError, setDemoActivityError] = useState('');
  const [issuedDemoKeys, setIssuedDemoKeys] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [flash, setFlash] = useState<FlashMessage>(null);
  const [search, setSearch] = useState('');
  const [demoSearch, setDemoSearch] = useState('');
  const [demoStatusFilter, setDemoStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedDemoRequestId, setSelectedDemoRequestId] = useState<string | null>(null);
  const [conversionRequest, setConversionRequest] = useState<DemoRequest | null>(null);
  const [registrationKeyResult, setRegistrationKeyResult] = useState<{
    systemCode: string;
    username: string;
    appVersion: AppVersion;
    registrationKey: string;
  } | null>(null);
  const [expiryEditorRequest, setExpiryEditorRequest] = useState<DemoRequest | null>(null);
  const [expiryInput, setExpiryInput] = useState('');
  const [deleteDemoDataRequest, setDeleteDemoDataRequest] = useState<DemoRequest | null>(null);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const [regenerateKeyRequest, setRegenerateKeyRequest] = useState<DemoRequest | null>(null);
  const [userEditor, setUserEditor] = useState<AppUser | null>(null);

  const loadData = useCallback(async (user: User) => {
    setLoadingData(true);
    setPageError('');
    try {
      const [loadedUsers, loadedRegisteredSystems, loadedDemoRequests] = await Promise.all([
        getUsers(user),
        getRegisteredSystems(user),
        getDemoRequests(user),
      ]);
      setUsers(loadedUsers);
      setRegisteredSystems(loadedRegisteredSystems);
      setDemoRequests(loadedDemoRequests);
    } catch (error) {
      setPageError(messageFrom(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!authUser || !selectedDemoRequestId) {
      setDemoSystemActivity(null);
      setDemoActivityError('');
      setLoadingDemoActivity(false);
      return;
    }

    let active = true;
    setLoadingDemoActivity(true);
    setDemoActivityError('');
    void getDemoSystemActivity(authUser, selectedDemoRequestId)
      .then((activity) => {
        if (active) setDemoSystemActivity(activity);
      })
      .catch((error: unknown) => {
        if (active) setDemoActivityError(messageFrom(error));
      })
      .finally(() => {
        if (active) setLoadingDemoActivity(false);
      });
    return () => {
      active = false;
    };
  }, [authUser, selectedDemoRequestId]);

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
    setRegisteredSystems([]);
    setDemoRequests([]);
    setIssuedDemoKeys({});
    setTab('current');
  };

  const notify = (kind: 'success' | 'error', text: string) => {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 3600);
  };

  const handleSaveUser = async (input: UpdateUserInput) => {
    if (!authUser || !userEditor) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      await updateUser(authUser, userEditor.uid, input);
      notify('success', 'User details saved.');
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

  const handleConvertDemoSystem = async (
    request: DemoRequest,
    input: { appVersion: AppVersion; username: string; password: string }
  ) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      const result = await convertDemoSystemToRegistered(
        authUser,
        request.id,
        input
      );
      await loadData(authUser);
      setConversionRequest(null);
      setSelectedDemoRequestId(null);
      setRegistrationKeyResult(result);
      notify('success', `System ${result.systemCode} is pending registration-key activation.`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyRegistrationKey = async (registrationKey: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(registrationKey);
      notify('success', 'Registration key copied.');
    } catch (error) {
      notify('error', messageFrom(error));
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
    if (!authUser) return;
    setActionBusy(true);
    try {
      const { demoKey } = await regenerateDemoRequestKey(authUser, request.id);
      setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: demoKey }));
      setRegenerateKeyRequest(null);
      notify('success', 'Replacement demo key generated. Copy and share it with the requester.');
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeactivateDemo = async (request: DemoRequest) => {
    if (!authUser || !window.confirm(`Deactivate demo license for system code ${request.systemCode}? The user will immediately lose demo access.`)) {
      return;
    }
    setActionBusy(true);
    try {
      await deactivateDemoRequest(authUser, request.id);
      await loadData(authUser);
      notify('success', `Demo deactivated for system ${request.systemCode}.`);
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const closeDeleteDemoConfirmation = () => {
    if (deleteDemoDataRequest) setSelectedDemoRequestId(deleteDemoDataRequest.id);
    setDeleteDemoDataRequest(null);
    setDeleteConfirmationCode('');
  };

  const handleDeleteDemoData = async () => {
    if (!authUser || !deleteDemoDataRequest) return;
    setActionBusy(true);
    try {
      const result = await deleteDemoSystemData(authUser, deleteDemoDataRequest.id);
      setIssuedDemoKeys((keys) => {
        const remainingKeys = { ...keys };
        result.deletedRequestIds.forEach((requestId) => delete remainingKeys[requestId]);
        return remainingKeys;
      });
      setSelectedDemoRequestId(null);
      setDeleteDemoDataRequest(null);
      setDeleteConfirmationCode('');
      await loadData(authUser);
      notify(
        'success',
        `Deleted ${result.deletedRequests} request(s), ${result.deletedKeyClaims} key claim(s), ${result.deletedLicenses} demo license(s), ${result.deletedRegisteredSystems} registration(s), ${result.deletedLoginEvents} login record(s), and ${result.deletedTelemetryRecords} telemetry summary(s) for ${result.systemCode}. Firebase Auth accounts were preserved.`
      );
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleExtendDemo = async (request: DemoRequest, days = 2) => {
    if (!authUser) return;
    const daysInput = window.prompt(`How many days to extend the demo for system ${request.systemCode}?`, String(days));
    if (daysInput === null) return;
    const parsedDays = Number(daysInput);
    if (!Number.isFinite(parsedDays) || parsedDays < 1) {
      notify('error', 'Enter a valid number of days (at least 1).');
      return;
    }
    setActionBusy(true);
    try {
      const result = await extendDemoRequest(authUser, request.id, parsedDays);
      await loadData(authUser);
      notify('success', `Demo extended by ${parsedDays} day(s). New expiration: ${new Date(result.newExpiresAt).toLocaleString()}`);
    } catch (error) {
      notify('error', messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const openDemoExpiryEditor = (request: DemoRequest) => {
    setExpiryInput(dateTimeLocalValue(request.expiresAt));
    setExpiryEditorRequest(request);
  };

  const handleSaveDemoExpiry = async () => {
    if (!authUser || !expiryEditorRequest) return;
    const expiresAt = new Date(expiryInput);
    if (!expiryInput || !Number.isFinite(expiresAt.getTime())) {
      notify('error', 'Choose a valid expiration date and time.');
      return;
    }

    setActionBusy(true);
    try {
      const result = await updateDemoRequestExpiry(
        authUser,
        expiryEditorRequest.id,
        expiresAt.toISOString()
      );
      setExpiryEditorRequest(null);
      setExpiryInput('');
      await loadData(authUser);
      notify('success', `Expiration for ${result.systemCode} changed to ${formatDate(result.expiresAt)}.`);
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
  const visibleRegisteredSystems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return registeredSystems.filter((system) =>
      !query || [system.username, system.systemCode].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [registeredSystems, search]);
  const visibleUsers = (tab === 'current' ? currentUsers : demoUsers).filter((user) => {
    const query = search.trim().toLowerCase();
    return !query || [user.username, user.displayName, user.email].some((value) =>
      value.toLowerCase().includes(query)
    );
  });
  const pendingDemoRequests = demoRequests.filter((request) => request.status === 'pending').length;
  const selectedDemoRequest = demoRequests.find((request) => request.id === selectedDemoRequestId) || null;
  const visibleDemoRequests = useMemo(() => {
    const query = demoSearch.trim().toLowerCase();
    return demoRequests
      .filter((request) => demoStatusFilter === 'all' || request.status === demoStatusFilter)
      .filter((request) => {
        if (!query) return true;
        const hardware = request.hardwareInfo;
        return [
          request.systemCode,
          request.requestedBy,
          request.requestType,
          hardware?.deviceModel,
          hardware?.deviceManufacturer,
          hardware?.osCaption,
          hardware?.biosSerial,
        ].some((value) => value?.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const statusRank = { pending: 0, approved: 1, rejected: 2 };
        const statusDifference = statusRank[a.status] - statusRank[b.status];
        if (statusDifference !== 0) return statusDifference;
        return (new Date(b.requestedAt || 0).getTime()) - (new Date(a.requestedAt || 0).getTime());
      });
  }, [demoRequests, demoSearch, demoStatusFilter]);

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

  const resolvedTitle = ({
    current: 'Current Users',
    demo: 'Demo Users',
    'demo-requests': 'Demo Key Requests',
  } satisfies Record<PortalTab, string>)[tab];
  const navItems: Array<{
    id: PortalTab;
    label: string;
    icon: typeof Users;
    badge?: number;
    section: 'accounts' | 'requests';
  }> = [
    { id: 'current', label: 'Current Users', icon: Users, section: 'accounts' },
    { id: 'demo', label: 'Demo Users', icon: UserRoundPlus, section: 'accounts' },
    { id: 'demo-requests', label: 'Demo Key Requests', icon: KeyRound, badge: pendingDemoRequests, section: 'requests' },
  ];
  const accountNavItems = navItems.filter((item) => item.section === 'accounts');
  const requestNavItems = navItems.filter((item) => item.section === 'requests');
  const renderNavItem = (item: (typeof navItems)[number]) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`nav-item${tab === item.id ? ' nav-item-active' : ''}`}
        onClick={() => { setTab(item.id); setSearch(''); }}
      >
        <Icon size={18} />
        <span>{item.label}</span>
        {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
      </button>
    );
  };

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div><strong>aptPOS</strong><span>Admin Portal</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin sections">
          <p className="nav-caption nav-group-caption">ACCOUNTS</p>
          {accountNavItems.map(renderNavItem)}
          <p className="nav-caption nav-group-caption">REQUESTS</p>
          {requestNavItems.map(renderNavItem)}
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
                  ? 'View registered POS systems and current app accounts.'
                  : tab === 'demo'
                    ? 'Manage demo accounts separately from current users.'
                    : 'Review two-day demo key activation and extension requests from aptPOS.'}
              </p>
            </div>
          </div>

          {flash && <div className={`flash-message flash-${flash.kind}`} role="status">{flash.kind === 'success' ? <Check size={16} /> : <CircleAlert size={16} />}{flash.text}</div>}
          {pageError && <div className="flash-message flash-error" role="alert"><CircleAlert size={16} />{pageError}</div>}

          {tab === 'current' || tab === 'demo' ? (
            <>
            {tab === 'current' && (
              <section className="table-card">
                <div className="table-toolbar">
                  <div>
                    <h2>Registered POS systems</h2>
                    <p>{visibleRegisteredSystems.length} {visibleRegisteredSystems.length === 1 ? 'system' : 'systems'}</p>
                  </div>
                  <label className="search-box">
                    <Search size={16} />
                    <input
                      placeholder="Search registered systems"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                </div>
                {loadingData ? (
                  <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading registered systems…</div>
                ) : visibleRegisteredSystems.length === 0 ? (
                  <div className="empty-state"><KeyRound size={25} /><strong>No registered systems found</strong><span>Systems converted from approved demo requests will appear here.</span></div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>POS USER</th><th>SYSTEM CODE</th><th>VERSION</th><th>STATUS</th><th>REGISTERED</th><th>ACTIVATED</th></tr></thead>
                      <tbody>
                        {visibleRegisteredSystems.map((system) => (
                            <tr key={system.systemCode}>
                              <td data-label="POS user"><strong>{system.username}</strong></td>
                              <td data-label="System code"><code>{system.systemCode}</code></td>
                              <td data-label="Version"><strong className="version-name">{system.appVersion}</strong></td>
                              <td data-label="Status">
                                <StatusPill tone={system.status === 'active' ? 'green' : 'amber'}>
                                  {system.status === 'active' ? 'Active' : 'Pending activation'}
                                </StatusPill>
                              </td>
                              <td data-label="Registered" className="date-cell">{formatDate(system.registeredAt)}</td>
                              <td data-label="Activated" className="date-cell">{formatDate(system.activatedAt)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            <section className="table-card">
              <div className="table-toolbar">
                <div><h2>{tab === 'demo' ? 'Demo account directory' : 'User directory'}</h2><p>{visibleUsers.length} {visibleUsers.length === 1 ? 'account' : 'accounts'}</p></div>
                <label className="search-box"><Search size={16} /><input placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              </div>
              {loadingData ? (
                <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading users…</div>
              ) : visibleUsers.length === 0 ? (
                <div className="empty-state"><UserRoundX size={25} /><strong>No {tab === 'demo' ? 'demo' : 'current'} users found</strong><span>No app user accounts are available.</span></div>
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
                              <button className="icon-button" title="Edit user" aria-label={`Edit ${user.username}`} onClick={() => setUserEditor(user)} disabled={actionBusy}><Pencil size={16} /></button>
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
            </>
          ) : (
            <section className="demo-request-panel">
              <div className="demo-request-toolbar">
                <div>
                  <h2>Demo key request queue</h2>
                  <p>{visibleDemoRequests.length} of {demoRequests.length} requests</p>
                </div>
                <div className="demo-request-controls">
                  <label className="search-box"><Search size={16} /><input placeholder="Search system or device" value={demoSearch} onChange={(event) => setDemoSearch(event.target.value)} /></label>
                  <select
                    className="status-filter"
                    value={demoStatusFilter}
                    onChange={(event) => setDemoStatusFilter(event.target.value as typeof demoStatusFilter)}
                    aria-label="Filter demo requests by status"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
              {loadingData ? (
                <div className="table-state"><LoaderCircle className="spin" size={21} /> Loading requests…</div>
              ) : demoRequests.length === 0 ? (
                <div className="empty-state"><KeyRound size={25} /><strong>No demo key requests yet</strong><span>Requests from aptPOS will appear here.</span></div>
              ) : visibleDemoRequests.length === 0 ? (
                <div className="empty-state"><Search size={25} /><strong>No matching requests</strong><span>Try another search or status filter.</span></div>
              ) : (
                <div className="demo-request-list">
                  {visibleDemoRequests.map((request) => {
                    const hardware = request.hardwareInfo;
                    return (
                      <div
                        className={`demo-request-row${selectedDemoRequestId === request.id ? ' demo-request-row-selected' : ''}`}
                        key={request.id}
                      >
                        <button
                          type="button"
                          className="demo-request-open"
                          onClick={() => setSelectedDemoRequestId(request.id)}
                        >
                          <span className="demo-request-icon"><KeyRound size={19} /></span>
                          <span className="demo-request-main">
                            <span className="demo-request-heading">
                              <strong>{request.requestType === 'extension' ? 'Demo extension' : 'Demo activation'}</strong>
                              <StatusPill tone={request.status === 'approved' ? 'green' : request.status === 'rejected' ? 'red' : 'amber'}>{request.status}</StatusPill>
                            </span>
                            <span className="demo-request-meta">
                              <code>{request.systemCode}</code>
                              <span>{request.requestedBy}</span>
                              <span>{hardware?.deviceManufacturer || hardware?.deviceModel ? `${hardware.deviceManufacturer || ''} ${hardware.deviceModel || ''}`.trim() : 'Device details unavailable'}</span>
                              <span>Requested {formatDate(request.requestedAt)}</span>
                              {request.registeredSystem && (
                                <span>
                                  {request.registrationStatus === 'pending_activation' ? 'Registration pending' : 'Registered'}
                                  {' · '}{request.registeredVersion || 'Version unavailable'}
                                </span>
                              )}
                            </span>
                            {request.status === 'approved' && request.demoKey && (
                              <small className="demo-request-key">Using demo key: <code>{request.demoKey}</code></small>
                            )}
                          </span>
                          <span className="demo-request-last-login">
                            <span>Last logged in</span>
                            <strong>{formatDate(request.lastLoggedInAt)}</strong>
                            <small>Total logins: {request.totalLogins}</small>
                          </span>
                          <ChevronRight className="demo-request-chevron" size={18} />
                        </button>
                        <button
                          type="button"
                          className="demo-request-expiry"
                          onClick={() => openDemoExpiryEditor(request)}
                          disabled={actionBusy || request.registeredSystem || !request.expiresAt || request.status !== 'approved'}
                          aria-label={request.registeredSystem
                            ? `Registered as ${request.registeredVersion || 'unknown version'}`
                            : `Change expiration for system ${request.systemCode}`}
                        >
                          <span>{request.registeredSystem ? 'Version' : 'Expires'}</span>
                          <strong>{request.registeredSystem
                            ? request.registeredVersion || 'Registered'
                            : formatDate(request.expiresAt)}</strong>
                          {!request.registeredSystem && <Pencil size={14} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          <footer className="page-footer"><span>Independent admin portal</span><span>Firebase Authentication · Cloud Firestore</span></footer>
        </section>
      </main>

      {userEditor && (
        <UserEditor
          user={userEditor}
          busy={actionBusy}
          onClose={() => setUserEditor(null)}
          onSubmit={handleSaveUser}
        />
      )}
      {selectedDemoRequest && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) setSelectedDemoRequestId(null);
        }}>
          <section className="demo-detail-modal" role="dialog" aria-modal="true" aria-label="Demo key request details">
            <div className="demo-detail-header">
              <div>
                <p className="eyebrow">DEMO KEY REQUEST</p>
                <h2>{selectedDemoRequest.requestType === 'extension' ? 'Demo extension' : 'Demo activation'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedDemoRequestId(null)} aria-label="Close details">
                <X size={18} />
              </button>
            </div>

            <div className="demo-detail-summary">
              <div>
                <span>System code</span>
                <strong><code>{selectedDemoRequest.systemCode}</code></strong>
              </div>
              <div>
                <span>Status</span>
                <StatusPill tone={selectedDemoRequest.status === 'approved' ? 'green' : selectedDemoRequest.status === 'rejected' ? 'red' : 'amber'}>
                  {selectedDemoRequest.status}
                </StatusPill>
              </div>
              {selectedDemoRequest.registeredSystem && (
                <div>
                  <span>Registration</span>
                  <StatusPill tone={selectedDemoRequest.registrationStatus === 'pending_activation' ? 'amber' : 'green'}>
                    {selectedDemoRequest.registrationStatus === 'pending_activation' ? 'Pending activation' : 'Registered'}
                    {' · '}{selectedDemoRequest.registeredVersion || 'Version unavailable'}
                  </StatusPill>
                </div>
              )}
            </div>

            <dl className="demo-detail-grid">
              <div><dt>Requested by</dt><dd>{selectedDemoRequest.requestedBy}</dd></div>
              <div><dt>Requested</dt><dd>{formatDate(selectedDemoRequest.requestedAt)}</dd></div>
              <div><dt>Reviewed</dt><dd>{selectedDemoRequest.reviewedAt ? formatDate(selectedDemoRequest.reviewedAt) : 'Not reviewed'}</dd></div>
              {selectedDemoRequest.expiresAt && <div><dt>Expiration</dt><dd>{formatDate(selectedDemoRequest.expiresAt)}</dd></div>}
            </dl>

            <div className="hardware-detail-card">
              <h3>System registration</h3>
              {selectedDemoRequest.registeredSystem ? (
                <p className="muted-copy">
                  {selectedDemoRequest.registrationStatus === 'pending_activation'
                    ? `The ${selectedDemoRequest.registeredVersion || 'selected'} registration is waiting for its key to be activated in aptPOS Settings.`
                    : `This system is registered on the ${selectedDemoRequest.registeredVersion || 'selected'} version. Its available modules follow the saved version control settings.`}
                </p>
              ) : selectedDemoRequest.status === 'approved' ? (
                <>
                  <p className="muted-copy">
                    Choose a version and create the owner login. aptPOS will activate the registration key on this system.
                  </p>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => setConversionRequest(selectedDemoRequest)}
                    disabled={actionBusy}
                  >
                    <Check size={16} />
                    Convert to Registered
                  </button>
                </>
              ) : (
                <p className="muted-copy">Approve this demo request before converting its system.</p>
              )}
            </div>

            <div className="hardware-detail-card">
              <h3>System activity</h3>
              {loadingDemoActivity ? (
                <p className="muted-copy">Loading system activity…</p>
              ) : demoActivityError ? (
                <p className="inline-error" role="alert">{demoActivityError}</p>
              ) : demoSystemActivity ? (
                <>
                  <dl className="demo-detail-grid">
                    <div><dt>Last logged in</dt><dd>{formatDate(demoSystemActivity.lastLoggedInAt)}</dd></div>
                    <div><dt>Total logins</dt><dd>{demoSystemActivity.totalLogins}</dd></div>
                    <div><dt>Status checks</dt><dd>{demoSystemActivity.totalStatusChecks}</dd></div>
                    <div>
                      <dt>Demo API network usage</dt>
                      <dd>
                        {formatBytes(demoSystemActivity.networkBytesReceived + demoSystemActivity.networkBytesSent)}
                        <small> · {formatBytes(demoSystemActivity.networkBytesReceived)} received / {formatBytes(demoSystemActivity.networkBytesSent)} sent</small>
                      </dd>
                    </div>
                  </dl>
                  {demoSystemActivity.systemInfo && (
                    <>
                      <h3 className="demo-system-info-heading">Latest system details</h3>
                      <dl>
                        {demoSystemActivity.systemInfo.hostname && <div><dt>Hostname</dt><dd>{demoSystemActivity.systemInfo.hostname}</dd></div>}
                        {demoSystemActivity.systemInfo.osPlatform && <div><dt>Platform</dt><dd>{demoSystemActivity.systemInfo.osPlatform}</dd></div>}
                        {demoSystemActivity.systemInfo.osRelease && <div><dt>OS release</dt><dd>{demoSystemActivity.systemInfo.osRelease}</dd></div>}
                        {demoSystemActivity.systemInfo.architecture && <div><dt>Architecture</dt><dd>{demoSystemActivity.systemInfo.architecture}</dd></div>}
                        {demoSystemActivity.systemInfo.cpuModel && <div><dt>Processor</dt><dd>{demoSystemActivity.systemInfo.cpuModel}</dd></div>}
                        {demoSystemActivity.systemInfo.cpuCores && <div><dt>CPU cores</dt><dd>{demoSystemActivity.systemInfo.cpuCores}</dd></div>}
                        {demoSystemActivity.systemInfo.totalMemoryGb && <div><dt>Memory</dt><dd>{demoSystemActivity.systemInfo.totalMemoryGb} GB RAM</dd></div>}
                      </dl>
                    </>
                  )}
                  <h3 className="demo-system-info-heading">Recent login history</h3>
                  {demoSystemActivity.recentLogins.length === 0 ? (
                    <p className="muted-copy">No login history has been recorded yet.</p>
                  ) : (
                    <div className="demo-login-history">
                      {demoSystemActivity.recentLogins.map((login) => (
                        <div key={login.id}>
                          <strong>{formatDate(login.loggedInAt)}</strong>
                          <small>{formatBytes(login.networkBytesReceived)} received · {formatBytes(login.networkBytesSent)} sent</small>
                          {login.systemInfo && (
                            <small>
                              {[
                                login.systemInfo.hostname,
                                login.systemInfo.osPlatform,
                                login.systemInfo.osRelease,
                                login.systemInfo.architecture,
                                login.systemInfo.cpuModel,
                                login.systemInfo.cpuCores ? `${login.systemInfo.cpuCores} cores` : undefined,
                                login.systemInfo.totalMemoryGb ? `${login.systemInfo.totalMemoryGb} GB RAM` : undefined,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </small>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {selectedDemoRequest.hardwareInfo && (
              <div className="hardware-detail-card">
                <h3>Hardware information</h3>
                <dl>
                  {selectedDemoRequest.hardwareInfo.deviceManufacturer || selectedDemoRequest.hardwareInfo.deviceModel ? (
                    <div><dt>Device</dt><dd>{[selectedDemoRequest.hardwareInfo.deviceManufacturer, selectedDemoRequest.hardwareInfo.deviceModel].filter(Boolean).join(' ')}</dd></div>
                  ) : null}
                  {selectedDemoRequest.hardwareInfo.osCaption && <div><dt>Operating system</dt><dd>{selectedDemoRequest.hardwareInfo.osCaption}</dd></div>}
                  {selectedDemoRequest.hardwareInfo.cpuModel && <div><dt>Processor</dt><dd>{selectedDemoRequest.hardwareInfo.cpuModel} ({selectedDemoRequest.hardwareInfo.cpuCores || 'Unknown'} cores)</dd></div>}
                  {selectedDemoRequest.hardwareInfo.totalMemoryGb && <div><dt>Memory</dt><dd>{selectedDemoRequest.hardwareInfo.totalMemoryGb} GB RAM</dd></div>}
                  {selectedDemoRequest.hardwareInfo.biosSerial && <div><dt>BIOS serial</dt><dd>{selectedDemoRequest.hardwareInfo.biosSerial}</dd></div>}
                  {selectedDemoRequest.hardwareInfo.hostname && <div><dt>Hostname</dt><dd>{selectedDemoRequest.hardwareInfo.hostname}</dd></div>}
                </dl>
              </div>
            )}

            {(issuedDemoKeys[selectedDemoRequest.id] || selectedDemoRequest.demoKey) && (
              <div className="generated-key-card">
                <div>
                  <span>{selectedDemoRequest.keyUsed ? 'Current using demo key' : 'Generated demo key'}</span>
                  <input readOnly value={issuedDemoKeys[selectedDemoRequest.id] || selectedDemoRequest.demoKey || ''} />
                </div>
                <button className="button button-primary" onClick={() => void handleCopyDemoKey(issuedDemoKeys[selectedDemoRequest.id] || selectedDemoRequest.demoKey || '')}>
                  <Check size={15} /> Copy key
                </button>
              </div>
            )}
            {!issuedDemoKeys[selectedDemoRequest.id] && !selectedDemoRequest.demoKey && selectedDemoRequest.keyUsed && (
              <div className="generated-key-card">
                <div>
                  <span>Current using demo key</span>
                  <input readOnly value="Key was issued before readable key storage was enabled" />
                </div>
              </div>
            )}

            <div className="demo-detail-actions">
              {selectedDemoRequest.status === 'pending' ? (
                <>
                  <button className="button button-quiet" onClick={() => void handleReviewDemoRequest(selectedDemoRequest, 'rejected')} disabled={actionBusy}>
                    <X size={15} /> Reject
                  </button>
                  <button className="button button-primary" onClick={() => void handleReviewDemoRequest(selectedDemoRequest, 'approved')} disabled={actionBusy}>
                    <Check size={15} /> Approve & generate key
                  </button>
                </>
              ) : (
                <>
                  {selectedDemoRequest.status === 'approved' && !selectedDemoRequest.registeredSystem && (
                    <button className="button button-quiet" onClick={() => setRegenerateKeyRequest(selectedDemoRequest)} disabled={actionBusy}>
                      <KeyRound size={15} /> Regenerate key
                    </button>
                  )}
                  {selectedDemoRequest.status === 'approved' && !selectedDemoRequest.registeredSystem && (
                    <>
                      <button className="button button-quiet button-extend" onClick={() => void handleExtendDemo(selectedDemoRequest)} disabled={actionBusy}>
                        <Clock3 size={15} /> Extend
                      </button>
                      <button className="button button-quiet button-deactivate" onClick={() => void handleDeactivateDemo(selectedDemoRequest)} disabled={actionBusy}>
                        <UserRoundX size={15} /> Deactivate
                      </button>
                    </>
                  )}
                  {selectedDemoRequest.status === 'rejected' && !selectedDemoRequest.registeredSystem && (
                    <button className="button button-primary" onClick={() => void handleExtendDemo(selectedDemoRequest)} disabled={actionBusy}>
                      <Clock3 size={15} /> Reactivate
                    </button>
                  )}
                </>
              )}
              <button
                className="button button-quiet button-deactivate"
                onClick={() => {
                  setDeleteConfirmationCode('');
                  setSelectedDemoRequestId(null);
                  setDeleteDemoDataRequest(selectedDemoRequest);
                }}
                disabled={actionBusy}
              >
                <Trash2 size={15} /> Delete all Firebase data
              </button>
            </div>
          </section>
        </div>
      )}
      {conversionRequest && (
        <RegistrationConversionEditor
          systemCode={conversionRequest.systemCode}
          busy={actionBusy}
          onClose={() => setConversionRequest(null)}
          onSubmit={(input) => handleConvertDemoSystem(conversionRequest, input)}
        />
      )}
      {registrationKeyResult && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setRegistrationKeyResult(null);
        }}>
          <section className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="registration-key-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">REGISTRATION KEY</p>
                <h2 id="registration-key-title">Share this key with the customer</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setRegistrationKeyResult(null)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            <p className="muted-copy">
              This key is for system <code>{registrationKeyResult.systemCode}</code>, version {registrationKeyResult.appVersion},
              and owner <strong>{registrationKeyResult.username}</strong>. It is shown only once.
            </p>
            <label>
              Registration key
              <input readOnly value={registrationKeyResult.registrationKey} />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void handleCopyRegistrationKey(registrationKeyResult.registrationKey)}
              >
                <KeyRound size={15} /> Copy key
              </button>
              <button type="button" className="button button-primary" onClick={() => setRegistrationKeyResult(null)}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}
      {expiryEditorRequest && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) setExpiryEditorRequest(null);
        }}>
          <section className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-labelledby="demo-expiry-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DEMO LICENSE</p>
                <h2 id="demo-expiry-title">Change expiration</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setExpiryEditorRequest(null)} aria-label="Close dialog" disabled={actionBusy}>
                <X size={18} />
              </button>
            </div>
            <p className="muted-copy">
              Set the expiration date and time for system <code>{expiryEditorRequest.systemCode}</code>.
              You can move it earlier or later.
            </p>
            <label>
              Expiration date and time
              <input
                autoFocus
                type="datetime-local"
                value={expiryInput}
                onChange={(event) => setExpiryInput(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={() => setExpiryEditorRequest(null)} disabled={actionBusy}>
                Cancel
              </button>
              <button type="button" className="button button-primary" onClick={() => void handleSaveDemoExpiry()} disabled={actionBusy || !expiryInput}>
                {actionBusy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                Save expiration
              </button>
            </div>
          </section>
        </div>
      )}
      {deleteDemoDataRequest && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) closeDeleteDemoConfirmation();
        }}>
          <section className="modal-card modal-card-narrow" role="alertdialog" aria-modal="true" aria-labelledby="delete-demo-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">PERMANENT ACTION</p>
                <h2 id="delete-demo-title">Delete all demo data?</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeDeleteDemoConfirmation} aria-label="Close dialog" disabled={actionBusy}>
                <X size={18} />
              </button>
            </div>
            <p className="muted-copy">
              This permanently removes every demo request, key claim, demo license, and registered-system entitlement for system{' '}
              <code>{deleteDemoDataRequest.systemCode}</code>. Firebase Auth accounts and app user accounts are preserved.
            </p>
            <label>
              Type the system code to confirm
              <input
                autoFocus
                autoComplete="off"
                value={deleteConfirmationCode}
                onChange={(event) => setDeleteConfirmationCode(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={closeDeleteDemoConfirmation} disabled={actionBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="button button-quiet button-deactivate"
                onClick={() => void handleDeleteDemoData()}
                disabled={
                  actionBusy
                  || deleteConfirmationCode.trim().toUpperCase() !== deleteDemoDataRequest.systemCode.trim().toUpperCase()
                }
              >
                {actionBusy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                Delete permanently
              </button>
            </div>
          </section>
        </div>
      )}
      {regenerateKeyRequest && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !actionBusy) setRegenerateKeyRequest(null);
        }}>
          <section className="modal-card modal-card-narrow" role="dialog" aria-modal="true" aria-label="Regenerate demo key">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DEMO KEY</p>
                <h2>Regenerate key?</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setRegenerateKeyRequest(null)} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            <p className="muted-copy">
              This will replace the current key for system <code>{regenerateKeyRequest.systemCode}</code>.
              Any previously shared key will stop working.
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={() => setRegenerateKeyRequest(null)} disabled={actionBusy}>
                Cancel
              </button>
              <button type="button" className="button button-primary" onClick={() => void handleRegenerateDemoKey(regenerateKeyRequest)} disabled={actionBusy}>
                {actionBusy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
                Regenerate key
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
