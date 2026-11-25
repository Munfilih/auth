import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfigProvider, Modal, Input, Select, message } from 'antd';
import { portalTheme } from './theme';
import { AppShell } from './layout/AppShell';
import type { NavigationKey } from './layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { RegisteredBusinessesPage } from './pages/RegisteredBusinessesPage';
import { BusinessDetailPage } from './pages/BusinessDetailPage';
import { RegisterBusinessModal } from './pages/RegisterBusinessModal';
import { DemoUsersPage } from './pages/DemoUsersPage';
import { DemoRequestsPage } from './pages/DemoRequestsPage';
import { VersionManagerPage } from './pages/VersionManagerPage';
import { AmcManagementPage } from './pages/AmcManagementPage';
import { DeviceManagementPage } from './pages/DeviceManagementPage';
import { AdminUserManagementPage } from './pages/AdminUserManagementPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

// Modals & Drawers
import { DemoRequestDetailDrawer } from './components/DemoRequestDetailDrawer';

// API & Firebase
import {
  deactivateDemoRequest,
  reactivateDemoRequest,
  deleteDemoSystemData,
  extendDemoRequest,
  getDemoRequests,
  getDemoRequestKey,
  getDeviceActivity,
  getBlockedSystemCodes,
  getDefaultCredentialAudit,
  blockDeviceSystem,
  unblockDeviceSystem,
  getDeviceRegistrationLicenses,
  registerDevice,
  getRegisteredBusinesses,
  getRegisteredBusinessDetails,
  getDemoSystemActivity,
  registerBusiness,
  addRegisteredSystemCode,
  changeRegisteredSystemCode,
  removeRegisteredSystemCode,
  regenerateDemoRequestKey,
  reviewDemoRequest,
  updateDemoRequestConfiguration,
  updateRegisteredBusiness,
  updateRegisteredBusinessVersion,
  updateRegisteredBusinessAmc,
  setRegisteredBusinessHold,
  adjustRegisteredBusinessDeviceSlots,
  updateDemoRequestExpiry,
  getVersionControlSettings,
  updateVersionControlSettings,
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
  AppVersion,
  DefaultCredentialAuditRecord,
  DemoRequest,
  DemoSystemActivity,
  ReviewedDemoRequest,
  RegisterBusinessInput,
  RegisterDeviceInput,
  RegisterDeviceResult,
  DeviceRegistrationLicense,
  RegisteredBusiness,
  RegisteredBusinessDetails,
  UpdateRegisteredBusinessInput,
  UpdateRegisteredBusinessAmcInput,
  VersionControlSettings,
  VersionModulePolicy,
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

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function dateTimeLocalValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function AdminPortal() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [adminUsername, setAdminUsername] = useState('aptadmin');
  const [loginBusy, setLoginBusy] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginError, setLoginError] = useState('');
  const pendingGoogleCredential = useRef<OAuthCredential | null>(null);
  const authInitializationRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);

  // Navigation state
  const [tab, setTab] = useState<NavigationKey>('dashboard');
  const [registerBusinessOpen, setRegisterBusinessOpen] = useState(false);
  const [selectedRegisteredBusiness, setSelectedRegisteredBusiness] = useState<RegisteredBusinessDetails | null>(null);

  // Data state
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredBusiness[]>([]);
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([]);
  const [blockedSystemCodes, setBlockedSystemCodes] = useState<string[]>([]);
  const [defaultCredentialAudit, setDefaultCredentialAudit] = useState<DefaultCredentialAuditRecord[]>([]);
  const [credentialAuditLoading, setCredentialAuditLoading] = useState(false);
  const [credentialAuditError, setCredentialAuditError] = useState('');
  const [demoSystemActivity, setDemoSystemActivity] = useState<DemoSystemActivity | null>(null);
  const [loadingDemoActivity, setLoadingDemoActivity] = useState(false);
  const [demoActivityError, setDemoActivityError] = useState('');
  const [issuedDemoKeys, setIssuedDemoKeys] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [versionControlSettings, setVersionControlSettings] = useState<VersionControlSettings | null>(null);
  const [versionControlLoading, setVersionControlLoading] = useState(false);
  const [versionControlBusy, setVersionControlBusy] = useState(false);

  // Modals & Selection state
  const [selectedDemoRequestId, setSelectedDemoRequestId] = useState<string | null>(null);
  const [demoApprovalRequest, setDemoApprovalRequest] = useState<DemoRequest | null>(null);
  const [demoApprovalVersion, setDemoApprovalVersion] = useState<AppVersion>('Standard');
  const [expiryEditorRequest, setExpiryEditorRequest] = useState<DemoRequest | null>(null);
  const [expiryInput, setExpiryInput] = useState('');
  const [deleteDemoDataRequest, setDeleteDemoDataRequest] = useState<DemoRequest | null>(null);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');

  // Load version control settings
  const loadVersionControlSettings = useCallback(async (user: User) => {
    setVersionControlLoading(true);
    try {
      const settings = await getVersionControlSettings(user);
      setVersionControlSettings(settings);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setVersionControlLoading(false);
    }
  }, []);

  const handleLoadVersionControlSettings = useCallback(async () => {
    if (!authUser) {
      message.error('Sign in as aptadmin to load version settings.');
      return;
    }
    await loadVersionControlSettings(authUser);
  }, [authUser, loadVersionControlSettings]);

  // Save version control settings
  const saveVersionControlSettings = useCallback(async (allowedModules: VersionModulePolicy) => {
    setVersionControlBusy(true);
    try {
      if (!authUser) {
        throw new Error('Sign in as aptadmin to save version settings.');
      }
      const result = await updateVersionControlSettings(authUser, allowedModules);
      setVersionControlSettings(result);
    } finally {
      setVersionControlBusy(false);
    }
  }, [authUser]);

// Load all initial portal data
  const loadData = useCallback(async (user: User) => {
    setLoadingData(true);
    try {
      const [loadedRegisteredBusinesses, loadedDemoRequests, loadedBlockedSystemCodes] = await Promise.all([
        getRegisteredBusinesses(user),
        getDemoRequests(user),
        getBlockedSystemCodes(user),
      ]);
      setRegisteredBusinesses(loadedRegisteredBusinesses);
      setDemoRequests(loadedDemoRequests);
      setBlockedSystemCodes(loadedBlockedSystemCodes);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setLoadingData(false);
    }
  }, []);

  const completeAuthentication = useCallback((user: User): Promise<void> => {
    const activeInitialization = authInitializationRef.current;
    if (activeInitialization?.uid === user.uid) return activeInitialization.promise;

    const promise = (async () => {
      if (user.email?.toLowerCase() !== adminLoginEmail?.toLowerCase()) {
        throw new Error(`Use the Google account configured for ${adminLoginEmail}.`);
      }
      const session = await verifyPortalAdmin(user);
      setAdminUsername(session.username);
      setAuthUser(user);
      setAuthChecking(false);
      void loadData(user);
    })().catch((error: unknown) => {
      if (authInitializationRef.current?.uid === user.uid) {
        authInitializationRef.current = null;
      }
      throw error;
    });

    authInitializationRef.current = { uid: user.uid, promise };
    return promise;
  }, [loadData]);

  const loadDefaultCredentialAudit = useCallback(async (user: User) => {
    setCredentialAuditLoading(true);
    setCredentialAuditError('');
    try {
      setDefaultCredentialAudit(await getDefaultCredentialAudit(user));
    } catch (error) {
      const errorMessage = messageFrom(error);
      setCredentialAuditError(errorMessage);
      message.error(errorMessage);
    } finally {
      setCredentialAuditLoading(false);
    }
  }, []);

  const handleOpenAdminUsers = useCallback(() => {
    setTab('admin-users');
    if (authUser) void loadDefaultCredentialAudit(authUser);
  }, [authUser, loadDefaultCredentialAudit]);

  // Fetch telemetry activity when a demo request is opened
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
    void getDemoRequestKey(authUser, selectedDemoRequestId)
      .then(({ demoKey }) => {
        if (!active) return;
        setIssuedDemoKeys((keys) => {
          const next = { ...keys };
          if (demoKey) next[selectedDemoRequestId] = demoKey;
          else delete next[selectedDemoRequestId];
          return next;
        });
      })
      .catch((error: unknown) => {
        if (active) message.error(messageFrom(error));
      });
    return () => {
      active = false;
    };
  }, [authUser, selectedDemoRequestId]);

  // Handle Google Redirect Result
  useEffect(() => {
    const auth = firebaseAuth;
    if (!auth) return;
    void getRedirectResult(auth).catch((error: unknown) => {
      const pendingCredential =
        error instanceof FirebaseError ? GoogleAuthProvider.credentialFromError(error) : null;
      if (
        error instanceof FirebaseError &&
        error.code === 'auth/account-exists-with-different-credential' &&
        pendingCredential
      ) {
        pendingGoogleCredential.current = pendingCredential;
        setLoginError('This account already uses password sign-in. Enter its password and choose “Sign In Securely” once to link Google.');
      } else {
        setLoginError(messageFrom(error));
      }
    });
  }, []);

  // Auth State Listener
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
        authInitializationRef.current = null;
        setAuthUser(null);
        setAuthChecking(false);
        return;
      }
      setAuthChecking(true);
      void completeAuthentication(user)
        .catch(async (error: unknown) => {
          setLoginError(messageFrom(error));
          await signOut(auth);
          setAuthUser(null);
        })
        .finally(() => setAuthChecking(false));
    });
  }, [completeAuthentication]);

  // Login handler
  const handleLogin = async (password: string) => {
    setLoginError('');
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
        await completeAuthentication(credential.user);
      }
    } catch (error) {
      if (firebaseAuth.currentUser) await signOut(firebaseAuth);
      setLoginError(messageFrom(error));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLoadDeviceActivity = useCallback(async (systemCode: string) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    return getDeviceActivity(authUser, systemCode);
  }, [authUser]);

  const handleLoadDeviceRegistrationLicenses = useCallback(async (): Promise<DeviceRegistrationLicense[]> => {
    if (!authUser) throw new Error('Your admin session has expired.');
    return getDeviceRegistrationLicenses(authUser);
  }, [authUser]);

  const handleRegisterDevice = useCallback(async (input: RegisterDeviceInput): Promise<RegisterDeviceResult> => {
    if (!authUser) throw new Error('Your admin session has expired.');
    const result = await registerDevice(authUser, input);
    await loadData(authUser);
    return result;
  }, [authUser, loadData]);

  const handleToggleDeviceBlock = useCallback(async (systemCode: string, blocked: boolean) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    if (blocked) {
      await blockDeviceSystem(authUser, systemCode);
      setBlockedSystemCodes((current) =>
        current.includes(systemCode) ? current : [...current, systemCode]
      );
    } else {
      await unblockDeviceSystem(authUser, systemCode);
      setBlockedSystemCodes((current) =>
        current.filter((blockedCode) => blockedCode !== systemCode)
      );
    }
  }, [authUser]);

  // Google Login handler
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

  // Logout handler
  const handleLogout = async () => {
    if (firebaseAuth) await signOut(firebaseAuth);
    authInitializationRef.current = null;
    setAuthUser(null);
    setRegisteredBusinesses([]);
    setDemoRequests([]);
    setBlockedSystemCodes([]);
    setIssuedDemoKeys({});
    setSelectedRegisteredBusiness(null);
    setTab('dashboard');
  };

  // Business Actions
  const handleOpenRegisteredBusiness = async (businessId: string) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const business = await getRegisteredBusinessDetails(authUser, businessId);
      setSelectedRegisteredBusiness(business);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRegisterBusiness = async (input: RegisterBusinessInput) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      const result = await registerBusiness(authUser, input);
      await loadData(authUser);
      return result;
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateBusiness = async (input: UpdateRegisteredBusinessInput) => {
    if (!authUser || !selectedRegisteredBusiness) return;
    setActionBusy(true);
    try {
      const updated = await updateRegisteredBusiness(authUser, selectedRegisteredBusiness.id, input);
      setSelectedRegisteredBusiness(updated);
      await loadData(authUser);
      message.success('Business details updated successfully.');
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateBusinessVersion = async (appVersion: AppVersion) => {
    if (!authUser || !selectedRegisteredBusiness) {
      throw new Error('Select a registered business before changing its version.');
    }
    setActionBusy(true);
    try {
      const updated = await updateRegisteredBusinessVersion(
        authUser,
        selectedRegisteredBusiness.id,
        appVersion
      );
      setSelectedRegisteredBusiness((current) =>
        current ? { ...current, appVersion: updated.appVersion } : current
      );
      setRegisteredBusinesses((current) =>
        current.map((business) =>
          business.id === selectedRegisteredBusiness.id
            ? { ...business, appVersion: updated.appVersion }
            : business
        )
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleSetBusinessHold = async (businessId: string, onHold: boolean) => {
    if (!authUser) {
      throw new Error('Select a registered business before changing its license status.');
    }
    setActionBusy(true);
    try {
      const updated = await setRegisteredBusinessHold(authUser, businessId, onHold);
      setSelectedRegisteredBusiness((current) =>
        current?.id === businessId ? { ...current, onHold: updated.onHold } : current
      );
      setRegisteredBusinesses((current) =>
        current.map((business) =>
          business.id === businessId
            ? { ...business, onHold: updated.onHold }
            : business
        )
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdjustBusinessSlots = async (action: 'add' | 'remove') => {
    if (!authUser || !selectedRegisteredBusiness) {
      throw new Error('Select a registered business before changing device slots.');
    }
    setActionBusy(true);
    try {
      const updated = await adjustRegisteredBusinessDeviceSlots(
        authUser,
        selectedRegisteredBusiness.id,
        action
      );
      setSelectedRegisteredBusiness((current) =>
        current ? { ...current, systemLimit: updated.systemLimit } : current
      );
      setRegisteredBusinesses((current) =>
        current.map((business) =>
          business.id === selectedRegisteredBusiness.id
            ? { ...business, systemLimit: updated.systemLimit }
            : business
        )
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleUpdateBusinessAmc = async (
    businessId: string,
    input: UpdateRegisteredBusinessAmcInput
  ) => {
    if (!authUser) throw new Error('Your admin session has expired.');
    setActionBusy(true);
    try {
      const updated = await updateRegisteredBusinessAmc(authUser, businessId, input);
      setRegisteredBusinesses((current) =>
        current.map((business) => business.id === businessId ? { ...business, ...updated } : business)
      );
      setSelectedRegisteredBusiness((current) =>
        current?.id === businessId ? { ...current, ...updated } : current
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleAddSystemCode = async (code: string) => {
    if (!authUser || !selectedRegisteredBusiness) return;
    setActionBusy(true);
    try {
      await addRegisteredSystemCode(authUser, selectedRegisteredBusiness.id, code);
      const updated = await getRegisteredBusinessDetails(authUser, selectedRegisteredBusiness.id);
      setSelectedRegisteredBusiness(updated);
      await loadData(authUser);
      message.success(`System code ${code} registered. Pending activation.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleChangeSystemCode = async (currentCode: string, newCode: string) => {
    if (!authUser || !selectedRegisteredBusiness) return;
    setActionBusy(true);
    try {
      await changeRegisteredSystemCode(authUser, selectedRegisteredBusiness.id, currentCode, newCode);
      const updated = await getRegisteredBusinessDetails(authUser, selectedRegisteredBusiness.id);
      setSelectedRegisteredBusiness(updated);
      await loadData(authUser);
      message.success(`System code changed to ${newCode}. Pending activation.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveSystemCode = async (code: string) => {
    if (!authUser || !selectedRegisteredBusiness) return;
    setActionBusy(true);
    try {
      await removeRegisteredSystemCode(authUser, selectedRegisteredBusiness.id, code);
      const updated = await getRegisteredBusinessDetails(authUser, selectedRegisteredBusiness.id);
      setSelectedRegisteredBusiness(updated);
      await loadData(authUser);
      message.success(`System code ${code} removed.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  // Demo Request Actions
  const handleReviewDemoRequest = async (
    request: DemoRequest,
    status: 'approved' | 'rejected',
    selection?: { appVersion: AppVersion }
  ) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const result: ReviewedDemoRequest = await reviewDemoRequest(
        authUser,
        request.id,
        status,
        selection
      );
      if (result.demoKey) {
        setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: result.demoKey! }));
      }
      if (status === 'approved') setDemoApprovalRequest(null);
      await loadData(authUser);
      message.success(status === 'approved' ? 'Demo request approved! License key ready.' : 'Demo request rejected.');
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequestDemoApproval = async (request: DemoRequest) => {
    if (request.requestType === 'extension') {
      await handleReviewDemoRequest(request, 'approved');
      return;
    }
    setDemoApprovalVersion('Standard');
    setDemoApprovalRequest(request);
  };

  const handleUpdateDemoConfiguration = async (
    request: DemoRequest,
    selection: { appVersion: AppVersion }
  ) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const result = await updateDemoRequestConfiguration(authUser, request.id, selection);
      setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: result.demoKey }));
      await loadData(authUser);
      message.success('Demo user updated. Copy and share the new demo key shown above.');
    } catch (error) {
      message.error(messageFrom(error));
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
      message.error('Enter a valid number of days (at least 1).');
      return;
    }
    setActionBusy(true);
    try {
      const result = await extendDemoRequest(authUser, request.id, parsedDays);
      if (result.demoKey) {
        setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: result.demoKey! }));
      }
      await loadData(authUser);
      message.success(`Demo extended by ${parsedDays} day(s). New expiry: ${new Date(result.newExpiresAt).toLocaleString()}`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRegenerateDemoKey = async (request: DemoRequest) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const { demoKey } = await regenerateDemoRequestKey(authUser, request.id);
      setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: demoKey }));
      message.success('Replacement demo key generated.');
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeactivateDemo = async (request: DemoRequest) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      await deactivateDemoRequest(authUser, request.id);
      await loadData(authUser);
      message.success(`Demo deactivated for system ${request.systemCode}.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReactivateDemo = async (request: DemoRequest) => {
    if (!authUser) return;
    setActionBusy(true);
    try {
      const result = await reactivateDemoRequest(authUser, request.id);
      setIssuedDemoKeys((keys) => ({ ...keys, [request.id]: result.demoKey }));
      await loadData(authUser);
      message.success(`Demo reactivated for system ${request.systemCode}. A new activation key is ready.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveDemoExpiry = async () => {
    if (!authUser || !expiryEditorRequest) return;
    const expiresAt = new Date(expiryInput);
    if (!expiryInput || !Number.isFinite(expiresAt.getTime())) {
      message.error('Please choose a valid expiration date and time.');
      return;
    }
    setActionBusy(true);
    try {
      const result = await updateDemoRequestExpiry(authUser, expiryEditorRequest.id, expiresAt.toISOString());
      setExpiryEditorRequest(null);
      setExpiryInput('');
      await loadData(authUser);
      message.success(`Expiration updated for system ${result.systemCode}.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteDemoData = async () => {
    if (!authUser || !deleteDemoDataRequest) return;
    if (deleteConfirmationCode.trim().toUpperCase() !== deleteDemoDataRequest.systemCode.trim().toUpperCase()) {
      message.error('Confirmation code does not match.');
      return;
    }
    setActionBusy(true);
    try {
      const result = await deleteDemoSystemData(authUser, deleteDemoDataRequest.id);
      setIssuedDemoKeys((keys) => {
        const remaining = { ...keys };
        result.deletedRequestIds.forEach((id) => delete remaining[id]);
        return remaining;
      });
      setSelectedDemoRequestId(null);
      setDeleteDemoDataRequest(null);
      setDeleteConfirmationCode('');
      await loadData(authUser);
      message.success(`Deleted system data for ${result.systemCode}.`);
    } catch (error) {
      message.error(messageFrom(error));
    } finally {
      setActionBusy(false);
    }
  };

  // Keep deactivated demos visible so they can be reactivated with a fresh key.
  const demoUserRequests = useMemo(
    () => demoRequests.filter(
      (request) =>
        !request.convertedToRegistered &&
        (request.status === 'approved' || Boolean(request.deactivatedAt))
    ),
    [demoRequests]
  );
  const pendingDemoRequestsCount = useMemo(
    () => demoRequests.filter((r) => r.status === 'pending').length,
    [demoRequests]
  );

  const selectedDemoRequest = useMemo(
    () => demoRequests.find((r) => r.id === selectedDemoRequestId) || null,
    [demoRequests, selectedDemoRequestId]
  );

  // Navigation title mapping
  const breadcrumbTitle = useMemo(() => {
    if (tab === 'registered' && selectedRegisteredBusiness) {
      return [
        { label: 'Registered Businesses', active: false },
        { label: selectedRegisteredBusiness.businessName, active: true },
      ];
    }
    const map: Record<NavigationKey, string> = {
      dashboard: 'Dashboard',
      registered: 'Registered Businesses',
      demo: 'Demo Users',
      'demo-requests': 'Demo Key Requests',
      'device-management': 'Device Management',
      'amc-management': 'AMC Management',
      'version-control': 'Version Manager',
      'admin-users': 'Admin User Management',
    };
    return [{ label: map[tab], active: true }];
  }, [tab, selectedRegisteredBusiness]);

  // Setup screen check
  if (!firebaseConfigured) {
    return (
      <ConfigProvider theme={portalTheme}>
        <SetupPage firebaseWebConfigured={firebaseWebConfigured} />
      </ConfigProvider>
    );
  }

  // Auth checking loading screen
  if (authChecking) {
    return (
      <ConfigProvider theme={portalTheme}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid #e2e8f0',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
            Verifying admin credentials...
          </span>
        </div>
      </ConfigProvider>
    );
  }

  // Not authenticated screen
  if (!authUser) {
    return (
      <ConfigProvider theme={portalTheme}>
        <LoginPage
          adminUsername={adminUsername}
          onLogin={handleLogin}
          onGoogleLogin={handleGoogleLogin}
          loginBusy={loginBusy}
          loginError={loginError}
        />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={portalTheme}>
      <AppShell
        currentTab={tab}
        onTabChange={(newTab) => {
          setTab(newTab);
          if (newTab === 'registered') {
            setSelectedRegisteredBusiness(null);
          }
        }}
        adminUsername={adminUsername}
        onLogout={handleLogout}
        onOpenAdminUsers={handleOpenAdminUsers}
        pendingDemoRequestsCount={pendingDemoRequestsCount}
        onRefresh={() => {
          void loadData(authUser);
          if (tab === 'admin-users') void loadDefaultCredentialAudit(authUser);
        }}
        isRefreshing={loadingData || credentialAuditLoading}
        breadcrumbs={breadcrumbTitle}
      >
        {/* Dashboard */}
        {tab === 'dashboard' && (
          <DashboardPage
            registeredBusinesses={registeredBusinesses}
            demoRequests={demoRequests}
            loadingData={loadingData}
            onNavigate={(target) => {
              setTab(target);
              if (target === 'registered') {
                setSelectedRegisteredBusiness(null);
              }
            }}
            onRegisterBusiness={() => setRegisterBusinessOpen(true)}
            onLoadRegistrationLicenses={handleLoadDeviceRegistrationLicenses}
            onRegisterDevice={handleRegisterDevice}
            onSelectBusiness={(id) => {
              setTab('registered');
              void handleOpenRegisteredBusiness(id);
            }}
            onSelectDemoRequest={(id) => {
              setSelectedDemoRequestId(id);
            }}
          />
        )}

        {/* Device Management */}
        {tab === 'device-management' && (
          <DeviceManagementPage
            businesses={registeredBusinesses}
            demoRequests={demoRequests}
            blockedSystemCodes={blockedSystemCodes}
            loading={loadingData}
            onLoadActivity={handleLoadDeviceActivity}
            onToggleBlock={handleToggleDeviceBlock}
            onLoadRegistrationLicenses={handleLoadDeviceRegistrationLicenses}
            onRegisterDevice={handleRegisterDevice}
          />
        )}

        {/* Registered Businesses / Detail */}
        {tab === 'registered' && (
          selectedRegisteredBusiness ? (
            <BusinessDetailPage
              business={selectedRegisteredBusiness}
              busy={actionBusy}
              onBack={() => {
                setSelectedRegisteredBusiness(null);
              }}
              onUpdateBusiness={handleUpdateBusiness}
              onUpdateBusinessVersion={handleUpdateBusinessVersion}
              onUpdateAmc={(input) => handleUpdateBusinessAmc(selectedRegisteredBusiness.id, input)}
              onSetBusinessHold={(onHold) =>
                handleSetBusinessHold(selectedRegisteredBusiness.id, onHold)
              }
              onAdjustDeviceSlots={handleAdjustBusinessSlots}
              onAddSystemCode={handleAddSystemCode}
              onChangeSystemCode={handleChangeSystemCode}
              onRemoveSystemCode={handleRemoveSystemCode}
            />
          ) : (
            <RegisteredBusinessesPage
              businesses={registeredBusinesses}
              loading={loadingData}
              busy={actionBusy}
              onRegisterBusiness={() => setRegisterBusinessOpen(true)}
              onViewBusiness={handleOpenRegisteredBusiness}
              onEditBusiness={(b) => void handleOpenRegisteredBusiness(b.id)}
              onSetBusinessHold={handleSetBusinessHold}
            />
          )
        )}

        {/* Demo Users */}
        {tab === 'demo' && (
          <DemoUsersPage
            demoUserRequests={demoUserRequests}
            loading={loadingData}
            onSelectDemoRequest={(id) => setSelectedDemoRequestId(id)}
          />
        )}

        {/* Demo Key Requests */}
        {tab === 'demo-requests' && (
          <DemoRequestsPage
            demoRequests={demoRequests}
            loading={loadingData}
            busy={actionBusy}
            onSelectRequest={(id) => setSelectedDemoRequestId(id)}
            onApproveRequest={handleRequestDemoApproval}
            onRejectRequest={(req) => handleReviewDemoRequest(req, 'rejected')}
            onChangeExpiry={(req) => {
              setExpiryInput(dateTimeLocalValue(req.expiresAt));
              setExpiryEditorRequest(req);
            }}
          />
        )}

        {/* AMC Management */}
        {tab === 'amc-management' && (
          <AmcManagementPage
            businesses={registeredBusinesses}
            loading={loadingData}
            busy={actionBusy}
            onSave={handleUpdateBusinessAmc}
          />
        )}

        {/* Version Manager */}
        {tab === 'version-control' && (
          <VersionManagerPage
            settings={versionControlSettings}
            loading={versionControlLoading}
            busy={versionControlBusy}
            onLoadSettings={handleLoadVersionControlSettings}
            onSaveSettings={async (allowedModules) => await saveVersionControlSettings(allowedModules)}
          />
        )}

        {tab === 'admin-users' && (
          <AdminUserManagementPage
            adminUsername={adminUsername}
            records={defaultCredentialAudit}
            loading={credentialAuditLoading}
            error={credentialAuditError}
          />
        )}
      </AppShell>

      <RegisterBusinessModal
        open={registerBusinessOpen}
        busy={actionBusy}
        onClose={() => setRegisterBusinessOpen(false)}
        onRegister={handleRegisterBusiness}
        onViewRegisteredBusiness={(business) => {
          setRegisterBusinessOpen(false);
          setSelectedRegisteredBusiness(business);
          setTab('registered');
        }}
      />

      {/* Demo Request Detail Drawer */}
      <DemoRequestDetailDrawer
        open={Boolean(selectedDemoRequestId && selectedDemoRequest)}
        request={selectedDemoRequest}
        activity={demoSystemActivity}
        loadingActivity={loadingDemoActivity}
        activityError={demoActivityError}
        issuedKey={selectedDemoRequestId ? issuedDemoKeys[selectedDemoRequestId] : undefined}
        busy={actionBusy}
        onClose={() => setSelectedDemoRequestId(null)}
        onApprove={handleRequestDemoApproval}
        onReject={(req) => handleReviewDemoRequest(req, 'rejected')}
        onUpdateConfiguration={handleUpdateDemoConfiguration}
        onExtend={handleExtendDemo}
        onDeactivate={handleDeactivateDemo}
        onReactivate={handleReactivateDemo}
        onRegenerateKey={handleRegenerateDemoKey}
        onChangeExpiry={(req) => {
          setExpiryInput(dateTimeLocalValue(req.expiresAt));
          setExpiryEditorRequest(req);
        }}
        onDeleteSystemData={(req) => {
          setDeleteConfirmationCode('');
          setDeleteDemoDataRequest(req);
        }}
        onCopyKey={async (key) => {
          await navigator.clipboard.writeText(key);
          message.success('Demo key copied to clipboard.');
        }}
      />

      {/* Demo Approval Configuration Modal */}
      <Modal
        title={`Approve Demo Request: ${demoApprovalRequest?.systemCode || ''}`}
        open={Boolean(demoApprovalRequest)}
        onOk={() => {
          if (!demoApprovalRequest) return;
          return handleReviewDemoRequest(demoApprovalRequest, 'approved', {
            appVersion: demoApprovalVersion,
          });
        }}
        onCancel={() => {
          if (!actionBusy) setDemoApprovalRequest(null);
        }}
        confirmLoading={actionBusy}
        okText="Approve & Issue Key"
        destroyOnClose
      >
        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            The demo will be restricted to the selected software edition.
          </p>
          <label style={{ display: 'grid', gap: 6, color: '#334155', fontSize: 13, fontWeight: 600 }}>
            Software Version
            <Select<AppVersion>
              value={demoApprovalVersion}
              onChange={setDemoApprovalVersion}
              options={APP_VERSIONS.map((version) => ({ value: version, label: version }))}
            />
          </label>
        </div>
      </Modal>

      {/* Expiry Editor Modal */}
      <Modal
        title={`Change Expiration Date: ${expiryEditorRequest?.systemCode}`}
        open={Boolean(expiryEditorRequest)}
        onOk={handleSaveDemoExpiry}
        onCancel={() => {
          setExpiryEditorRequest(null);
          setExpiryInput('');
        }}
        confirmLoading={actionBusy}
        okText="Update Expiration"
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Set a new evaluation expiration timestamp for this demo system.
          </p>
          <Input
            type="datetime-local"
            value={expiryInput}
            onChange={(e) => setExpiryInput(e.target.value)}
          />
        </div>
      </Modal>

      {/* Delete Demo System Data Modal */}
      <Modal
        title="Confirm Permanent Deletion of Demo System Data"
        open={Boolean(deleteDemoDataRequest)}
        onOk={handleDeleteDemoData}
        onCancel={() => {
          setDeleteDemoDataRequest(null);
          setDeleteConfirmationCode('');
        }}
        confirmLoading={actionBusy}
        okText="Permanently Delete Data"
        okButtonProps={{
          danger: true,
          disabled:
            deleteConfirmationCode.trim().toUpperCase() !==
            (deleteDemoDataRequest?.systemCode || '').trim().toUpperCase(),
        }}
        destroyOnClose
      >
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            This action will permanently delete all requests, key claims, licenses, and telemetry records for system code {deleteDemoDataRequest?.systemCode}.
          </p>
          <p style={{ fontSize: 13, color: '#475569' }}>
            Type <strong>{deleteDemoDataRequest?.systemCode}</strong> to confirm:
          </p>
          <Input
            placeholder={deleteDemoDataRequest?.systemCode}
            value={deleteConfirmationCode}
            onChange={(e) => setDeleteConfirmationCode(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </ConfigProvider>
  );
}
