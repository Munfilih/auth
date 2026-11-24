import 'dotenv/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { APP_MODULES, APP_VERSIONS } from './src/types';
import type {
  AppVersion,
  AppModuleId,
  DefaultCredentialAuditRecord,
  DeviceHistoryEntry,
  DeviceLicenseHistoryEntry,
  DemoSystemInfo,
  DemoScreenType,
  UserRole,
  UserType,
  VersionControlSettings,
  VersionModulePolicy,
} from './src/types';

const app = express();
const port = Number(process.env.PORT || process.env.ADMIN_API_PORT || 3002);
const host = process.env.ADMIN_API_HOST || '127.0.0.1';
const portalAdminEmail = (process.env.VITE_ADMIN_LOGIN_EMAIL || '').trim().toLowerCase();
const versionControlApiKey = (process.env.VERSION_CONTROL_API_KEY || '').trim();
const allowedPortalOrigins = new Set(
  (process.env.ADMIN_PORTAL_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
let adminAuth: Auth | null = null;
let firestore: Firestore | null = null;
let firebaseSetupError = 'Firebase Admin credentials are not configured.';

try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (projectId && (serviceAccountJson || serviceAccountPath)) {
    const appOptions = serviceAccountJson
      ? {
          credential: cert(JSON.parse(serviceAccountJson)),
          projectId,
        }
      : { credential: applicationDefault(), projectId };
    const firebaseApp = getApps()[0] || initializeApp(appOptions);
    adminAuth = getAuth(firebaseApp);
    firestore = getFirestore(firebaseApp);
    firebaseSetupError = '';
  } else if (!projectId) {
    firebaseSetupError = 'Set FIREBASE_PROJECT_ID in the portal .env file.';
  } else {
    firebaseSetupError = 'Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service-account file.';
  }
} catch (error) {
  firebaseSetupError =
    error instanceof Error ? error.message : 'Firebase Admin could not be initialized.';
  console.error(`Firebase Admin setup failed: ${firebaseSetupError}`);
}

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && allowedPortalOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(origin && allowedPortalOrigins.has(origin) ? 204 : 403);
    return;
  }
  next();
});

// Rate limiting for public registration endpoints (no auth required)
const registrationRateLimits = new Map<string, { count: number; resetAt: number }>();
const REGISTRATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const REGISTRATION_RATE_LIMIT_MAX = 10;

function checkRegistrationRateLimit(ip: string, endpoint: string): { allowed: boolean; retryAfter?: number } {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const entry = registrationRateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    registrationRateLimits.set(key, { count: 1, resetAt: now + REGISTRATION_RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= REGISTRATION_RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, firebaseConfigured: Boolean(adminAuth && firestore && portalAdminEmail) });
});

app.post('/api/registration/demo-requests', async (req, res, next) => {
  const rateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/demo-requests');
  if (!rateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${rateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const requestType = req.body?.requestType;
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    const requestedBy = typeof req.body?.requestedBy === 'string'
      ? req.body.requestedBy.trim()
      : '';
    if ((requestType !== 'demo' && requestType !== 'extension') || !isSystemCode(systemCode)) {
      res.status(400).json({ error: 'Choose a valid demo request type and system code.' });
      return;
    }
    if (!requestedBy) {
      res.status(400).json({ error: 'Enter the demo username.' });
      return;
    }

    const { db } = getServices();
    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const licenseSnapshot = await licenseRef.get();
    const licenseData = licenseSnapshot.data();
    const expiration = licenseData?.expiresAt instanceof Timestamp
      ? licenseData.expiresAt.toMillis()
      : 0;
    if (requestType === 'demo' && licenseSnapshot.exists && licenseData?.revoked !== true) {
      throw new PortalRequestError(409, 'This system already had demo access. Request an extension instead.');
    }
    if (requestType === 'extension' && (!licenseSnapshot.exists || expiration > Date.now())) {
      throw new PortalRequestError(409, 'A demo extension can only be requested after the demo expires.');
    }

    const sameSystemRequests = await db.collection('demoRequests')
      .where('systemCode', '==', systemCode)
      .get();
    const existing = sameSystemRequests.docs.find((document) => {
      const data = document.data();
      return data.status === 'pending' || (data.status === 'approved' && data.keyUsed !== true);
    });
    if (existing) {
      const data = existing.data();
      res.status(200).json({
        requestId: existing.id,
        requestType: data.requestType,
        status: data.status,
        alreadyPending: data.status === 'pending',
        message: data.status === 'pending'
          ? 'A request for this system is already waiting for approval.'
          : 'A demo key has already been issued for this request. Use that key.',
      });
      return;
    }

    let hardwareInfo: Record<string, unknown> | null = null;
    if (typeof req.body?.hardwareInfo === 'string') {
      try {
        hardwareInfo = JSON.parse(req.body.hardwareInfo);
      } catch {
        // ignore parse error
      }
    }

    const requestRef = db.collection('demoRequests').doc();
    await requestRef.set({
      requestType,
      systemCode,
      requestedBy,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
      reviewedBy: null,
      keyUsed: false,
      redeemedAt: null,
      expiresAt: null,
      ...(hardwareInfo ? { hardwareInfo } : {}),
    });
    res.status(201).json({
      requestId: requestRef.id,
      requestType,
      status: 'pending',
      message: 'Your request was sent to aptPOS User Management.',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration/demo-activation', async (req, res, next) => {
  const rateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/demo-activation');
  if (!rateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${rateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    const activationKey = typeof req.body?.activationKey === 'string'
      ? req.body.activationKey.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode) || !activationKey || activationKey.length < 10 || activationKey.length > 100) {
      res.status(400).json({ error: 'Enter a valid system code and demo key.' });
      return;
    }

    const { db } = getServices();
    const keyHash = demoKeyHash(activationKey);
    const claimRef = db.collection('demoKeyClaims').doc(keyHash);
    const claimSnapshot = await claimRef.get();
    if (!claimSnapshot.exists) {
      throw new PortalRequestError(403, 'The demo key is invalid or has already been used.');
    }
    const requestId = String(claimSnapshot.data()?.requestId || '');
    if (!requestId) throw new PortalRequestError(403, 'The demo key is invalid or has already been used.');

    const requestRef = db.collection('demoRequests').doc(requestId);
    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const now = Date.now();
    const newExpiresAt = new Date(now + DEMO_DURATION_MS);
    const activation = await db.runTransaction(async (transaction) => {
      const [currentClaim, requestSnapshot, licenseSnapshot] = await Promise.all([
        transaction.get(claimRef),
        transaction.get(requestRef),
        transaction.get(licenseRef),
      ]);
      const claimData = currentClaim.data();
      const requestData = requestSnapshot.data();
      if (
        !currentClaim.exists ||
        !requestSnapshot.exists ||
        requestData?.status !== 'approved' ||
        requestData?.demoKeyHash !== keyHash ||
        requestData?.systemCode !== systemCode ||
        claimData?.systemCode !== systemCode
      ) {
        throw new PortalRequestError(403, 'The demo key is invalid, already used, or belongs to another system.');
      }

      const licenseData = licenseSnapshot.data();
      const appVersion =
        APP_VERSIONS.find((version) => version === requestData?.appVersion) ||
        APP_VERSIONS.find((version) => version === licenseData?.appVersion) ||
        'Standard';
      const screenType =
        parseDemoScreenType(requestData?.screenType) ||
        parseDemoScreenType(licenseData?.screenType) ||
        'pos';
      if (claimData?.used === true || requestData?.keyUsed === true) {
        const previousExpiry = licenseData?.expiresAt;
        if (
          claimData?.used === true &&
          requestData?.keyUsed === true &&
          licenseData?.requestId === requestId &&
          previousExpiry instanceof Timestamp
        ) {
          return {
            expiresAt: previousExpiry.toDate().toISOString(),
            appVersion,
            screenType,
          };
        }
        throw new PortalRequestError(403, 'The demo key is invalid, already used, or belongs to another system.');
      }

      const requestType = requestData.requestType;
      const currentExpiry = licenseData?.expiresAt instanceof Timestamp
        ? licenseData.expiresAt.toMillis()
        : 0;
      const isReissuedKeyForCurrentLicense =
        requestType === 'demo' &&
        licenseSnapshot.exists &&
        licenseData?.revoked !== true &&
        licenseData?.requestId === requestId &&
        requestData?.keyUsed !== true;
      if (
        requestType === 'demo' &&
        licenseSnapshot.exists &&
        licenseData?.revoked !== true &&
        !isReissuedKeyForCurrentLicense
      ) {
        throw new PortalRequestError(409, 'This system already used its demo. Request an extension.');
      }
      if (
        requestType === 'extension' &&
        (!licenseSnapshot.exists || (licenseData?.revoked !== true && currentExpiry > now))
      ) {
        throw new PortalRequestError(409, 'The extension key can only be used after the current demo expires.');
      }

      const activationExpiry = isReissuedKeyForCurrentLicense && licenseData?.expiresAt instanceof Timestamp
        ? new Date(Math.max(licenseData.expiresAt.toMillis(), newExpiresAt.getTime()))
        : newExpiresAt;
      const activationTime = Timestamp.now();
      const firstActivatedAt = licenseData?.firstActivatedAt instanceof Timestamp
        ? licenseData.firstActivatedAt
        : licenseData?.activatedAt instanceof Timestamp
          ? licenseData.activatedAt
          : activationTime;
      const deviceHistory = historyRecords(licenseData?.deviceHistory);
      if (!deviceHistory.some((entry) => entry.event === 'first_activation')) {
        deviceHistory.push({ event: 'first_activation', at: firstActivatedAt, source: 'demo' });
      }
      const licenseHistory = historyRecords(licenseData?.licenseHistory);
      const previousHistoryIndex = licenseHistory.findIndex((entry) => entry.requestId === requestId);
      const licenseHistoryEntry = {
        licenseType: 'demo',
        label: requestType === 'extension' ? 'Demo Extension' : 'Demo License',
        requestType,
        requestId,
        appVersion,
        assignedAt: requestData.reviewedAt instanceof Timestamp ? requestData.reviewedAt : activationTime,
        activatedAt: previousHistoryIndex >= 0
          ? licenseHistory[previousHistoryIndex].activatedAt
          : activationTime,
        expiresAt: Timestamp.fromDate(activationExpiry),
        endedAt: null,
      };
      if (previousHistoryIndex >= 0) {
        licenseHistory[previousHistoryIndex] = {
          ...licenseHistory[previousHistoryIndex],
          ...licenseHistoryEntry,
        };
      } else {
        if (requestType === 'extension') {
          const previousDemoLicense = [...licenseHistory].reverse().find(
            (entry) => entry.licenseType === 'demo' && entry.endedAt == null
          );
          if (previousDemoLicense && previousDemoLicense.expiresAt instanceof Timestamp) {
            previousDemoLicense.endedAt = previousDemoLicense.expiresAt;
          }
          deviceHistory.push({ event: 'demo_extended', at: activationTime, source: 'demo' });
        }
        licenseHistory.push(licenseHistoryEntry);
      }
      transaction.update(requestRef, {
        keyUsed: true,
        redeemedAt: FieldValue.serverTimestamp(),
        firstActivatedAt,
        expiresAt: Timestamp.fromDate(activationExpiry),
        appVersion,
        screenType,
      });
      transaction.update(claimRef, {
        used: true,
        usedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(licenseRef, {
        systemCode,
        requestId,
        appVersion,
        screenType,
        firstActivatedAt,
        deviceHistory,
        licenseHistory,
        activationRequired: false,
        activatedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(activationExpiry),
        revoked: false,
        revokedAt: FieldValue.delete(),
        revokedBy: FieldValue.delete(),
      }, { merge: true });
      return {
        expiresAt: activationExpiry.toISOString(),
        appVersion,
        screenType,
      };
    });

    res.json(activation);
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration/demo-status-check', async (req, res, next) => {
  const rateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/demo-status-check');
  if (!rateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${rateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      res.status(400).json({ error: 'Valid system code required.' });
      return;
    }

    const { db } = getServices();
    const systemId = systemCodeId(systemCode);
    const blockSnapshot = await db.collection('systemCodeBlocks').doc(systemId).get();
    if (blockSnapshot.exists) {
      res.json({ active: false, expiresAt: null, blocked: true });
      return;
    }
    const registeredRef = db.collection('registeredSystems').doc(systemId);
    const licenseRef = db.collection('demoLicenses').doc(systemId);
    const [registeredSnapshot, licenseSnapshot] = await Promise.all([
      registeredRef.get(),
      licenseRef.get(),
    ]);
    const registeredData = registeredSnapshot.data();
    const isRegistered = registeredSnapshot.exists && registeredData?.status === 'active';
    const registeredBusinessId = typeof registeredData?.businessId === 'string'
      ? registeredData.businessId
      : '';
    const registeredBusinessSnapshot = isRegistered && registeredBusinessId
      ? await db.collection('registeredBusinesses').doc(registeredBusinessId).get()
      : null;
    const registeredBusinessData = registeredBusinessSnapshot?.data();
    if (isRegistered && registeredBusinessData?.onHold === true) {
      res.json({ active: false, expiresAt: null, blocked: true });
      return;
    }
    const licenseData = licenseSnapshot.data();
    const licenseExpiresAt = licenseData?.expiresAt instanceof Timestamp
      ? licenseData.expiresAt.toDate().toISOString()
      : null;
    const licenseExpirationTime = licenseExpiresAt ? Date.parse(licenseExpiresAt) : null;
    let requestState: Record<string, boolean> = {};
    if (
      !isRegistered &&
      (
        !licenseSnapshot.exists ||
        licenseData?.revoked === true ||
        licenseExpirationTime === null ||
        licenseExpirationTime <= Date.now()
      )
    ) {
      const requestsSnapshot = await db.collection('demoRequests')
        .where('systemCode', '==', systemCode)
        .get();
      const hasPendingRequest = requestsSnapshot.docs.some(
        (document) => document.data().status === 'pending'
      );
      const hasPendingActivation = requestsSnapshot.docs.some((document) => {
        const data = document.data();
        return (
          data.status === 'approved' &&
          data.keyUsed !== true &&
          typeof data.demoKeyHash === 'string'
        );
      });
      if (hasPendingRequest) requestState = { pendingRequest: true };
      else if (hasPendingActivation) requestState = { pendingActivation: true };
      else if (!licenseSnapshot.exists && !requestsSnapshot.empty) {
        requestState = { previousRequest: true };
      }
    }
    if (!isRegistered && !licenseSnapshot.exists) {
      res.json({ active: false, expiresAt: null, ...requestState });
      return;
    }

    const eventType = req.body?.eventType === 'login' ? 'login' : 'check';
    const systemInfo = eventType === 'login'
      ? parseDemoSystemInfo(req.body?.systemInfo)
      : undefined;
    const defaultAdminCredentialsInUse =
      typeof req.body?.defaultAdminCredentialsInUse === 'boolean'
        ? req.body.defaultAdminCredentialsInUse
        : undefined;
    const contentLength = Number(req.header('content-length'));
    const networkBytesReceived = Number.isSafeInteger(contentLength) && contentLength >= 0
      ? contentLength
      : Buffer.byteLength(JSON.stringify(req.body ?? {}));
    let activityRef = licenseRef;
    let responsePayload: Record<string, unknown>;
    if (isRegistered && registeredData) {
      const appVersion = APP_VERSIONS.find((version) => version === registeredData.appVersion);
      if (!appVersion) {
        throw new Error('The registered system has an invalid app version.');
      }
      const businessData = registeredBusinessData;
      const registrationDetails = businessData
        ? {
            businessName: String(businessData.businessName || ''),
            address: String(businessData.address || ''),
            mobileNumber: String(businessData.mobileNumber || ''),
            systemCode,
            username: String(businessData.username || registeredData.username || ''),
            appVersion,
            amcStartDate: typeof businessData.amcStartDate === 'string'
              ? businessData.amcStartDate
              : null,
            amcEndDate: typeof businessData.amcEndDate === 'string'
              ? businessData.amcEndDate
              : null,
            amcNotes: typeof businessData.amcNotes === 'string' ? businessData.amcNotes : '',
          }
        : undefined;
      const versionSettings = await getVersionControlSettings(db);
      activityRef = registeredRef;
      responsePayload = {
        active: true,
        expiresAt: null,
        registered: true,
        appVersion,
        ...(parseDemoScreenType(registeredData.screenType)
          ? { screenType: parseDemoScreenType(registeredData.screenType) }
          : {}),
        allowedModules: versionSettings.allowedModules[appVersion],
        ...(registrationDetails ? { registrationDetails } : {}),
      };
    } else {
      const data = licenseData;
      const expiresAt = licenseExpiresAt;
      if (data?.revoked === true) {
        responsePayload = { active: false, expiresAt: null, revoked: true, ...requestState };
      } else if (data?.activationRequired === true) {
        responsePayload = {
          active: false,
          expiresAt,
          pendingActivation: true,
        };
      } else if (expiresAt && Date.parse(expiresAt) > Date.now()) {
        const requestId = String(data?.requestId || '');
        const requestSnapshot = requestId
          ? await db.collection('demoRequests').doc(requestId).get()
          : null;
        const requestData = requestSnapshot?.data();
        const appVersion =
          APP_VERSIONS.find((version) => version === data?.appVersion) ||
          APP_VERSIONS.find((version) => version === requestData?.appVersion) ||
          'Standard';
        const screenType =
          parseDemoScreenType(data?.screenType) ||
          parseDemoScreenType(requestData?.screenType) ||
          'pos';
        const versionSettings = await getVersionControlSettings(db);
        responsePayload = {
          active: true,
          expiresAt,
          appVersion,
          screenType,
          allowedModules: versionSettings.allowedModules[appVersion],
        };
      } else {
        responsePayload = { active: false, expiresAt, ...requestState };
      }
    }
    const networkBytesSent = Buffer.byteLength(JSON.stringify(responsePayload));

    try {
      await storeDemoStatusActivity(
        db,
        activityRef,
        systemCode,
        eventType,
        networkBytesReceived,
        networkBytesSent,
        systemInfo,
        defaultAdminCredentialsInUse
      );
    } catch (error) {
      console.error('Failed to store demo-system activity in Firestore:', error);
    }

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
});

const requirePortalAdmin: RequestHandler = (req, res, next) => {
  if (!adminAuth || !firestore) {
    res.status(503).json({
      error: firebaseSetupError || 'Firebase Admin is not configured.',
    });
    return;
  }

  const authorization = req.header('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Sign in as aptadmin to continue.' });
    return;
  }
  if (!portalAdminEmail) {
    res.status(503).json({ error: 'Set VITE_ADMIN_LOGIN_EMAIL to the allowed portal administrator email.' });
    return;
  }

  const auth = adminAuth;
  const db = firestore;
  void (async () => {
    let decoded: DecodedIdToken;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: 'Your Firebase sign-in has expired. Sign in again.' });
      return;
    }
    if (decoded.email?.trim().toLowerCase() !== portalAdminEmail) {
      res.status(403).json({ error: `Only ${portalAdminEmail} can access this portal.` });
      return;
    }
    const adminRecord = await db.collection('portalAdmins').doc(decoded.uid).get();
    const adminData = adminRecord.data();
    if (
      !adminRecord.exists ||
      adminData?.active !== true ||
      typeof adminData.username !== 'string' ||
      adminData.username.toLowerCase() !== 'aptadmin'
    ) {
      res.status(403).json({ error: 'This Firebase account is not authorized as aptadmin.' });
      return;
    }

    res.locals.adminUid = decoded.uid;
    res.locals.adminUsername = adminData.username || 'aptadmin';
    next();
  })().catch(next);
};

app.use('/api/admin', requirePortalAdmin);

function getServices(): { auth: Auth; db: Firestore } {
  if (!adminAuth || !firestore) {
    throw new Error(firebaseSetupError || 'Firebase Admin is not configured.');
  }
  return { auth: adminAuth, db: firestore };
}

function toIsoDate(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function parseOptionalIsoDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00.000Z`) : null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !date ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new PortalRequestError(400, `Enter a valid ${field} date.`);
  }
  return value;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function parseDemoSystemInfo(value: unknown): DemoSystemInfo | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const info: DemoSystemInfo = {
    ...(typeof data.hostname === 'string' ? { hostname: data.hostname.trim().slice(0, 255) } : {}),
    ...(typeof data.osPlatform === 'string' ? { osPlatform: data.osPlatform.trim().slice(0, 80) } : {}),
    ...(typeof data.osRelease === 'string' ? { osRelease: data.osRelease.trim().slice(0, 80) } : {}),
    ...(typeof data.architecture === 'string' ? { architecture: data.architecture.trim().slice(0, 40) } : {}),
    ...(typeof data.cpuModel === 'string' ? { cpuModel: data.cpuModel.trim().slice(0, 160) } : {}),
    ...(typeof data.cpuCores === 'number' && Number.isInteger(data.cpuCores) && data.cpuCores >= 1 && data.cpuCores <= 512
      ? { cpuCores: data.cpuCores }
      : {}),
    ...(typeof data.totalMemoryGb === 'number' && Number.isFinite(data.totalMemoryGb) && data.totalMemoryGb >= 0 && data.totalMemoryGb <= 4096
      ? { totalMemoryGb: data.totalMemoryGb }
      : {}),
  };
  return Object.keys(info).length ? info : undefined;
}

function historyRecords(value: unknown): DocumentData[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is DocumentData =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
  );
}

function mapDeviceHistory(value: unknown): DeviceHistoryEntry[] {
  return historyRecords(value).flatMap((entry) => {
    if (typeof entry.event !== 'string') return [];
    return [{
      event: entry.event,
      at: toIsoDate(entry.at),
      ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
      ...(typeof entry.businessName === 'string' ? { businessName: entry.businessName } : {}),
    }];
  });
}

function mapLicenseHistory(value: unknown): DeviceLicenseHistoryEntry[] {
  return historyRecords(value).flatMap((entry) => {
    const appVersion = APP_VERSIONS.find((version) => version === entry.appVersion);
    if (!appVersion) return [];
    const licenseType = entry.licenseType === 'demo'
      ? 'demo' as const
      : entry.licenseType === 'commercial'
        ? 'commercial' as const
        : 'registered' as const;
    return [{
      licenseType,
      label: typeof entry.label === 'string'
        ? entry.label
        : licenseType === 'demo' ? 'Demo License' : 'Registered License',
      appVersion,
      assignedAt: toIsoDate(entry.assignedAt),
      activatedAt: toIsoDate(entry.activatedAt),
      expiresAt: toIsoDate(entry.expiresAt),
      endedAt: toIsoDate(entry.endedAt),
    }];
  });
}

function mapDeviceTimeline(data: DocumentData) {
  const firstActivatedAt = toIsoDate(data.firstActivatedAt) || toIsoDate(data.activatedAt);
  const deviceHistory = mapDeviceHistory(data.deviceHistory);
  if (firstActivatedAt && !deviceHistory.some((entry) => entry.event === 'first_activation')) {
    deviceHistory.push({
      event: 'first_activation',
      at: firstActivatedAt,
      source: typeof data.businessId === 'string' ? 'commercial' : 'registered',
    });
  }
  const licenseHistory = mapLicenseHistory(data.licenseHistory);
  const appVersion = APP_VERSIONS.find((version) => version === data.appVersion);
  if (!licenseHistory.length && appVersion) {
    const commercial = typeof data.businessId === 'string';
    licenseHistory.push({
      licenseType: commercial ? 'commercial' : 'registered',
      label: typeof data.businessName === 'string'
        ? data.businessName
        : commercial ? 'Commercial License' : 'Registered License',
      appVersion,
      assignedAt: toIsoDate(data.registeredAt) || toIsoDate(data.convertedAt),
      activatedAt: toIsoDate(data.activatedAt),
      expiresAt: null,
      endedAt: null,
    });
  }
  return { firstActivatedAt, deviceHistory, licenseHistory };
}

async function storeDemoStatusActivity(
  db: Firestore,
  licenseRef: DocumentReference,
  systemCode: string,
  eventType: 'login' | 'check',
  networkBytesReceived: number,
  networkBytesSent: number,
  systemInfo?: DemoSystemInfo,
  defaultAdminCredentialsInUse?: boolean
): Promise<void> {
  const telemetryRef = db.collection('demoSystemTelemetry').doc(systemCodeId(systemCode));
  const loginTime = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(telemetryRef, {
    systemCode,
    totalStatusChecks: FieldValue.increment(1),
    networkBytesReceived: FieldValue.increment(networkBytesReceived),
    networkBytesSent: FieldValue.increment(networkBytesSent),
    lastStatusCheckAt: loginTime,
    updatedAt: loginTime,
    ...(typeof defaultAdminCredentialsInUse === 'boolean'
      ? {
          defaultAdminCredentialsInUse,
          defaultAdminCredentialsCheckedAt: loginTime,
        }
      : {}),
    ...(eventType === 'login'
      ? {
          totalLogins: FieldValue.increment(1),
          lastLoggedInAt: loginTime,
          ...(systemInfo ? { systemInfo } : {}),
        }
      : {}),
  }, { merge: true });

  if (eventType === 'login') {
    batch.set(licenseRef, { lastLoggedInAt: loginTime }, { merge: true });
    batch.set(telemetryRef.collection('logins').doc(), {
      systemCode,
      loggedInAt: loginTime,
      networkBytesReceived,
      networkBytesSent,
      ...(systemInfo ? { systemInfo } : {}),
    });
  }
  await batch.commit();
}

function parseUserType(value: unknown): UserType | null {
  return value === 'current' || value === 'demo' ? value : null;
}

function parseUserRole(value: unknown): UserRole | null {
  return value === 'cashier' || value === 'custom' ? value : null;
}

const DEMO_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
const VERSION_CONTROL_SCHEMA_VERSION = 4;
const MODULES_ADDED_IN_VERSION_2: AppModuleId[] = [
  'sales-order',
  'sales-quotation',
  'purchase-order',
  'purchase-quotation',
  'goods-delivery',
  'goods-receipt',
  'organization-hr',
  'salary-process',
];
const MODULES_ADDED_IN_VERSION_3: AppModuleId[] = ['sales'];
const MODULES_ADDED_IN_VERSION_4: AppModuleId[] = ['settings'];

function defaultVersionControlSettings(): VersionControlSettings {
  const allModules = APP_MODULES.map((module) => module.id);
  return {
    allowedModules: {
      Soft: [...allModules],
      Silver: [...allModules],
      Standard: [...allModules],
    },
    updatedAt: null,
  };
}

function parseModuleList(value: unknown): AppModuleId[] {
  if (!Array.isArray(value)) {
    throw new Error('Each app version must have a list of allowed modules.');
  }
  const modules = value.map((module) => {
    const knownModule = typeof module === 'string'
      ? APP_MODULES.find((known) => known.id === module)
      : undefined;
    if (!knownModule) {
      throw new Error('The module list contains an invalid module.');
    }
    return knownModule.id;
  });
  return [...new Set(modules)];
}

async function getVersionControlSettings(db: Firestore): Promise<VersionControlSettings> {
  const snapshot = await db.collection('versionControl').doc('settings').get();
  if (!snapshot.exists) return defaultVersionControlSettings();

  const data = snapshot.data();
  const source = data?.allowedModules;
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new Error('The stored version control settings are invalid.');
  }
  const modules = source as Record<string, unknown>;
  const storedSchemaVersion =
    typeof data?.moduleSchemaVersion === 'number' &&
    Number.isInteger(data.moduleSchemaVersion)
      ? data.moduleSchemaVersion
      : 1;
  const parseAllowedModules = (value: unknown) => {
    const parsedModules = parseModuleList(value);
    return [
      ...new Set([
        ...parsedModules,
        ...(storedSchemaVersion < 2 ? MODULES_ADDED_IN_VERSION_2 : []),
        ...(storedSchemaVersion < 3 ? MODULES_ADDED_IN_VERSION_3 : []),
        ...(storedSchemaVersion < 4 ? MODULES_ADDED_IN_VERSION_4 : []),
      ]),
    ];
  };
  const allowedModules: VersionModulePolicy = {
    Soft: parseAllowedModules(modules.Soft),
    Silver: parseAllowedModules(modules.Silver),
    Standard: parseAllowedModules(modules.Standard),
  };
  return {
    allowedModules,
    updatedAt: toIsoDate(data?.updatedAt),
  };
}

class PortalRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'PortalRequestError';
  }
}

function parseVersionModulePolicy(value: unknown): VersionModulePolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PortalRequestError(400, 'Choose allowed modules for each app version.');
  }
  const modules = value as Record<string, unknown>;
  try {
    return {
      Soft: parseModuleList(modules.Soft),
      Silver: parseModuleList(modules.Silver),
      Standard: parseModuleList(modules.Standard),
    };
  } catch (error) {
    throw new PortalRequestError(
      400,
      error instanceof Error ? error.message : 'The module policy is invalid.'
    );
  }
}

async function saveVersionModulePolicy(
  db: Firestore,
  allowedModules: VersionModulePolicy,
  updatedBy: string
): Promise<VersionControlSettings> {
  await db.collection('versionControl').doc('settings').set(
    {
      allowedModules,
      moduleSchemaVersion: VERSION_CONTROL_SCHEMA_VERSION,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    },
    { merge: true }
  );
  const snapshot = await db.collection('versionControl').doc('settings').get();
  const data = snapshot.data();
  return {
    allowedModules,
    updatedAt: toIsoDate(data?.updatedAt),
  };
}

function isSystemCode(value: unknown): value is string {
  return typeof value === 'string' && (/^\d{10}$/.test(value.trim()) || /^APT(?:-[A-Z0-9]{4}){5}$/.test(value.trim()));
}

function systemCodeId(systemCode: string): string {
  return createHash('sha256').update(`aptPOS-demo-system:${systemCode}`).digest('hex');
}

function businessSystemLimit(data: DocumentData, registeredSystemCount: number): number {
  const limit = data.systemLimit;
  return typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0
    ? limit
    : Math.max(registeredSystemCount, 1);
}

async function transactionSystemCount(
  transaction: Transaction,
  db: Firestore,
  businessId: string,
  business: DocumentData
): Promise<number> {
  const count = business.registeredSystemCount;
  if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
    return count;
  }
  const systems = await transaction.get(
    db.collection('registeredSystems').where('businessId', '==', businessId)
  );
  return systems.size;
}

function registrationEncryptionKey(): Buffer {
  if (!versionControlApiKey) {
    throw new PortalRequestError(503, 'VERSION_CONTROL_API_KEY is required for registered-system activation.');
  }
  return createHash('sha256')
    .update('aptpos-registration-credentials:v1:')
    .update(versionControlApiKey)
    .digest();
}

function encryptRegistrationCredentials(username: string, password: string) {
  return encryptRegistrationPayload(JSON.stringify({ username, password }));
}

function encryptRegistrationPayload(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', registrationEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  };
}

function decryptRegistrationPayload(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('iv' in value) ||
    typeof value.iv !== 'string' ||
    !('tag' in value) ||
    typeof value.tag !== 'string' ||
    !('data' in value) ||
    typeof value.data !== 'string'
  ) {
    throw new Error('Stored registration details are invalid.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    registrationEncryptionKey(),
    Buffer.from(value.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function decryptRegistrationCredentials(value: unknown): { username: string; password: string } {
  const credentials: unknown = JSON.parse(decryptRegistrationPayload(value));
  if (
    typeof credentials !== 'object' ||
    credentials === null ||
    !('username' in credentials) ||
    typeof credentials.username !== 'string' ||
    !('password' in credentials) ||
    typeof credentials.password !== 'string'
  ) {
    throw new Error('Stored registration credentials are invalid.');
  }
  return { username: credentials.username, password: credentials.password };
}

function demoKeyHash(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex');
}

function registrationKeyHash(key: string): string {
  return createHash('sha256').update(`aptPOS-registration-key:v1:${key.trim()}`).digest('hex');
}

function isRegistrationKeyValid(storedHash: unknown, key: string): boolean {
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const provided = Buffer.from(registrationKeyHash(key), 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function businessLicenseKeyHash(key: string): string {
  if (!versionControlApiKey) {
    throw new PortalRequestError(503, 'VERSION_CONTROL_API_KEY is required for business registration.');
  }
  return createHmac('sha256', versionControlApiKey)
    .update('aptPOS-business-license:v1:')
    .update(key.trim())
    .digest('hex');
}

function isBusinessLicenseKeyValid(storedHash: unknown, key: string): boolean {
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const provided = Buffer.from(businessLicenseKeyHash(key), 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function isRegistrationKeyInput(key: string): boolean {
  return /^\d{16}$/.test(key) || (key.length >= 24 && key.length <= 128);
}

function createNumericLicenseKey(): string {
  let key = '';
  while (key.length < 16) {
    for (const byte of randomBytes(32)) {
      if (key.length === 0) {
        if (byte >= 252) continue;
        key += String((byte % 9) + 1);
      } else {
        if (byte >= 250) continue;
        key += String(byte % 10);
      }
      if (key.length === 16) return key;
    }
  }
  return key;
}

async function createUniqueBusinessLicenseKey(db: Firestore): Promise<{ key: string; hash: string }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const key = createNumericLicenseKey();
    const hash = businessLicenseKeyHash(key);
    const duplicate = await db.collection('registeredBusinesses')
      .where('licenseKeyHash', '==', hash)
      .limit(1)
      .get();
    if (duplicate.empty) return { key, hash };
  }
  throw new Error('Could not generate a unique business license key. Please retry.');
}

function createDemoKey(): string {
  const value = (BigInt(`0x${randomBytes(8).toString('hex')}`) % 900000000000n + 100000000000n).toString();
  return value;
}

function mapDemoRequest(
  id: string,
  data: Record<string, unknown>,
  licenseData?: Record<string, unknown>,
  telemetryData?: Record<string, unknown>,
  registeredData?: Record<string, unknown>
) {
  const firstActivatedAt =
    toIsoDate(licenseData?.firstActivatedAt) ||
    toIsoDate(data.firstActivatedAt) ||
    toIsoDate(data.redeemedAt);
  const licenseHistory = mapLicenseHistory(licenseData?.licenseHistory);
  if (!licenseHistory.length && licenseData?.activatedAt instanceof Timestamp) {
    licenseHistory.push({
      licenseType: 'demo',
      label: data.requestType === 'extension' ? 'Demo Extension' : 'Demo License',
      appVersion:
        APP_VERSIONS.find((version) => version === licenseData.appVersion) ||
        APP_VERSIONS.find((version) => version === data.appVersion) ||
        'Standard',
      assignedAt: toIsoDate(data.reviewedAt),
      activatedAt: firstActivatedAt,
      expiresAt: toIsoDate(licenseData.expiresAt),
      endedAt: null,
    });
  }
  const deviceHistory = mapDeviceHistory(licenseData?.deviceHistory);
  if (firstActivatedAt && !deviceHistory.some((entry) => entry.event === 'first_activation')) {
    deviceHistory.push({ event: 'first_activation', at: firstActivatedAt, source: 'demo' });
  }
  const licenseExpiresAt = licenseData?.revoked === true
    ? null
    : toIsoDate(licenseData?.expiresAt);
  return {
    id,
    requestType: data.requestType === 'extension' ? 'extension' as const : 'demo' as const,
    systemCode: String(data.systemCode || ''),
    requestedBy: String(data.requestedBy || ''),
    status: data.status === 'approved' || data.status === 'rejected'
      ? data.status
      : 'pending' as const,
    deactivatedAt: toIsoDate(data.deactivatedAt),
    requestedAt: toIsoDate(data.requestedAt),
    reviewedAt: toIsoDate(data.reviewedAt),
    reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : undefined,
    redeemedAt: toIsoDate(data.redeemedAt),
    expiresAt: licenseExpiresAt || toIsoDate(data.expiresAt),
    lastLoggedInAt: toIsoDate(telemetryData?.lastLoggedInAt) || toIsoDate(licenseData?.lastLoggedInAt),
    totalLogins: numberOrZero(telemetryData?.totalLogins),
    totalStatusChecks: numberOrZero(telemetryData?.totalStatusChecks),
    networkBytesReceived: numberOrZero(telemetryData?.networkBytesReceived),
    networkBytesSent: numberOrZero(telemetryData?.networkBytesSent),
    systemInfo: parseDemoSystemInfo(telemetryData?.systemInfo),
    registeredSystem: registeredData?.status === 'active' || registeredData?.status === 'pending_activation',
    registrationStatus: registeredData?.status === 'pending_activation'
      ? 'pending_activation' as const
      : registeredData?.status === 'active'
        ? 'active' as const
        : undefined,
    registeredVersion: APP_VERSIONS.find((version) => version === registeredData?.appVersion),
    appVersion:
      APP_VERSIONS.find((version) => version === licenseData?.appVersion) ||
      APP_VERSIONS.find((version) => version === data.appVersion),
    screenType:
      parseDemoScreenType(licenseData?.screenType) || parseDemoScreenType(data.screenType),
    keyUsed: data.keyUsed === true,
    hardwareInfo: typeof data.hardwareInfo === 'object' && data.hardwareInfo !== null ? data.hardwareInfo : undefined,
    firstActivatedAt,
    deviceHistory,
    licenseHistory,
    convertedToRegistered: data.convertedToRegistered === true,
  };
}

function parseDemoScreenType(value: unknown): DemoScreenType | undefined {
  return value === 'pos' || value === 'rpos' ? value : undefined;
}

app.get('/api/admin/session', (_req, res) => {
  res.json({ username: res.locals.adminUsername || 'aptadmin' });
});

app.get('/api/registration/version-control', async (req, res, next) => {
  const rateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/version-control');
  if (!rateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${rateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const { db } = getServices();
    res.json(await getVersionControlSettings(db));
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration/key/prepare', async (req, res, next) => {
  const ipRateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/key/prepare');
  if (!ipRateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${ipRateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    const registrationKey = typeof req.body?.registrationKey === 'string'
      ? req.body.registrationKey.trim()
      : '';
    if (!isSystemCode(systemCode) || !isRegistrationKeyInput(registrationKey)) {
      throw new PortalRequestError(400, 'Enter a valid system code and registration key.');
    }
    const systemRateLimit = checkRegistrationRateLimit(
      `${clientIp(req)}:${systemCode}`,
      '/api/registration/key/prepare-system'
    );
    if (!systemRateLimit.allowed) {
      res.status(429).json({ error: `Too many requests. Try again in ${systemRateLimit.retryAfter} second(s).` });
      return;
    }

    const { db } = getServices();
    const snapshot = await db.collection('registeredSystems').doc(systemCodeId(systemCode)).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.systemCode !== systemCode) {
      throw new PortalRequestError(404, 'No registration was found for this system code.');
    }
    const businessId = typeof data.businessId === 'string' ? data.businessId : '';
    const businessSnapshot = businessId
      ? await db.collection('registeredBusinesses').doc(businessId).get()
      : null;
    const businessData = businessSnapshot?.data();
    if (businessId && !businessSnapshot?.exists) {
      throw new PortalRequestError(404, 'The registered business record was not found.');
    }
    if (businessData?.onHold === true) {
      throw new PortalRequestError(423, 'This business license is on hold. Contact your service provider.');
    }
    const keyValid = businessData
      ? isBusinessLicenseKeyValid(businessData.licenseKeyHash, registrationKey)
      : isRegistrationKeyValid(data.registrationKeyHash, registrationKey);
    if (!keyValid) {
      throw new PortalRequestError(401, 'The registration key is invalid for this system.');
    }
    const appVersion = APP_VERSIONS.find((version) => version === (businessData?.appVersion || data.appVersion));
    if (!appVersion) throw new Error('The registered system has an invalid app version.');
    const username = typeof businessData?.username === 'string'
      ? businessData.username
      : typeof data.username === 'string' ? data.username : '';
    const registrationDetails = businessData
      ? {
          businessName: String(businessData.businessName || ''),
          address: String(businessData.address || ''),
          mobileNumber: String(businessData.mobileNumber || ''),
          systemCode,
          username,
          appVersion,
          amcStartDate: typeof businessData.amcStartDate === 'string'
            ? businessData.amcStartDate
            : null,
          amcEndDate: typeof businessData.amcEndDate === 'string'
            ? businessData.amcEndDate
            : null,
          amcNotes: typeof businessData.amcNotes === 'string' ? businessData.amcNotes : '',
        }
      : undefined;

    const encryptedCredentials = businessData?.credentialsCiphertext || data.credentialsCiphertext;
    const hasEncryptedCredentials =
      typeof encryptedCredentials === 'object' &&
      encryptedCredentials !== null &&
      encryptedCredentials.version === 1 &&
      typeof encryptedCredentials.iv === 'string' &&
      typeof encryptedCredentials.tag === 'string' &&
      typeof encryptedCredentials.data === 'string';
    const credentials = hasEncryptedCredentials
      ? decryptRegistrationCredentials(encryptedCredentials)
      : undefined;

    res.set('Cache-Control', 'no-store');
    if (data.status === 'active') {
      res.json({
        active: true,
        appVersion,
        username,
        ...(credentials ? { credentials } : {}),
        ...(registrationDetails ? { registrationDetails } : {}),
      });
      return;
    }
    if (data.status !== 'pending_activation') {
      throw new PortalRequestError(409, 'This registration is no longer available.');
    }

    if (!hasEncryptedCredentials) {
      throw new Error('The registration credentials are unavailable.');
    }
    res.json({
      active: false,
      appVersion,
      username,
      credentials,
      ...(registrationDetails ? { registrationDetails } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration/key/activate', async (req, res, next) => {
  const ipRateLimit = checkRegistrationRateLimit(clientIp(req), '/api/registration/key/activate');
  if (!ipRateLimit.allowed) {
    res.status(429).json({ error: `Too many requests. Try again in ${ipRateLimit.retryAfter} second(s).` });
    return;
  }
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    const registrationKey = typeof req.body?.registrationKey === 'string'
      ? req.body.registrationKey.trim()
      : '';
    if (!isSystemCode(systemCode) || !isRegistrationKeyInput(registrationKey)) {
      throw new PortalRequestError(400, 'Enter a valid system code and registration key.');
    }
    const systemRateLimit = checkRegistrationRateLimit(
      `${clientIp(req)}:${systemCode}`,
      '/api/registration/key/activate-system'
    );
    if (!systemRateLimit.allowed) {
      res.status(429).json({ error: `Too many requests. Try again in ${systemRateLimit.retryAfter} second(s).` });
      return;
    }

    const { db } = getServices();
    const registrationRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(registrationRef);
      const data = snapshot.data();
      if (!snapshot.exists || data?.systemCode !== systemCode) {
        throw new PortalRequestError(404, 'No registration was found for this system code.');
      }
      const businessId = typeof data.businessId === 'string' ? data.businessId : '';
      const businessRef = businessId
        ? db.collection('registeredBusinesses').doc(businessId)
        : null;
      const businessSnapshot = businessRef ? await transaction.get(businessRef) : null;
      const businessData = businessSnapshot?.data();
      if (businessId && !businessSnapshot?.exists) {
        throw new PortalRequestError(404, 'The registered business record was not found.');
      }
      if (businessData?.onHold === true) {
        throw new PortalRequestError(423, 'This business license is on hold. Contact your service provider.');
      }
      const keyValid = businessData
        ? isBusinessLicenseKeyValid(businessData.licenseKeyHash, registrationKey)
        : isRegistrationKeyValid(data.registrationKeyHash, registrationKey);
      if (!keyValid) {
        throw new PortalRequestError(401, 'The registration key is invalid for this system.');
      }
      const appVersion = APP_VERSIONS.find((version) => version === (businessData?.appVersion || data.appVersion));
      if (!appVersion) throw new Error('The registered system has an invalid app version.');
      if (data.status === 'pending_activation') {
        const activationTime = Timestamp.now();
        const firstActivatedAt = data.firstActivatedAt instanceof Timestamp
          ? data.firstActivatedAt
          : data.activatedAt instanceof Timestamp
            ? data.activatedAt
            : activationTime;
        const deviceHistory = historyRecords(data.deviceHistory);
        if (!deviceHistory.some((entry) => entry.event === 'first_activation')) {
          deviceHistory.push({
            event: 'first_activation',
            at: firstActivatedAt,
            source: businessData ? 'commercial' : 'registered',
          });
        }
        deviceHistory.push({
          event: 'commercial_activated',
          at: activationTime,
          source: businessData ? 'commercial' : 'registered',
        });
        const licenseHistory = historyRecords(data.licenseHistory);
        const licenseType = businessData ? 'commercial' : 'registered';
        const currentLicenseIndex = licenseHistory.map((entry) => entry.licenseType)
          .lastIndexOf(licenseType);
        if (currentLicenseIndex >= 0) {
          const currentLicense = licenseHistory[currentLicenseIndex];
          licenseHistory[currentLicenseIndex] = {
            ...currentLicense,
            activatedAt: currentLicense.activatedAt instanceof Timestamp
              ? currentLicense.activatedAt
              : activationTime,
          };
        } else {
          licenseHistory.push({
            licenseType,
            label: businessData ? String(businessData.businessName || 'Commercial License') : 'Registered License',
            businessId: businessData ? businessId : undefined,
            appVersion,
            assignedAt: data.registeredAt instanceof Timestamp ? data.registeredAt : activationTime,
            activatedAt: activationTime,
            expiresAt: null,
            endedAt: null,
          });
        }
        transaction.update(registrationRef, {
          status: 'active',
          activatedAt: FieldValue.serverTimestamp(),
          firstActivatedAt,
          deviceHistory,
          licenseHistory,
          ...(businessData ? {} : { credentialsCiphertext: FieldValue.delete() }),
        });
      } else if (data.status !== 'active') {
        throw new PortalRequestError(409, 'This registration is no longer available.');
      }
      return {
        registered: true as const,
        appVersion,
        ...(businessData ? {
          registrationDetails: {
            businessName: String(businessData.businessName || ''),
            address: String(businessData.address || ''),
            mobileNumber: String(businessData.mobileNumber || ''),
            systemCode,
            username: String(businessData.username || ''),
            appVersion,
          },
        } : {}),
      };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/version-control', async (_req, res, next) => {
  try {
    const { db } = getServices();
    res.json(await getVersionControlSettings(db));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/version-control', async (req, res, next) => {
  try {
    const { db } = getServices();
    const input = req.body as Record<string, unknown>;
    const allowedModules = parseVersionModulePolicy(input.allowedModules);
    res.json(await saveVersionModulePolicy(db, allowedModules, String(res.locals.adminUid)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/users', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const snapshot = await db.collection('appUsers').get();
    const users = snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          uid: document.id,
          username: String(data.username || ''),
          email: String(data.email || ''),
          displayName: String(data.displayName || ''),
          role: parseUserRole(data.role) || 'cashier',
          userType: parseUserType(data.userType) || 'current',
          disabled: data.disabled === true,
          createdAt: toIsoDate(data.createdAt),
          appVersion: APP_VERSIONS.find((version) => version === data.appVersion),
        };
      })
      .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));
    res.json(users);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/registered-systems', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const snapshot = await db.collection('registeredSystems').get();
    const systems = snapshot.docs
      .map((document) => {
        const data = document.data();
        const appVersion = APP_VERSIONS.find((version) => version === data.appVersion);
        const status = data.status === 'active' || data.status === 'pending_activation'
          ? data.status
          : null;
        const systemCode = typeof data.systemCode === 'string'
          ? data.systemCode.trim().toUpperCase()
          : '';
        if (!status || !appVersion || !isSystemCode(systemCode)) return null;
        return {
          systemCode,
          username: typeof data.username === 'string' ? data.username : '',
          appVersion,
          status,
          screenType: parseDemoScreenType(data.screenType),
          registeredAt: toIsoDate(data.registeredAt) || toIsoDate(data.convertedAt),
          activatedAt: toIsoDate(data.activatedAt),
          ...mapDeviceTimeline(data),
        };
      })
      .filter((system): system is NonNullable<typeof system> => system !== null)
      .sort((left, right) => (right.registeredAt || '').localeCompare(left.registeredAt || ''));
    res.json(systems);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/default-credential-audit', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const [businessesSnapshot, systemsSnapshot, telemetrySnapshot] = await Promise.all([
      db.collection('registeredBusinesses').get(),
      db.collection('registeredSystems').get(),
      db.collection('demoSystemTelemetry').get(),
    ]);

    const businessesById = new Map(
      businessesSnapshot.docs.map((document) => {
        const data = document.data();
        return [document.id, typeof data.businessName === 'string' ? data.businessName : 'Registered business'] as const;
      })
    );
    const telemetryBySystemCode = new Map(
      telemetrySnapshot.docs.flatMap((document) => {
        const data = document.data();
        const systemCode = typeof data.systemCode === 'string'
          ? data.systemCode.trim().toUpperCase()
          : '';
        return isSystemCode(systemCode) ? [[systemCode, data] as const] : [];
      })
    );

    const records: DefaultCredentialAuditRecord[] = systemsSnapshot.docs.flatMap((document) => {
      const data = document.data();
      const systemCode = typeof data.systemCode === 'string'
        ? data.systemCode.trim().toUpperCase()
        : '';
      const registrationStatus = data.status === 'active' || data.status === 'pending_activation'
        ? data.status
        : null;
      if (!isSystemCode(systemCode) || !registrationStatus) return [];

      const telemetry = telemetryBySystemCode.get(systemCode);
      const businessId = typeof data.businessId === 'string' ? data.businessId : '';
      return [{
        systemCode,
        businessName: businessId
          ? businessesById.get(businessId) || 'Registered business'
          : 'Legacy registration',
        systemType: 'registered' as const,
        registrationStatus,
        defaultAdminCredentialsInUse: typeof telemetry?.defaultAdminCredentialsInUse === 'boolean'
          ? telemetry.defaultAdminCredentialsInUse
          : null,
        checkedAt: toIsoDate(telemetry?.defaultAdminCredentialsCheckedAt),
      }];
    });

    const registeredSystemCodes = new Set(records.map((record) => record.systemCode));
    for (const [systemCode, telemetry] of telemetryBySystemCode) {
      if (registeredSystemCodes.has(systemCode)) continue;
      records.push({
        systemCode,
        businessName: 'Demo / unregistered system',
        systemType: 'unregistered',
        registrationStatus: 'unregistered',
        defaultAdminCredentialsInUse: typeof telemetry.defaultAdminCredentialsInUse === 'boolean'
          ? telemetry.defaultAdminCredentialsInUse
          : null,
        checkedAt: toIsoDate(telemetry.defaultAdminCredentialsCheckedAt),
      });
    }

    records.sort((left, right) => {
      const rank = (value: boolean | null) => value === true ? 0 : value === null ? 1 : 2;
      return rank(left.defaultAdminCredentialsInUse) - rank(right.defaultAdminCredentialsInUse) ||
        left.systemCode.localeCompare(right.systemCode);
    });
    res.json(records);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/registered-businesses', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const [businessSnapshot, systemsSnapshot] = await Promise.all([
      db.collection('registeredBusinesses').get(),
      db.collection('registeredSystems').get(),
    ]);
    const businessIds = new Set(businessSnapshot.docs.map((document) => document.id));
    const systemsByBusiness = new Map<string, typeof systemsSnapshot.docs>();
    const legacyBusinesses = systemsSnapshot.docs.flatMap((document) => {
      const data = document.data();
      const businessId = typeof data.businessId === 'string' ? data.businessId : '';
      const systemCode = typeof data.systemCode === 'string' ? data.systemCode.trim().toUpperCase() : '';
      const appVersion = APP_VERSIONS.find((version) => version === data.appVersion);
      const status = data.status === 'active' || data.status === 'pending_activation' ? data.status : null;
      if (businessId && businessIds.has(businessId)) {
        const systems = systemsByBusiness.get(businessId) || [];
        systems.push(document);
        systemsByBusiness.set(businessId, systems);
        return [];
      }
      if (!status || !appVersion || !isSystemCode(systemCode)) return [];
      return [{
        id: `legacy:${document.id}`,
        legacy: true,
        businessName: typeof data.username === 'string' ? data.username : 'Legacy registration',
        address: '',
        mobileNumber: '',
        username: typeof data.username === 'string' ? data.username : '',
        appVersion,
        status,
        systemLimit: 1,
        registeredAt: toIsoDate(data.convertedAt),
        activatedAt: toIsoDate(data.activatedAt),
        systemCodes: [{
          systemCode,
          status,
          screenType: parseDemoScreenType(data.screenType),
          registeredAt: toIsoDate(data.convertedAt),
          activatedAt: toIsoDate(data.activatedAt),
          ...mapDeviceTimeline(data),
        }],
      }];
    });
    const businesses = businessSnapshot.docs.map((document) => {
      const data = document.data();
      const systems = (systemsByBusiness.get(document.id) || [])
        .map((systemDocument) => {
          const system = systemDocument.data();
          const systemCode = typeof system.systemCode === 'string' ? system.systemCode.trim().toUpperCase() : '';
          const status = system.status === 'active' || system.status === 'pending_activation' ? system.status : null;
          if (!status || !isSystemCode(systemCode)) return null;
          return {
            systemCode,
            status,
            screenType: parseDemoScreenType(system.screenType),
            registeredAt: toIsoDate(system.registeredAt),
            activatedAt: toIsoDate(system.activatedAt),
            ...mapDeviceTimeline(system),
          };
        })
        .filter((system): system is NonNullable<typeof system> => system !== null)
        .sort((left, right) => left.systemCode.localeCompare(right.systemCode));
      const appVersion = APP_VERSIONS.find((version) => version === data.appVersion);
      return {
        id: document.id,
        businessName: String(data.businessName || ''),
        address: String(data.address || ''),
        mobileNumber: String(data.mobileNumber || ''),
        username: String(data.username || ''),
        appVersion: appVersion || 'Standard',
        onHold: data.onHold === true,
        ...(typeof data.licenseKeyCiphertext === 'object' && data.licenseKeyCiphertext !== null
          ? { licenseNumber: decryptRegistrationPayload(data.licenseKeyCiphertext) }
          : {}),
        status: systems.some((system) => system.status === 'active') ? 'active' as const : 'pending_activation' as const,
        systemLimit: businessSystemLimit(data, systems.length),
        registeredAt: toIsoDate(data.createdAt),
        activatedAt: systems.map((system) => system.activatedAt).filter((value): value is string => Boolean(value)).sort().slice(-1)[0] || null,
        systemCodes: systems,
        amcStartDate: typeof data.amcStartDate === 'string' ? data.amcStartDate : null,
        amcEndDate: typeof data.amcEndDate === 'string' ? data.amcEndDate : null,
        amcNotes: typeof data.amcNotes === 'string' ? data.amcNotes : '',
      };
    });
    res.json([...businesses, ...legacyBusinesses].sort(
      (left, right) => (right.registeredAt || '').localeCompare(left.registeredAt || '')
    ));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/registered-businesses/:id', async (req, res, next) => {
  try {
    const { db } = getServices();
    if (req.params.id.startsWith('legacy:')) {
      const systemSnapshot = await db.collection('registeredSystems').doc(req.params.id.slice('legacy:'.length)).get();
      const data = systemSnapshot.data();
      if (!systemSnapshot.exists || !data) {
        throw new PortalRequestError(404, 'Registered system not found.');
      }
      const systemCode = String(data.systemCode || '').trim().toUpperCase();
      const appVersion = APP_VERSIONS.find((version) => version === data.appVersion) || 'Standard';
      const status = data.status === 'active' ? 'active' : 'pending_activation';
      res.json({
        id: req.params.id,
        legacy: true,
        businessName: String(data.username || 'Legacy registration'),
        address: '',
        mobileNumber: '',
        username: String(data.username || ''),
        appVersion,
        status,
        systemLimit: 1,
        registeredAt: toIsoDate(data.convertedAt),
        activatedAt: toIsoDate(data.activatedAt),
        systemCodes: [{
          systemCode,
          status,
          screenType: parseDemoScreenType(data.screenType),
          registeredAt: toIsoDate(data.convertedAt),
          activatedAt: toIsoDate(data.activatedAt),
          ...mapDeviceTimeline(data),
        }],
      });
      return;
    }

    const businessSnapshot = await db.collection('registeredBusinesses').doc(req.params.id).get();
    const data = businessSnapshot.data();
    if (!businessSnapshot.exists || !data) {
      throw new PortalRequestError(404, 'Registered business not found.');
    }
    const systemsSnapshot = await db.collection('registeredSystems')
      .where('businessId', '==', req.params.id)
      .get();
    const systemCodes = systemsSnapshot.docs
      .map((document) => {
        const system = document.data();
        const systemCode = typeof system.systemCode === 'string' ? system.systemCode.trim().toUpperCase() : '';
        const status = system.status === 'active' || system.status === 'pending_activation' ? system.status : null;
        if (!status || !isSystemCode(systemCode)) return null;
        return {
          systemCode,
          status,
          screenType: parseDemoScreenType(system.screenType),
          registeredAt: toIsoDate(system.registeredAt),
          activatedAt: toIsoDate(system.activatedAt),
          ...mapDeviceTimeline(system),
        };
      })
      .filter((system): system is NonNullable<typeof system> => system !== null)
      .sort((left, right) => left.systemCode.localeCompare(right.systemCode));
    const appVersion = APP_VERSIONS.find((version) => version === data.appVersion) || 'Standard';
    const credentials = decryptRegistrationCredentials(data.credentialsCiphertext);
    res.json({
      id: businessSnapshot.id,
      businessName: String(data.businessName || ''),
      address: String(data.address || ''),
      mobileNumber: String(data.mobileNumber || ''),
      username: String(data.username || ''),
      password: credentials.password,
      licenseKey: decryptRegistrationPayload(data.licenseKeyCiphertext),
      appVersion,
      onHold: data.onHold === true,
      status: systemCodes.some((system) => system.status === 'active') ? 'active' : 'pending_activation',
      systemLimit: businessSystemLimit(data, systemCodes.length),
      registeredAt: toIsoDate(data.createdAt),
      activatedAt: systemCodes.map((system) => system.activatedAt).filter((value): value is string => Boolean(value)).sort().slice(-1)[0] || null,
      systemCodes,
      amcStartDate: typeof data.amcStartDate === 'string' ? data.amcStartDate : null,
      amcEndDate: typeof data.amcEndDate === 'string' ? data.amcEndDate : null,
      amcNotes: typeof data.amcNotes === 'string' ? data.amcNotes : '',
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/registered-businesses/:id', async (req, res, next) => {
  try {
    const { db } = getServices();
    if (req.params.id.startsWith('legacy:')) {
      throw new PortalRequestError(400, 'Legacy registrations must be removed through their system code.');
    }

    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const businessSnapshot = await businessRef.get();
    if (!businessSnapshot.exists) {
      throw new PortalRequestError(404, 'Registered business not found.');
    }

    const systemsSnapshot = await db.collection('registeredSystems')
      .where('businessId', '==', req.params.id)
      .get();
    const refs: DocumentReference[] = [
      businessRef,
      ...systemsSnapshot.docs.map((document) => document.ref),
    ];

    for (let offset = 0; offset < refs.length; offset += 450) {
      const batch = db.batch();
      refs.slice(offset, offset + 450).forEach((reference) => batch.delete(reference));
      await batch.commit();
    }

    res.json({
      ok: true,
      deletedSystemCodes: systemsSnapshot.docs.length,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/registered-businesses', async (req, res, next) => {
  try {
    const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const mobileNumber = typeof req.body?.mobileNumber === 'string' ? req.body.mobileNumber.trim() : '';
    const appVersion = APP_VERSIONS.find((version) => version === req.body?.appVersion);
    const systemLimit = req.body?.systemLimit;
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const amcStartDate = parseOptionalIsoDate(req.body?.amcStartDate, 'AMC start');
    const amcEndDate = parseOptionalIsoDate(req.body?.amcEndDate, 'AMC end');
    if (!businessName || businessName.length > 120 || !address || address.length > 500) {
      throw new PortalRequestError(400, 'Enter a business name and address within the allowed lengths.');
    }
    if ((amcStartDate === null) !== (amcEndDate === null)) {
      throw new PortalRequestError(400, 'Enter both AMC dates or clear both dates.');
    }
    if (amcStartDate && amcEndDate && amcStartDate > amcEndDate) {
      throw new PortalRequestError(400, 'AMC end date must be on or after the start date.');
    }
    if (!/^[+\d\s()-]{5,24}$/.test(mobileNumber)) {
      throw new PortalRequestError(400, 'Enter a valid mobile number.');
    }
    if (!appVersion) {
      throw new PortalRequestError(400, 'Choose a valid software edition.');
    }
    if (typeof systemLimit !== 'number' || !Number.isSafeInteger(systemLimit) || systemLimit < 1) {
      throw new PortalRequestError(400, 'Enter a positive whole number of systems for this license.');
    }
    if (
      !/^[A-Za-z0-9._-]{1,32}$/.test(username) ||
      username.toLowerCase() === 'aptadmin' ||
      username.toLowerCase() === 'demo'
    ) {
      throw new PortalRequestError(400, 'Enter a 1-32 character POS username other than aptadmin or demo.');
    }
    if (!password.trim() || password.length > 128) {
      throw new PortalRequestError(400, 'Enter a POS password containing 1-128 characters.');
    }

    const { db } = getServices();
    const { key: licenseKey, hash: licenseKeyHash } = await createUniqueBusinessLicenseKey(db);
    const businessId = randomBytes(16).toString('hex');
    const businessRef = db.collection('registeredBusinesses').doc(businessId);
    const now = new Date().toISOString();
    const credentialsCiphertext = encryptRegistrationCredentials(username, password);
    const licenseKeyCiphertext = encryptRegistrationPayload(licenseKey);
    await db.runTransaction(async (transaction) => {
      const keySnapshot = await transaction.get(
        db.collection('registeredBusinesses').where('licenseKeyHash', '==', licenseKeyHash).limit(1)
      );
      if (!keySnapshot.empty) {
        throw new PortalRequestError(409, 'The generated license key already exists. Please retry registration.');
      }
      transaction.create(businessRef, {
        businessName,
        address,
        mobileNumber,
        appVersion,
        username,
        systemLimit,
        onHold: false,
        registeredSystemCount: 0,
        amcStartDate,
        amcEndDate,
        amcNotes: '',
        licenseKeyHash,
        licenseKeyCiphertext,
        credentialsCiphertext,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: String(res.locals.adminUid),
      });
    });

    res.status(201).json({
      id: businessId,
      businessName,
      address,
      mobileNumber,
      username,
      password,
      licenseKey,
      appVersion,
      status: 'pending_activation',
      systemLimit,
      registeredAt: now,
      activatedAt: null,
      systemCodes: [],
      amcStartDate,
      amcEndDate,
      amcNotes: '',
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id', async (req, res, next) => {
  try {
    const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
    const mobileNumber = typeof req.body?.mobileNumber === 'string' ? req.body.mobileNumber.trim() : '';
    const appVersion = APP_VERSIONS.find((version) => version === req.body?.appVersion);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!businessName || businessName.length > 120 || !address || address.length > 500) {
      throw new PortalRequestError(400, 'Enter a business name and address within the allowed lengths.');
    }
    if (!/^[+\d\s()-]{5,24}$/.test(mobileNumber)) {
      throw new PortalRequestError(400, 'Enter a valid mobile number.');
    }
    if (!appVersion) throw new PortalRequestError(400, 'Choose a valid version.');
    if (
      !/^[A-Za-z0-9._-]{1,32}$/.test(username) ||
      username.toLowerCase() === 'aptadmin' ||
      username.toLowerCase() === 'demo'
    ) {
      throw new PortalRequestError(400, 'Enter a 1-32 character POS username other than aptadmin or demo.');
    }
    if (password.length > 128 || (password.length > 0 && !password.trim())) {
      throw new PortalRequestError(400, 'A new POS password must contain 1-128 non-whitespace characters.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const systemsQuery = db.collection('registeredSystems').where('businessId', '==', req.params.id);
    let updatedPassword = '';
    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemsSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemsQuery),
      ]);
      const data = businessSnapshot.data();
      if (!businessSnapshot.exists || !data) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }
      if (systemsSnapshot.size > 450) {
        throw new PortalRequestError(409, 'This business has too many system codes to update at once.');
      }
      const currentCredentials = decryptRegistrationCredentials(data.credentialsCiphertext);
      updatedPassword = password || currentCredentials.password;
      const updatedCredentials = encryptRegistrationCredentials(username, updatedPassword);
      transaction.update(businessRef, {
        businessName,
        address,
        mobileNumber,
        appVersion,
        username,
        credentialsCiphertext: updatedCredentials,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const systemDocument of systemsSnapshot.docs) {
        transaction.update(systemDocument.ref, { appVersion, username });
      }
    });

    const [businessSnapshot, systemsSnapshot] = await Promise.all([
      businessRef.get(),
      systemsQuery.get(),
    ]);
    const data = businessSnapshot.data() || {};
    const systemCodes = systemsSnapshot.docs.map((document) => {
      const system = document.data();
      return {
        systemCode: String(system.systemCode || ''),
        status: system.status === 'active' ? 'active' as const : 'pending_activation' as const,
        screenType: parseDemoScreenType(system.screenType),
        registeredAt: toIsoDate(system.registeredAt),
        activatedAt: toIsoDate(system.activatedAt),
        ...mapDeviceTimeline(system),
      };
    });
    res.json({
      id: businessSnapshot.id,
      businessName,
      address,
      mobileNumber,
      username,
      password: updatedPassword,
      licenseKey: decryptRegistrationPayload(data.licenseKeyCiphertext),
      appVersion,
      onHold: data.onHold === true,
      status: systemCodes.some((system) => system.status === 'active') ? 'active' : 'pending_activation',
      systemLimit: businessSystemLimit(data, systemCodes.length),
      registeredAt: toIsoDate(data.createdAt),
      activatedAt: systemCodes.map((system) => system.activatedAt).filter((value): value is string => Boolean(value)).sort().slice(-1)[0] || null,
      systemCodes,
      amcStartDate: typeof data.amcStartDate === 'string' ? data.amcStartDate : null,
      amcEndDate: typeof data.amcEndDate === 'string' ? data.amcEndDate : null,
      amcNotes: typeof data.amcNotes === 'string' ? data.amcNotes : '',
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id/version', async (req, res, next) => {
  try {
    const appVersion = APP_VERSIONS.find((version) => version === req.body?.appVersion);
    if (!appVersion) throw new PortalRequestError(400, 'Choose a valid version.');

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const systemsQuery = db.collection('registeredSystems').where('businessId', '==', req.params.id);
    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemsSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemsQuery),
      ]);
      if (!businessSnapshot.exists) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }
      if (systemsSnapshot.size > 450) {
        throw new PortalRequestError(409, 'This business has too many system codes to update at once.');
      }
      transaction.update(businessRef, {
        appVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const systemDocument of systemsSnapshot.docs) {
        transaction.update(systemDocument.ref, { appVersion });
      }
    });

    res.json({ appVersion });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id/hold', async (req, res, next) => {
  try {
    if (typeof req.body?.onHold !== 'boolean') {
      throw new PortalRequestError(400, 'Choose whether to place the license on hold or resume it.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const businessSnapshot = await businessRef.get();
    if (!businessSnapshot.exists) {
      throw new PortalRequestError(404, 'Registered business not found.');
    }
    await businessRef.update({
      onHold: req.body.onHold,
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ onHold: req.body.onHold });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id/device-slots', async (req, res, next) => {
  try {
    const action = req.body?.action;
    if (action !== 'add' && action !== 'remove') {
      throw new PortalRequestError(400, 'Choose whether to add or remove a device slot.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const systemsQuery = db.collection('registeredSystems').where('businessId', '==', req.params.id);
    const result = await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemsSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemsQuery),
      ]);
      const business = businessSnapshot.data();
      if (!businessSnapshot.exists || !business) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }

      const registeredSystemCount = systemsSnapshot.size;
      const currentLimit = businessSystemLimit(business, registeredSystemCount);
      const systemLimit = action === 'add' ? currentLimit + 1 : currentLimit - 1;
      if (!Number.isSafeInteger(systemLimit)) {
        throw new PortalRequestError(409, 'The device slot limit cannot be increased further.');
      }
      if (action === 'remove' && systemLimit < Math.max(1, registeredSystemCount)) {
        throw new PortalRequestError(409, 'Device slots cannot be fewer than registered systems or one slot.');
      }

      transaction.update(businessRef, {
        systemLimit,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { systemLimit, registeredSystemCount };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id/amc', async (req, res, next) => {
  try {
    const amcStartDate = parseOptionalIsoDate(req.body?.amcStartDate, 'AMC start');
    const amcEndDate = parseOptionalIsoDate(req.body?.amcEndDate, 'AMC end');
    const amcNotes = typeof req.body?.amcNotes === 'string' ? req.body.amcNotes.trim() : null;
    if (amcNotes === null || amcNotes.length > 1000) {
      throw new PortalRequestError(400, 'AMC notes must be 1,000 characters or fewer.');
    }
    if ((amcStartDate === null) !== (amcEndDate === null)) {
      throw new PortalRequestError(400, 'Enter both AMC dates or clear both dates.');
    }
    if (amcStartDate && amcEndDate && amcStartDate > amcEndDate) {
      throw new PortalRequestError(400, 'AMC end date must be on or after the start date.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const businessSnapshot = await businessRef.get();
    if (!businessSnapshot.exists) {
      throw new PortalRequestError(404, 'Registered business not found.');
    }
    await businessRef.update({
      amcStartDate,
      amcEndDate,
      amcNotes,
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.json({ amcStartDate, amcEndDate, amcNotes });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/registered-businesses/:id/system-codes', async (req, res, next) => {
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) throw new PortalRequestError(400, 'Enter a valid system code.');

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const systemRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemRef),
      ]);
      const business = businessSnapshot.data();
      if (!businessSnapshot.exists || !business) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }
      if (systemSnapshot.exists) {
        throw new PortalRequestError(409, 'This system code is already registered.');
      }
      const currentCount = await transactionSystemCount(
        transaction,
        db,
        req.params.id,
        business
      );
      if (currentCount >= businessSystemLimit(business, currentCount)) {
        throw new PortalRequestError(409, 'This license has no available device slots.');
      }
      const appVersion = APP_VERSIONS.find((version) => version === business.appVersion);
      if (!appVersion) throw new Error('The commercial license has an invalid software edition.');
      const registeredAt = Timestamp.now();
      transaction.create(systemRef, {
        businessId: req.params.id,
        systemCode,
        appVersion,
        username: String(business.username || ''),
        screenType: 'pos',
        status: 'pending_activation',
        registeredAt,
        activatedAt: null,
        firstActivatedAt: null,
        deviceHistory: [{
          event: 'registered',
          at: registeredAt,
          source: 'commercial',
          businessName: String(business.businessName || ''),
        }],
        licenseHistory: [{
          licenseType: 'commercial',
          label: String(business.businessName || 'Commercial License'),
          businessId: req.params.id,
          appVersion,
          assignedAt: registeredAt,
          activatedAt: null,
          expiresAt: null,
          endedAt: null,
        }],
      });
      transaction.update(businessRef, {
        registeredSystemCount: currentCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/registered-businesses/:id/system-codes', async (req, res, next) => {
  try {
    const currentSystemCode = typeof req.body?.currentSystemCode === 'string'
      ? req.body.currentSystemCode.trim().toUpperCase()
      : '';
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(currentSystemCode) || !isSystemCode(systemCode) || currentSystemCode === systemCode) {
      throw new PortalRequestError(400, 'Enter a different valid system code.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const currentRef = db.collection('registeredSystems').doc(systemCodeId(currentSystemCode));
    const nextRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, currentSnapshot, nextSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(currentRef),
        transaction.get(nextRef),
      ]);
      const business = businessSnapshot.data();
      const current = currentSnapshot.data();
      if (!businessSnapshot.exists || !business) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }
      if (!currentSnapshot.exists || current?.businessId !== req.params.id) {
        throw new PortalRequestError(404, 'System code was not found for this business.');
      }
      if (nextSnapshot.exists) {
        throw new PortalRequestError(409, 'The replacement system code is already registered.');
      }
      transaction.delete(currentRef);
      transaction.create(nextRef, {
        businessId: req.params.id,
        systemCode,
        appVersion: business.appVersion,
        username: business.username,
        screenType: parseDemoScreenType(current.screenType) || 'pos',
        status: 'pending_activation',
        registeredAt: FieldValue.serverTimestamp(),
        activatedAt: null,
        firstActivatedAt: current.firstActivatedAt || current.activatedAt || null,
        deviceHistory: [
          ...historyRecords(current.deviceHistory),
          { event: 'system_code_replaced', at: Timestamp.now(), source: 'admin' },
        ],
        licenseHistory: historyRecords(current.licenseHistory),
      });
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/registered-businesses/:id/system-codes/:systemCode', async (req, res, next) => {
  try {
    const systemCode = typeof req.params.systemCode === 'string'
      ? req.params.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid system code.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(req.params.id);
    const systemRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    const demoLicenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const newDemoRequestRef = db.collection('demoRequests').doc();
    const deactivatedAt = Timestamp.now();
    const adminUid = String(res.locals.adminUid || '');

    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemSnapshot, relatedRequests, demoLicenseSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemRef),
        transaction.get(db.collection('demoRequests').where('systemCode', '==', systemCode)),
        transaction.get(demoLicenseRef),
      ]);
      const business = businessSnapshot.data();
      if (!businessSnapshot.exists || !business) {
        throw new PortalRequestError(404, 'Registered business not found.');
      }
      let systemToDelete: DocumentReference | null = null;
      let systemData: DocumentData | undefined;
      if (systemSnapshot.exists && systemSnapshot.data()?.businessId === req.params.id) {
        systemToDelete = systemRef;
        systemData = systemSnapshot.data();
      } else {
        const matchingSystems = await transaction.get(
          db.collection('registeredSystems')
            .where('systemCode', '==', systemCode)
            .where('businessId', '==', req.params.id)
            .limit(1)
        );
        if (matchingSystems.empty) {
          throw new PortalRequestError(404, 'System code was not found for this business.');
        }
        systemToDelete = matchingSystems.docs[0].ref;
        systemData = matchingSystems.docs[0].data();
      }

      const currentCount = await transactionSystemCount(
        transaction,
        db,
        req.params.id,
        business
      );

      const demoLicense = demoLicenseSnapshot.data();
      const requestById = typeof demoLicense?.requestId === 'string'
        ? relatedRequests.docs.find((request) => request.id === demoLicense.requestId)
        : undefined;
      const previousRequests = relatedRequests.docs
        .filter((request) => {
          const data = request.data();
          return data.convertedToRegistered === true ||
            (data.status === 'approved' && data.keyUsed === true);
        })
        .sort((left, right) => {
          const rightData = right.data();
          const leftData = left.data();
          const rightTime = rightData.redeemedAt || rightData.reviewedAt || rightData.requestedAt;
          const leftTime = leftData.redeemedAt || leftData.reviewedAt || leftData.requestedAt;
          const rightMillis = rightTime instanceof Timestamp ? rightTime.toMillis() : 0;
          const leftMillis = leftTime instanceof Timestamp ? leftTime.toMillis() : 0;
          return rightMillis - leftMillis;
        });
      const demoRequest = requestById || previousRequests[0];
      const demoRequestRef = demoRequest?.ref || newDemoRequestRef;
      const appVersion =
        APP_VERSIONS.find((version) => version === systemData?.appVersion) ||
        APP_VERSIONS.find((version) => version === demoLicense?.appVersion) ||
        APP_VERSIONS.find((version) => version === business.appVersion) ||
        'Standard';
      const screenType =
        parseDemoScreenType(systemData?.screenType) ||
        parseDemoScreenType(demoLicense?.screenType) ||
        'pos';
      const requestedBy =
        String(demoRequest?.data().requestedBy || systemData?.username || business.username || business.businessName || 'Registered system');

      relatedRequests.docs.forEach((request) => {
        if (request.id === demoRequestRef.id) return;
        const data = request.data();
        const keyHash = typeof data.demoKeyHash === 'string' ? data.demoKeyHash : '';
        transaction.update(request.ref, {
          ...(data.status === 'approved' || data.status === 'pending'
            ? { status: 'rejected' }
            : {}),
          convertedToRegistered: true,
          demoKeyHash: FieldValue.delete(),
          encryptedDemoKey: FieldValue.delete(),
        });
        if (keyHash) {
          transaction.delete(db.collection('demoKeyClaims').doc(keyHash));
        }
      });

      const inactiveDemo = {
        requestType: 'demo',
        systemCode,
        requestedBy,
        appVersion,
        screenType,
        status: 'rejected',
        reviewedAt: deactivatedAt,
        reviewedBy: adminUid,
        deactivatedAt,
        keyUsed: false,
        redeemedAt: null,
        expiresAt: null,
        convertedToRegistered: false,
        ...(demoRequest ? {} : { requestedAt: deactivatedAt }),
        ...(systemData?.firstActivatedAt || demoLicense?.firstActivatedAt
          ? { firstActivatedAt: systemData?.firstActivatedAt || demoLicense?.firstActivatedAt }
          : {}),
      };
      if (demoRequest) {
        const oldKeyHash = typeof demoRequest.data().demoKeyHash === 'string'
          ? demoRequest.data().demoKeyHash
          : '';
        transaction.update(demoRequestRef, {
          ...inactiveDemo,
          demoKeyHash: FieldValue.delete(),
          encryptedDemoKey: FieldValue.delete(),
        });
        if (oldKeyHash) {
          transaction.delete(db.collection('demoKeyClaims').doc(oldKeyHash));
        }
      } else {
        transaction.create(demoRequestRef, inactiveDemo);
      }

      const licenseHistory = historyRecords(systemData?.licenseHistory || demoLicense?.licenseHistory);
      for (let index = licenseHistory.length - 1; index >= 0; index -= 1) {
        if (licenseHistory[index].endedAt == null) {
          licenseHistory[index] = {
            ...licenseHistory[index],
            endedAt: deactivatedAt,
          };
          break;
        }
      }
      transaction.delete(systemToDelete);
      transaction.update(businessRef, {
        registeredSystemCount: Math.max(0, currentCount - 1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(demoLicenseRef, {
        systemCode,
        requestId: demoRequestRef.id,
        appVersion,
        screenType,
        ...(systemData?.firstActivatedAt || demoLicense?.firstActivatedAt
          ? { firstActivatedAt: systemData?.firstActivatedAt || demoLicense?.firstActivatedAt }
          : {}),
        ...(Array.isArray(systemData?.deviceHistory)
          ? { deviceHistory: systemData.deviceHistory }
          : {}),
        licenseHistory,
        activationRequired: true,
        revoked: true,
        revokedAt: deactivatedAt,
        revokedBy: adminUid,
        expiresAt: FieldValue.delete(),
      }, { merge: true });
    });

    res.json({ ok: true, systemCode });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users', async (req, res, next) => {
  let createdUid: string | undefined;
  try {
    const { auth, db } = getServices();
    const input = req.body as Record<string, unknown>;
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const role = parseUserRole(input.role);
    const userType = parseUserType(input.userType);

    if (!username || username.toLowerCase() === 'aptadmin' || !email || !displayName) {
      res.status(400).json({ error: 'Enter a username, email, and display name.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'The temporary password must be at least 8 characters.' });
      return;
    }
    if (!role || !userType) {
      res.status(400).json({ error: 'Choose a valid user role and account type.' });
      return;
    }
    const existing = await db.collection('appUsers').where('username', '==', username).limit(1).get();
    if (!existing.empty) {
      res.status(409).json({ error: 'That username is already in use.' });
      return;
    }

    const authUser = await auth.createUser({ email, password, displayName, disabled: false });
    createdUid = authUser.uid;
    await db.collection('appUsers').doc(authUser.uid).set({
      username,
      email,
      displayName,
      role,
      userType,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({
      uid: authUser.uid,
      username,
      email,
      displayName,
      role,
      userType,
      disabled: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (createdUid && adminAuth) {
      await adminAuth.deleteUser(createdUid).catch((cleanupError: unknown) => {
        console.error('Could not roll back Firebase Auth user creation:', cleanupError);
      });
    }
    next(error);
  }
});

app.put('/api/admin/users/:uid', async (req, res, next) => {
  try {
    const { auth, db } = getServices();
    const uid = req.params.uid;
    const input = req.body as Record<string, unknown>;
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const role = parseUserRole(input.role);
    const userType = parseUserType(input.userType);
    if (!username || username.toLowerCase() === 'aptadmin' || !email || !displayName || !role || !userType) {
      res.status(400).json({ error: 'Enter valid user details, role, and account type.' });
      return;
    }
    if (password && password.length < 8) {
      res.status(400).json({ error: 'A new password must be at least 8 characters.' });
      return;
    }

    const userRef = db.collection('appUsers').doc(uid);
    const [existing, adminRecord, originalAuthUser] = await Promise.all([
      userRef.get(),
      db.collection('portalAdmins').doc(uid).get(),
      auth.getUser(uid),
    ]);
    if (!existing.exists) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (adminRecord.exists) {
      res.status(403).json({ error: 'Portal administrator accounts cannot be changed here.' });
      return;
    }
    const patch: {
      email: string;
      displayName: string;
      disabled: boolean;
      password?: string;
    } = {
      email,
      displayName,
      disabled: input.disabled === true,
    };
    if (password) patch.password = password;

    const usernameConflict = await db.collection('appUsers')
      .where('username', '==', username)
      .limit(2)
      .get();
    if (usernameConflict.docs.some((document) => document.id !== uid)) {
      res.status(409).json({ error: 'That username is already in use.' });
      return;
    }

    await auth.updateUser(uid, patch);
    try {
      await userRef.set({
        username,
        email,
        displayName,
        role,
        userType,
        disabled: input.disabled === true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      await auth.updateUser(uid, {
        email: originalAuthUser.email,
        displayName: originalAuthUser.displayName,
        disabled: originalAuthUser.disabled,
      }).catch((rollbackError: unknown) => {
        console.error('Could not roll back Firebase Auth user update:', rollbackError);
      });
      throw error;
    }

    const updated = (await userRef.get()).data() || {};
    res.json({
      uid,
      username,
      email,
      displayName,
      role,
      userType,
      disabled: updated.disabled === true,
      createdAt: toIsoDate(updated.createdAt),
      appVersion: APP_VERSIONS.find((version) => version === updated.appVersion),
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/users/:uid', async (req, res, next) => {
  try {
    const { auth, db } = getServices();
    const uid = req.params.uid;
    const [userRecord, adminRecord] = await Promise.all([
      db.collection('appUsers').doc(uid).get(),
      db.collection('portalAdmins').doc(uid).get(),
    ]);
    if (!userRecord.exists) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    if (adminRecord.exists) {
      res.status(403).json({ error: 'Portal administrator accounts cannot be deleted here.' });
      return;
    }
    await auth.deleteUser(uid);
    await db.collection('appUsers').doc(uid).delete();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/activation-requests', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const snapshot = await db.collection('activationRequests').get();
    const requests = snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          userId: String(data.userId || ''),
          username: String(data.username || ''),
          email: String(data.email || ''),
          appVersion: APP_VERSIONS.find((version) => version === data.appVersion) || 'Standard',
          status: data.status === 'approved' || data.status === 'rejected'
            ? data.status
            : 'pending',
          note: String(data.note || ''),
          requestedAt: toIsoDate(data.requestedAt),
          reviewedAt: toIsoDate(data.reviewedAt),
          reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : undefined,
        };
      })
      .sort((left, right) => (right.requestedAt || '').localeCompare(left.requestedAt || ''));
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/activation-requests', async (req, res, next) => {
  try {
    const { db } = getServices();
    const input = req.body as Record<string, unknown>;
    const userId = typeof input.userId === 'string' ? input.userId : '';
    const appVersion = APP_VERSIONS.find((version) => version === input.appVersion);
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    if (!userId || !appVersion) {
      res.status(400).json({ error: 'Choose a user and a valid app version.' });
      return;
    }
    const userRecord = await db.collection('appUsers').doc(userId).get();
    const userData = userRecord.data();
    if (!userRecord.exists || !userData) {
      res.status(404).json({ error: 'The selected user was not found.' });
      return;
    }
    const requestRef = db.collection('activationRequests').doc();
    await requestRef.set({
      userId,
      username: String(userData.username || ''),
      email: String(userData.email || ''),
      appVersion,
      status: 'pending',
      note,
      requestedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
    });
    res.status(201).json({
      id: requestRef.id,
      userId,
      username: String(userData.username || ''),
      email: String(userData.email || ''),
      appVersion,
      status: 'pending',
      note,
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/activation-requests/:id', async (req, res, next) => {
  try {
    const { db } = getServices();
    const status = req.body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'Choose approved or rejected.' });
      return;
    }
    const requestRef = db.collection('activationRequests').doc(req.params.id);
    const adminUid = String(res.locals.adminUid);
    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) throw new Error('Activation request not found.');
      const requestData = requestSnapshot.data();
      if (requestData?.status !== 'pending') {
        throw new Error('This activation request has already been reviewed.');
      }

      const userRef = db.collection('appUsers').doc(String(requestData.userId || ''));
      const userSnapshot = await transaction.get(userRef);
      if (status === 'approved' && !userSnapshot.exists) {
        throw new Error('The requested user no longer exists.');
      }
      if (status === 'approved') {
        transaction.set(userRef, {
          appVersion: requestData.appVersion,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      transaction.update(requestRef, {
        status,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
      });
    });
    const result = (await requestRef.get()).data() || {};
    res.json({
      id: requestRef.id,
      userId: String(result.userId || ''),
      username: String(result.username || ''),
      email: String(result.email || ''),
      appVersion: APP_VERSIONS.find((version) => version === result.appVersion) || 'Standard',
      status,
      note: String(result.note || ''),
      requestedAt: toIsoDate(result.requestedAt),
      reviewedAt: toIsoDate(result.reviewedAt),
      reviewedBy: typeof result.reviewedBy === 'string' ? result.reviewedBy : undefined,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/demo-requests', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const snapshot = await db.collection('demoRequests').get();
    const systemCodes = [...new Set(snapshot.docs
      .map((document) => String(document.data().systemCode || '').trim().toUpperCase())
      .filter(isSystemCode))];
    const licenseEntries = await Promise.all(systemCodes.map(async (systemCode) => {
      const license = await db.collection('demoLicenses').doc(systemCodeId(systemCode)).get();
      return [systemCode, license.data()] as const;
    }));
    const telemetryEntries = await Promise.all(systemCodes.map(async (systemCode) => {
      const telemetry = await db.collection('demoSystemTelemetry').doc(systemCodeId(systemCode)).get();
      return [systemCode, telemetry.data()] as const;
    }));
    const registeredEntries = await Promise.all(systemCodes.map(async (systemCode) => {
      const registered = await db.collection('registeredSystems').doc(systemCodeId(systemCode)).get();
      return [systemCode, registered.data()] as const;
    }));
    const licensesBySystemCode = new Map(licenseEntries);
    const telemetryBySystemCode = new Map(telemetryEntries);
    const registeredBySystemCode = new Map(registeredEntries);
    const requests = snapshot.docs
      .map((document) => {
        const data = document.data();
        const systemCode = String(data.systemCode || '').trim().toUpperCase();
        return mapDemoRequest(
          document.id,
          data,
          licensesBySystemCode.get(systemCode),
          telemetryBySystemCode.get(systemCode),
          registeredBySystemCode.get(systemCode)
        );
      })
      .sort((left, right) => (right.requestedAt || '').localeCompare(left.requestedAt || ''));
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/demo-requests/:id/convert', async (req, res, next) => {
  try {
    const { db } = getServices();
    const appVersion = APP_VERSIONS.find((version) => version === req.body?.appVersion);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!appVersion) {
      throw new PortalRequestError(400, 'Choose Standard, Silver, or Soft for this system.');
    }
    if (
      !/^[A-Za-z0-9._-]{3,32}$/.test(username) ||
      username.toLowerCase() === 'aptadmin' ||
      username.toLowerCase() === 'demo'
    ) {
      throw new PortalRequestError(400, 'Choose a username with 3-32 letters, numbers, dots, underscores, or hyphens. aptadmin and demo are reserved.');
    }
    if (password.length < 8 || password.length > 128) {
      throw new PortalRequestError(400, 'The registered-system password must be 8-128 characters.');
    }

    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const requestSnapshot = await requestRef.get();
    const requestData = requestSnapshot.data();
    if (!requestSnapshot.exists || !requestData) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }
    if (requestData.status !== 'approved') {
      throw new PortalRequestError(409, 'Approve the demo request before converting its system.');
    }
    const systemCode = typeof requestData.systemCode === 'string'
      ? requestData.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'The demo request does not have a valid system code.');
    }

    const systemId = systemCodeId(systemCode);
    const registeredRef = db.collection('registeredSystems').doc(systemId);
    const demoLicenseRef = db.collection('demoLicenses').doc(systemId);
    const adminUid = String(res.locals.adminUid);
    const registrationKey = randomBytes(32).toString('base64url');
    const credentialsCiphertext = encryptRegistrationCredentials(username, password);
    await db.runTransaction(async (transaction) => {
      const [currentRequest, currentRegistration, currentDemoLicense] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(registeredRef),
        transaction.get(demoLicenseRef),
      ]);
      if (!currentRequest.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }
      if (currentRequest.data()?.status !== 'approved') {
        throw new PortalRequestError(409, 'Approve the demo request before converting its system.');
      }
      if (currentRegistration.exists) {
        throw new PortalRequestError(409, 'This system is already registered.');
      }

      const demoLicense = currentDemoLicense.data();
      const convertedAt = Timestamp.now();
      const firstActivatedAt = demoLicense?.firstActivatedAt instanceof Timestamp
        ? demoLicense.firstActivatedAt
        : currentRequest.data()?.firstActivatedAt instanceof Timestamp
          ? currentRequest.data()?.firstActivatedAt
          : currentRequest.data()?.redeemedAt instanceof Timestamp
            ? currentRequest.data()?.redeemedAt
            : demoLicense?.activatedAt instanceof Timestamp
              ? demoLicense.activatedAt
              : null;
      const deviceHistory = historyRecords(demoLicense?.deviceHistory);
      if (firstActivatedAt && !deviceHistory.some((entry) => entry.event === 'first_activation')) {
        deviceHistory.push({ event: 'first_activation', at: firstActivatedAt, source: 'demo' });
      }
      deviceHistory.push({ event: 'registered', at: convertedAt, source: 'registered' });
      const licenseHistory = historyRecords(demoLicense?.licenseHistory);
      const previousDemoLicense = [...licenseHistory].reverse().find(
        (entry) => entry.licenseType === 'demo' && entry.endedAt == null
      );
      if (previousDemoLicense) previousDemoLicense.endedAt = convertedAt;
      licenseHistory.push({
        licenseType: 'registered',
        label: 'Registered License',
        appVersion,
        assignedAt: convertedAt,
        activatedAt: null,
        expiresAt: null,
        endedAt: null,
      });
      transaction.set(registeredRef, {
        systemCode,
        status: 'pending_activation',
        appVersion,
        username,
        registrationKeyHash: registrationKeyHash(registrationKey),
        credentialsCiphertext,
        registeredAt: convertedAt,
        convertedAt,
        convertedBy: adminUid,
        sourceRequestId: requestRef.id,
        firstActivatedAt,
        deviceHistory,
        licenseHistory,
      });
      transaction.set(demoLicenseRef, {
        systemCode,
        revoked: true,
        revokedAt: convertedAt,
        revokedBy: adminUid,
        convertedToRegistered: true,
        firstActivatedAt,
        deviceHistory,
        licenseHistory,
      }, { merge: true });
      transaction.update(requestRef, {
        convertedToRegistered: true,
        firstActivatedAt,
        registeredVersion: appVersion,
        registrationStatus: 'pending_activation',
        registrationUsername: username,
        convertedAt,
        convertedBy: adminUid,
      });
    });

    res.json({ systemCode, appVersion, username, registrationKey, registeredSystem: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/demo-requests/:id/activity', async (req, res, next) => {
  try {
    const { db } = getServices();
    const requestSnapshot = await db.collection('demoRequests').doc(req.params.id).get();
    if (!requestSnapshot.exists) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }

    const systemCode = String(requestSnapshot.data()?.systemCode || '').trim().toUpperCase();
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'The demo request does not have a valid system code.');
    }

    const telemetryRef = db.collection('demoSystemTelemetry').doc(systemCodeId(systemCode));
    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const [telemetrySnapshot, licenseSnapshot, loginsSnapshot] = await Promise.all([
      telemetryRef.get(),
      licenseRef.get(),
      telemetryRef.collection('logins').orderBy('loggedInAt', 'desc').limit(50).get(),
    ]);
    const telemetry = telemetrySnapshot.data();
    const license = licenseSnapshot.data();
    res.json({
      systemCode,
      lastLoggedInAt: toIsoDate(telemetry?.lastLoggedInAt) || toIsoDate(license?.lastLoggedInAt),
      totalLogins: numberOrZero(telemetry?.totalLogins),
      totalStatusChecks: numberOrZero(telemetry?.totalStatusChecks),
      networkBytesReceived: numberOrZero(telemetry?.networkBytesReceived),
      networkBytesSent: numberOrZero(telemetry?.networkBytesSent),
      systemInfo: parseDemoSystemInfo(telemetry?.systemInfo),
      recentLogins: loginsSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          loggedInAt: toIsoDate(data.loggedInAt),
          networkBytesReceived: numberOrZero(data.networkBytesReceived),
          networkBytesSent: numberOrZero(data.networkBytesSent),
          systemInfo: parseDemoSystemInfo(data.systemInfo),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/devices/:systemCode/activity', async (req, res, next) => {
  try {
    const systemCode = typeof req.params.systemCode === 'string'
      ? req.params.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid device system code.');
    }

    const { db } = getServices();
    const telemetryRef = db.collection('demoSystemTelemetry').doc(systemCodeId(systemCode));
    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const [telemetrySnapshot, licenseSnapshot, loginsSnapshot] = await Promise.all([
      telemetryRef.get(),
      licenseRef.get(),
      telemetryRef.collection('logins').orderBy('loggedInAt', 'desc').limit(50).get(),
    ]);
    const telemetry = telemetrySnapshot.data();
    const license = licenseSnapshot.data();
    res.json({
      systemCode,
      lastLoggedInAt: toIsoDate(telemetry?.lastLoggedInAt) || toIsoDate(license?.lastLoggedInAt),
      totalLogins: numberOrZero(telemetry?.totalLogins),
      totalStatusChecks: numberOrZero(telemetry?.totalStatusChecks),
      networkBytesReceived: numberOrZero(telemetry?.networkBytesReceived),
      networkBytesSent: numberOrZero(telemetry?.networkBytesSent),
      systemInfo: parseDemoSystemInfo(telemetry?.systemInfo),
      recentLogins: loginsSnapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          loggedInAt: toIsoDate(data.loggedInAt),
          networkBytesReceived: numberOrZero(data.networkBytesReceived),
          networkBytesSent: numberOrZero(data.networkBytesSent),
          systemInfo: parseDemoSystemInfo(data.systemInfo),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/device-registration/licenses', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const [businessesSnapshot, systemsSnapshot] = await Promise.all([
      db.collection('registeredBusinesses').get(),
      db.collection('registeredSystems').get(),
    ]);
    const counts = new Map<string, number>();
    systemsSnapshot.docs.forEach((document) => {
      const businessId = document.data().businessId;
      if (typeof businessId === 'string') {
        counts.set(businessId, (counts.get(businessId) || 0) + 1);
      }
    });

    const licenses = businessesSnapshot.docs.flatMap((document) => {
      const data = document.data();
      if (
        data.onHold === true ||
        typeof data.licenseKeyHash !== 'string' ||
        typeof data.licenseKeyCiphertext !== 'object' ||
        data.licenseKeyCiphertext === null
      ) {
        return [];
      }
      const registeredSystemCount = counts.get(document.id) || 0;
      const systemLimit = businessSystemLimit(data, registeredSystemCount);
      const appVersion = APP_VERSIONS.find((version) => version === data.appVersion);
      return [{
        businessId: document.id,
        businessName: String(data.businessName || ''),
        appVersion: appVersion || 'Standard',
        licenseKey: decryptRegistrationPayload(data.licenseKeyCiphertext),
        systemLimit,
        registeredSystemCount,
        availableSlots: Math.max(0, systemLimit - registeredSystemCount),
      }];
    });
    res.json(licenses);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/devices/register', async (req, res, next) => {
  try {
    const systemCode = typeof req.body?.systemCode === 'string'
      ? req.body.systemCode.trim().toUpperCase()
      : '';
    const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId.trim() : '';
    const screenType = parseDemoScreenType(req.body?.screenType);
    const demoRequestId = typeof req.body?.demoRequestId === 'string'
      ? req.body.demoRequestId.trim()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid device system code.');
    }
    if (!businessId || !screenType) {
      throw new PortalRequestError(400, 'Choose a commercial license and screen mode.');
    }
    if (demoRequestId && !/^[A-Za-z0-9_-]{1,128}$/.test(demoRequestId)) {
      throw new PortalRequestError(400, 'The demo request is invalid.');
    }

    const { db } = getServices();
    const businessRef = db.collection('registeredBusinesses').doc(businessId);
    const systemRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    const demoRequestRef = demoRequestId ? db.collection('demoRequests').doc(demoRequestId) : null;
    const demoLicenseRef = demoRequestId
      ? db.collection('demoLicenses').doc(systemCodeId(systemCode))
      : null;
    let businessName = '';
    let availableSlots = 0;
    let convertedFromDemo = false;
    await db.runTransaction(async (transaction) => {
      const [businessSnapshot, systemSnapshot] = await Promise.all([
        transaction.get(businessRef),
        transaction.get(systemRef),
      ]);
      const business = businessSnapshot.data();
      if (!businessSnapshot.exists || !business) {
        throw new PortalRequestError(404, 'Commercial license not found.');
      }
      if (business.onHold === true) {
        throw new PortalRequestError(423, 'This business license is on hold. Resume it before registering devices.');
      }
      if (
        typeof business.licenseKeyHash !== 'string' ||
        typeof business.licenseKeyCiphertext !== 'object' ||
        business.licenseKeyCiphertext === null
      ) {
        throw new PortalRequestError(409, 'This business does not have an active commercial license key.');
      }
      if (systemSnapshot.exists) {
        throw new PortalRequestError(409, 'This system code is already registered.');
      }
      let demoRequest: DocumentData | undefined;
      let demoLicense: DocumentData | undefined;
      if (demoRequestRef && demoLicenseRef) {
        const [demoRequestSnapshot, demoLicenseSnapshot] = await Promise.all([
          transaction.get(demoRequestRef),
          transaction.get(demoLicenseRef),
        ]);
        demoRequest = demoRequestSnapshot.data();
        demoLicense = demoLicenseSnapshot.data();
        if (
          !demoRequestSnapshot.exists ||
          !demoRequest ||
          demoRequest.status !== 'approved' ||
          demoRequest.keyUsed !== true ||
          String(demoRequest.systemCode || '').trim().toUpperCase() !== systemCode ||
          demoRequest.convertedToRegistered === true
        ) {
          throw new PortalRequestError(409, 'This demo device is not available for commercial registration.');
        }
      }

      const currentCount = await transactionSystemCount(transaction, db, businessId, business);
      const systemLimit = businessSystemLimit(business, currentCount);
      if (currentCount >= systemLimit) {
        throw new PortalRequestError(409, 'This license has no available device slots.');
      }
      const appVersion = APP_VERSIONS.find((version) => version === business.appVersion);
      if (!appVersion) throw new Error('The commercial license has an invalid software edition.');

      const registeredAt = Timestamp.now();
      const firstActivatedAt = demoRequest
        ? (demoLicense?.firstActivatedAt instanceof Timestamp
          ? demoLicense.firstActivatedAt
          : demoRequest.firstActivatedAt instanceof Timestamp
            ? demoRequest.firstActivatedAt
            : demoRequest.redeemedAt instanceof Timestamp
              ? demoRequest.redeemedAt
              : demoLicense?.activatedAt instanceof Timestamp
                ? demoLicense.activatedAt
                : null)
        : null;
      const deviceHistory = demoRequest ? historyRecords(demoLicense?.deviceHistory) : [];
      if (
        firstActivatedAt &&
        !deviceHistory.some((entry) => entry.event === 'first_activation')
      ) {
        deviceHistory.push({ event: 'first_activation', at: firstActivatedAt, source: 'demo' });
      }
      deviceHistory.push({
        event: demoRequest ? 'registered_to_commercial_license' : 'registered',
        at: registeredAt,
        source: 'commercial',
        businessName: String(business.businessName || ''),
      });

      const licenseHistory = demoRequest ? historyRecords(demoLicense?.licenseHistory) : [];
      if (demoRequest && !licenseHistory.length) {
        const demoAppVersion =
          APP_VERSIONS.find((version) => version === demoLicense?.appVersion) ||
          APP_VERSIONS.find((version) => version === demoRequest.appVersion) ||
          appVersion;
        const demoActivatedAt = firstActivatedAt ||
          (demoLicense?.activatedAt instanceof Timestamp ? demoLicense.activatedAt : null);
        licenseHistory.push({
          licenseType: 'demo',
          label: demoRequest.requestType === 'extension' ? 'Demo Extension' : 'Demo License',
          appVersion: demoAppVersion,
          assignedAt: demoRequest.reviewedAt instanceof Timestamp ? demoRequest.reviewedAt : demoActivatedAt,
          activatedAt: demoActivatedAt,
          expiresAt: demoLicense?.expiresAt instanceof Timestamp ? demoLicense.expiresAt : null,
          endedAt: registeredAt,
        });
      } else if (demoRequest) {
        const previousDemoLicense = [...licenseHistory].reverse().find(
          (entry) => entry.licenseType === 'demo' && entry.endedAt == null
        );
        if (previousDemoLicense) previousDemoLicense.endedAt = registeredAt;
      }
      licenseHistory.push({
        licenseType: 'commercial',
        label: String(business.businessName || 'Commercial License'),
        businessId,
        appVersion,
        assignedAt: registeredAt,
        activatedAt: null,
        expiresAt: null,
        endedAt: null,
      });

      transaction.create(systemRef, {
        businessId,
        systemCode,
        appVersion,
        username: String(business.username || ''),
        screenType,
        status: 'pending_activation',
        registeredAt,
        activatedAt: null,
        firstActivatedAt,
        deviceHistory,
        licenseHistory,
      });
      transaction.update(businessRef, {
        registeredSystemCount: currentCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (demoRequestRef && demoLicenseRef && demoRequest) {
        transaction.set(demoLicenseRef, {
          revoked: true,
          revokedAt: registeredAt,
          revokedBy: String(res.locals.adminUid),
          convertedToRegistered: true,
          convertedBusinessId: businessId,
          firstActivatedAt,
          deviceHistory,
          licenseHistory,
        }, { merge: true });
        transaction.update(demoRequestRef, {
          convertedToRegistered: true,
          convertedAt: registeredAt,
          convertedBy: String(res.locals.adminUid),
          convertedBusinessId: businessId,
          firstActivatedAt,
        });
        convertedFromDemo = true;
      }
      businessName = String(business.businessName || '');
      availableSlots = systemLimit - currentCount - 1;
    });

    res.status(201).json({
      systemCode,
      screenType,
      businessId,
      businessName,
      availableSlots,
      convertedFromDemo,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/devices/blocks', async (_req, res, next) => {
  try {
    const { db } = getServices();
    const blocksSnapshot = await db.collection('systemCodeBlocks').get();
    const blockedSystemCodes = blocksSnapshot.docs
      .map((document) => document.data().systemCode)
      .filter((systemCode): systemCode is string => isSystemCode(systemCode))
      .map((systemCode) => systemCode.trim().toUpperCase());
    res.json({ blockedSystemCodes });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/devices/:systemCode/screen-type', async (req, res, next) => {
  try {
    const systemCode = typeof req.params.systemCode === 'string'
      ? req.params.systemCode.trim().toUpperCase()
      : '';
    const screenType = parseDemoScreenType(req.body?.screenType);
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid device system code.');
    }
    if (!screenType) {
      throw new PortalRequestError(400, 'Choose POS or RPOS as the screen mode.');
    }

    const { db } = getServices();
    const systemRef = db.collection('registeredSystems').doc(systemCodeId(systemCode));
    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    await db.runTransaction(async (transaction) => {
      const [systemSnapshot, licenseSnapshot] = await Promise.all([
        transaction.get(systemRef),
        transaction.get(licenseRef),
      ]);
      const systemData = systemSnapshot.data();
      const isRegistered = systemSnapshot.exists &&
        (systemData?.status === 'active' || systemData?.status === 'pending_activation');

      if (isRegistered) {
        transaction.update(systemRef, { screenType });
        return;
      }

      if (!licenseSnapshot.exists) {
        throw new PortalRequestError(404, 'No registered or activated demo device was found for this system code.');
      }

      const licenseData = licenseSnapshot.data();
      const requestId = typeof licenseData?.requestId === 'string' ? licenseData.requestId : '';
      const requestRef = requestId ? db.collection('demoRequests').doc(requestId) : null;
      const requestSnapshot = requestRef ? await transaction.get(requestRef) : null;

      transaction.set(licenseRef, { screenType }, { merge: true });
      if (requestRef && requestSnapshot?.exists && requestSnapshot.data()?.systemCode === systemCode) {
        transaction.update(requestRef, { screenType });
      }
    });

    res.json({ systemCode, screenType });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/devices/:systemCode/block', async (req, res, next) => {
  try {
    const systemCode = typeof req.params.systemCode === 'string'
      ? req.params.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid device system code.');
    }

    const { db } = getServices();
    const systemId = systemCodeId(systemCode);
    const [registeredSnapshot, licenseSnapshot] = await Promise.all([
      db.collection('registeredSystems').doc(systemId).get(),
      db.collection('demoLicenses').doc(systemId).get(),
    ]);
    if (!registeredSnapshot.exists && !licenseSnapshot.exists) {
      throw new PortalRequestError(404, 'No registered or activated demo device was found for this system code.');
    }

    await db.collection('systemCodeBlocks').doc(systemId).set({
      systemCode,
      blockedAt: FieldValue.serverTimestamp(),
      blockedBy: res.locals.adminUsername || 'aptadmin',
    });
    res.json({ systemCode, blocked: true });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/devices/:systemCode/block', async (req, res, next) => {
  try {
    const systemCode = typeof req.params.systemCode === 'string'
      ? req.params.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'Enter a valid device system code.');
    }

    const { db } = getServices();
    await db.collection('systemCodeBlocks').doc(systemCodeId(systemCode)).delete();
    res.json({ systemCode, blocked: false });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/demo-requests/:id/system-data', async (req, res, next) => {
  try {
    const { db } = getServices();
    const selectedRequest = await db.collection('demoRequests').doc(req.params.id).get();
    if (!selectedRequest.exists) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }

    const selectedData = selectedRequest.data();
    const systemCode = typeof selectedData?.systemCode === 'string'
      ? selectedData.systemCode.trim().toUpperCase()
      : '';
    if (!isSystemCode(systemCode)) {
      throw new PortalRequestError(400, 'The demo request does not have a valid system code.');
    }

    const requestsSnapshot = await db.collection('demoRequests')
      .where('systemCode', '==', systemCode)
      .get();
    const requestRefs = new Map<string, DocumentReference>();
    for (const document of requestsSnapshot.docs) {
      requestRefs.set(document.ref.path, document.ref);
    }
    requestRefs.set(selectedRequest.ref.path, selectedRequest.ref);

    const claimsSnapshot = await db.collection('demoKeyClaims')
      .where('systemCode', '==', systemCode)
      .get();
    const claimRefs = new Map<string, DocumentReference>();
    for (const document of claimsSnapshot.docs) {
      claimRefs.set(document.ref.path, document.ref);
    }

    const systemId = systemCodeId(systemCode);
    const telemetryRef = db.collection('demoSystemTelemetry').doc(systemId);
    const registeredRef = db.collection('registeredSystems').doc(systemId);
    const [telemetrySnapshot, loginEventsSnapshot, registeredSnapshot] = await Promise.all([
      telemetryRef.get(),
      telemetryRef.collection('logins').get(),
      registeredRef.get(),
    ]);

    const requestIds = [...new Set([
      ...requestsSnapshot.docs.map((document) => document.id),
      selectedRequest.id,
    ])];
    for (let offset = 0; offset < requestIds.length; offset += 30) {
      const requestIdBatch = requestIds.slice(offset, offset + 30);
      const relatedClaims = await db.collection('demoKeyClaims')
        .where('requestId', 'in', requestIdBatch)
        .get();
      for (const document of relatedClaims.docs) {
        claimRefs.set(document.ref.path, document.ref);
      }
    }

    const requestKeyHashes = new Set<string>();
    for (const document of requestsSnapshot.docs) {
      const keyHash = document.data().demoKeyHash;
      if (typeof keyHash === 'string' && keyHash) requestKeyHashes.add(keyHash);
    }
    if (typeof selectedData?.demoKeyHash === 'string' && selectedData.demoKeyHash) {
      requestKeyHashes.add(selectedData.demoKeyHash);
    }
    const claimsByHash = await Promise.all(
      [...requestKeyHashes].map((keyHash) =>
        db.collection('demoKeyClaims').doc(keyHash).get()
      )
    );
    for (const document of claimsByHash) {
      if (document.exists) claimRefs.set(document.ref.path, document.ref);
    }

    const licensesSnapshot = await db.collection('demoLicenses')
      .where('systemCode', '==', systemCode)
      .get();
    const licenseRefs = new Map<string, DocumentReference>();
    for (const document of licensesSnapshot.docs) {
      licenseRefs.set(document.ref.path, document.ref);
    }
    const primaryLicense = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    if ((await primaryLicense.get()).exists) {
      licenseRefs.set(primaryLicense.path, primaryLicense);
    }

    const deleteGroups = [
      [...licenseRefs.values()],
      ...(registeredSnapshot.exists ? [[registeredRef]] : []),
      [...claimRefs.values()],
      loginEventsSnapshot.docs.map((document) => document.ref),
      ...(telemetrySnapshot.exists ? [[telemetryRef]] : []),
      [...requestRefs.values()],
    ];
    for (const refs of deleteGroups) {
      for (let offset = 0; offset < refs.length; offset += 450) {
        const batch = db.batch();
        refs.slice(offset, offset + 450).forEach((reference) => batch.delete(reference));
        await batch.commit();
      }
    }

    res.json({
      systemCode,
      deletedRequests: requestRefs.size,
      deletedRequestIds: [...requestRefs.values()].map((reference) => reference.id),
      deletedKeyClaims: claimRefs.size,
      deletedLicenses: licenseRefs.size,
      deletedRegisteredSystems: registeredSnapshot.exists ? 1 : 0,
      deletedLoginEvents: loginEventsSnapshot.size,
      deletedTelemetryRecords: telemetrySnapshot.exists ? 1 : 0,
      authAccountsDeleted: 0,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/demo-requests/:id', async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'Choose approved or rejected.' });
      return;
    }
    const selectedAppVersion = APP_VERSIONS.find(
      (version) => version === req.body?.appVersion
    );
    const selectedScreenType = parseDemoScreenType(req.body?.screenType);

    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const adminUid = String(res.locals.adminUid);
    const demoKey = status === 'approved' ? createDemoKey() : undefined;
    const keyHash = demoKey ? demoKeyHash(demoKey) : undefined;
    const encryptedDemoKey = demoKey ? encryptRegistrationPayload(demoKey) : undefined;
    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }
      const requestData = requestSnapshot.data();
      if (requestData?.status !== 'pending') {
        throw new PortalRequestError(409, 'This demo request has already been reviewed.');
      }
      let approvalSelection: { appVersion: AppVersion; screenType: DemoScreenType } | undefined;

      if (status === 'approved' && requestData?.requestType === 'extension') {
        const licenseRef = db.collection('demoLicenses').doc(
          systemCodeId(String(requestData.systemCode || ''))
        );
        const licenseSnapshot = await transaction.get(licenseRef);
        const licenseData = licenseSnapshot.data();
        const expiresAt = licenseData?.expiresAt;
        if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() > Date.now()) {
          throw new PortalRequestError(409, 'The demo extension can only be approved after the current demo expires.');
        }
        approvalSelection = {
          appVersion:
            APP_VERSIONS.find((version) => version === licenseData?.appVersion) ||
            APP_VERSIONS.find((version) => version === requestData?.appVersion) ||
            'Standard',
          screenType:
            parseDemoScreenType(licenseData?.screenType) ||
            parseDemoScreenType(requestData?.screenType) ||
            'pos',
        };
      } else if (status === 'approved') {
        if (!selectedAppVersion || !selectedScreenType) {
          throw new PortalRequestError(400, 'Choose a software version and screen type before approving this demo.');
        }
        approvalSelection = {
          appVersion: selectedAppVersion,
          screenType: selectedScreenType,
        };
      }

      transaction.update(requestRef, {
        status,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
        ...(status === 'approved'
          ? {
              demoKeyHash: keyHash,
              encryptedDemoKey,
              keyUsed: false,
              ...approvalSelection,
            }
          : {}),
      });
      if (status === 'approved' && keyHash) {
        transaction.set(db.collection('demoKeyClaims').doc(keyHash), {
          requestId: requestRef.id,
          systemCode: requestData?.systemCode,
          used: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    const updated = (await requestRef.get()).data();
    if (!updated) throw new Error('The reviewed demo request could not be loaded.');
    res.json({
      request: mapDemoRequest(requestRef.id, updated),
      ...(demoKey ? { demoKey } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/demo-requests/:id/configuration', async (req, res, next) => {
  try {
    const appVersion = APP_VERSIONS.find((version) => version === req.body?.appVersion);
    const screenType = parseDemoScreenType(req.body?.screenType);
    if (!appVersion || !screenType) {
      res.status(400).json({ error: 'Choose a valid software version and screen type.' });
      return;
    }

    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const adminUid = String(res.locals.adminUid);
    const demoKey = createDemoKey();
    const keyHash = demoKeyHash(demoKey);
    const encryptedDemoKey = encryptRegistrationPayload(demoKey);
    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }

      const requestData = requestSnapshot.data();
      if (requestData?.status !== 'approved') {
        throw new PortalRequestError(409, 'Only approved demo details can be edited.');
      }
      const systemCode = String(requestData.systemCode || '').trim().toUpperCase();
      if (!isSystemCode(systemCode)) {
        throw new PortalRequestError(409, 'This demo request has an invalid system code.');
      }

      const systemId = systemCodeId(systemCode);
      const registeredRef = db.collection('registeredSystems').doc(systemId);
      const licenseRef = db.collection('demoLicenses').doc(systemId);
      const [registeredSnapshot, licenseSnapshot, relatedRequests] = await Promise.all([
        transaction.get(registeredRef),
        transaction.get(licenseRef),
        transaction.get(
          db.collection('demoRequests').where('systemCode', '==', systemCode)
        ),
      ]);
      const registeredStatus = registeredSnapshot.data()?.status;
      if (registeredStatus === 'active' || registeredStatus === 'pending_activation') {
        throw new PortalRequestError(409, 'Registered systems cannot use demo version or screen settings.');
      }

      const configurationUpdate = {
        appVersion,
        screenType,
        configurationUpdatedAt: FieldValue.serverTimestamp(),
        configurationUpdatedBy: adminUid,
      };
      const previousKeyHash =
        typeof requestData.demoKeyHash === 'string' ? requestData.demoKeyHash : '';
      transaction.update(requestRef, {
        ...configurationUpdate,
        demoKeyHash: keyHash,
        encryptedDemoKey,
        keyUsed: false,
        redeemedAt: null,
        expiresAt: null,
      });
      relatedRequests.docs.forEach((relatedRequest) => {
        if (
          relatedRequest.id !== requestRef.id &&
          relatedRequest.data().status === 'approved'
        ) {
          const relatedData = relatedRequest.data();
          const relatedKeyHash =
            typeof relatedData.demoKeyHash === 'string' ? relatedData.demoKeyHash : '';
          transaction.update(relatedRequest.ref, {
            ...configurationUpdate,
            demoKeyHash: FieldValue.delete(),
            encryptedDemoKey: FieldValue.delete(),
            ...(relatedData.keyUsed === true
              ? {}
              : { keyUsed: false, redeemedAt: null, expiresAt: null }),
          });
          if (relatedKeyHash) {
            transaction.delete(db.collection('demoKeyClaims').doc(relatedKeyHash));
          }
        }
      });
      if (licenseSnapshot.exists && licenseSnapshot.data()?.revoked !== true) {
        transaction.set(
          licenseRef,
          { appVersion, screenType, activationRequired: true },
          { merge: true }
        );
      }
      if (previousKeyHash) {
        transaction.delete(db.collection('demoKeyClaims').doc(previousKeyHash));
      }
      transaction.set(db.collection('demoKeyClaims').doc(keyHash), {
        requestId: requestRef.id,
        systemCode,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    const updated = (await requestRef.get()).data();
    if (!updated) throw new Error('The updated demo configuration could not be loaded.');
    res.json({ request: mapDemoRequest(requestRef.id, updated), demoKey });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/demo-requests/:id/key', async (req, res, next) => {
  try {
    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const demoKey = createDemoKey();
    const keyHash = demoKeyHash(demoKey);
    const encryptedDemoKey = encryptRegistrationPayload(demoKey);
    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }
      const requestData = requestSnapshot.data();
      if (requestData?.status !== 'approved') {
        throw new PortalRequestError(409, 'A replacement key is only available for an approved demo request.');
      }
      const systemCode = String(requestData.systemCode || '').trim().toUpperCase();
      if (!isSystemCode(systemCode)) {
        throw new PortalRequestError(409, 'This demo request has an invalid system code.');
      }
      const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
      const licenseSnapshot = await transaction.get(licenseRef);
      const relatedRequests = await transaction.get(
        db.collection('demoRequests').where('systemCode', '==', systemCode)
      );

      const previousKeyHash = typeof requestData.demoKeyHash === 'string'
        ? requestData.demoKeyHash
        : '';
      relatedRequests.docs.forEach((relatedRequest) => {
        if (
          relatedRequest.id !== requestRef.id &&
          relatedRequest.data().status === 'approved'
        ) {
          const relatedKeyHash =
            typeof relatedRequest.data().demoKeyHash === 'string'
              ? relatedRequest.data().demoKeyHash
              : '';
          transaction.update(relatedRequest.ref, {
            demoKeyHash: FieldValue.delete(),
            encryptedDemoKey: FieldValue.delete(),
          });
          if (relatedKeyHash) {
            transaction.delete(db.collection('demoKeyClaims').doc(relatedKeyHash));
          }
        }
      });
      transaction.update(requestRef, {
        demoKeyHash: keyHash,
        encryptedDemoKey,
        keyUsed: false,
        redeemedAt: null,
        expiresAt: null,
      });
      if (previousKeyHash) {
        transaction.delete(db.collection('demoKeyClaims').doc(previousKeyHash));
      }
      transaction.set(db.collection('demoKeyClaims').doc(keyHash), {
        requestId: requestRef.id,
        systemCode,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (licenseSnapshot.exists && licenseSnapshot.data()?.revoked !== true) {
        transaction.set(licenseRef, { activationRequired: true }, { merge: true });
      }
    });
    res.json({ demoKey });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/demo-requests/:id/key', async (req, res, next) => {
  try {
    const { db } = getServices();
    const requestSnapshot = await db.collection('demoRequests').doc(req.params.id).get();
    if (!requestSnapshot.exists) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }

    const requestData = requestSnapshot.data() || {};
    if (
      requestData.status !== 'approved' ||
      typeof requestData.demoKeyHash !== 'string' ||
      !requestData.encryptedDemoKey
    ) {
      res.json({ demoKey: null });
      return;
    }

    const demoKey = decryptRegistrationPayload(requestData.encryptedDemoKey);
    if (demoKeyHash(demoKey) !== requestData.demoKeyHash) {
      throw new Error('The stored demo key does not match the current request.');
    }
    res.json({ demoKey });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/demo-requests/:id/deactivate', async (req, res, next) => {
  try {
    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const snap = await requestRef.get();
    if (!snap.exists) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }
    const data = snap.data();
    const systemCode = String(data?.systemCode || '');
    if (!systemCode) {
      throw new PortalRequestError(400, 'Request does not have a valid system code.');
    }

    await db.runTransaction(async (transaction) => {
      const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
      const relatedRequests = await transaction.get(
        db.collection('demoRequests').where('systemCode', '==', systemCode)
      );
      transaction.set(licenseRef, {
        revoked: true,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: String(res.locals.adminUid || ''),
        activationRequired: true,
      }, { merge: true });

      const keyHash = typeof data?.demoKeyHash === 'string'
        ? data.demoKeyHash
        : '';
      relatedRequests.docs.forEach((relatedRequest) => {
        if (
          relatedRequest.id !== requestRef.id &&
          relatedRequest.data().status === 'approved'
        ) {
          const relatedKeyHash =
            typeof relatedRequest.data().demoKeyHash === 'string'
              ? relatedRequest.data().demoKeyHash
              : '';
          transaction.update(relatedRequest.ref, {
            demoKeyHash: FieldValue.delete(),
            encryptedDemoKey: FieldValue.delete(),
          });
          if (relatedKeyHash) {
            transaction.delete(db.collection('demoKeyClaims').doc(relatedKeyHash));
          }
        }
      });
      transaction.update(requestRef, {
        status: 'rejected',
        deactivatedAt: FieldValue.serverTimestamp(),
        demoKeyHash: FieldValue.delete(),
        encryptedDemoKey: FieldValue.delete(),
        expiresAt: null,
      });
      if (keyHash) {
        transaction.delete(db.collection('demoKeyClaims').doc(keyHash));
      }
    });

    const updated = (await requestRef.get()).data();
    res.json({ request: mapDemoRequest(requestRef.id, updated || {}) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/demo-requests/:id/reactivate', async (req, res, next) => {
  try {
    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const demoKey = createDemoKey();
    const keyHash = demoKeyHash(demoKey);
    const encryptedDemoKey = encryptRegistrationPayload(demoKey);
    const adminUid = String(res.locals.adminUid || '');

    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }

      const requestData = requestSnapshot.data();
      if (
        requestData?.status !== 'rejected' ||
        !(requestData.deactivatedAt instanceof Timestamp)
      ) {
        throw new PortalRequestError(409, 'Only a deactivated demo can be reactivated.');
      }

      const systemCode = String(requestData.systemCode || '').trim().toUpperCase();
      if (!isSystemCode(systemCode)) {
        throw new PortalRequestError(409, 'This demo request has an invalid system code.');
      }

      const systemId = systemCodeId(systemCode);
      const registeredRef = db.collection('registeredSystems').doc(systemId);
      const licenseRef = db.collection('demoLicenses').doc(systemId);
      const [registeredSnapshot, relatedRequests] = await Promise.all([
        transaction.get(registeredRef),
        transaction.get(db.collection('demoRequests').where('systemCode', '==', systemCode)),
      ]);
      const registeredStatus = registeredSnapshot.data()?.status;
      if (registeredStatus === 'active' || registeredStatus === 'pending_activation') {
        throw new PortalRequestError(409, 'Registered systems cannot use demo access.');
      }

      relatedRequests.docs.forEach((relatedRequest) => {
        if (relatedRequest.id === requestRef.id) return;
        const relatedData = relatedRequest.data();
        if (relatedData.status !== 'approved') return;

        const relatedKeyHash =
          typeof relatedData.demoKeyHash === 'string' ? relatedData.demoKeyHash : '';
        transaction.update(relatedRequest.ref, {
          demoKeyHash: FieldValue.delete(),
          encryptedDemoKey: FieldValue.delete(),
        });
        if (relatedKeyHash) {
          transaction.delete(db.collection('demoKeyClaims').doc(relatedKeyHash));
        }
      });

      transaction.update(requestRef, {
        status: 'approved',
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: adminUid,
        deactivatedAt: FieldValue.delete(),
        demoKeyHash: keyHash,
        encryptedDemoKey,
        keyUsed: false,
        redeemedAt: null,
        expiresAt: null,
      });
      transaction.set(db.collection('demoKeyClaims').doc(keyHash), {
        requestId: requestRef.id,
        systemCode,
        used: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(licenseRef, {
        revoked: true,
        activationRequired: true,
      }, { merge: true });
    });

    const updated = (await requestRef.get()).data();
    if (!updated) throw new Error('The reactivated demo could not be loaded.');
    res.json({ request: mapDemoRequest(requestRef.id, updated), demoKey });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/demo-requests/:id/expiry', async (req, res, next) => {
  try {
    const expiresAtInput = typeof req.body?.expiresAt === 'string' ? req.body.expiresAt : '';
    const expiresAt = new Date(expiresAtInput);
    if (!expiresAtInput || !Number.isFinite(expiresAt.getTime())) {
      throw new PortalRequestError(400, 'Enter a valid demo expiration date and time.');
    }

    const { db } = getServices();
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    let systemCode = '';
    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef);
      if (!requestSnapshot.exists) {
        throw new PortalRequestError(404, 'Demo request not found.');
      }
      const requestData = requestSnapshot.data();
      systemCode = typeof requestData?.systemCode === 'string'
        ? requestData.systemCode.trim().toUpperCase()
        : '';
      if (!isSystemCode(systemCode)) {
        throw new PortalRequestError(400, 'The demo request does not have a valid system code.');
      }
      if (requestData?.status !== 'approved') {
        throw new PortalRequestError(409, 'Only an approved demo can have its expiration changed.');
      }

      const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
      const licenseSnapshot = await transaction.get(licenseRef);
      if (!licenseSnapshot.exists || licenseSnapshot.data()?.revoked === true) {
        throw new PortalRequestError(409, 'This system does not have an active demo license.');
      }

      const expiration = Timestamp.fromDate(expiresAt);
      transaction.update(licenseRef, {
        expiresAt: expiration,
        expirationUpdatedAt: FieldValue.serverTimestamp(),
        expirationUpdatedBy: String(res.locals.adminUid || ''),
      });
      transaction.update(requestRef, { expiresAt: expiration });
    });

    res.json({ systemCode, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/demo-requests/:id/extend', async (req, res, next) => {
  try {
    const { db } = getServices();
    const daysToAdd = Math.max(1, Math.min(30, Number(req.body?.days || 2)));
    const requestRef = db.collection('demoRequests').doc(req.params.id);
    const snap = await requestRef.get();
    if (!snap.exists) {
      throw new PortalRequestError(404, 'Demo request not found.');
    }
    const data = snap.data();
    const systemCode = String(data?.systemCode || '');
    if (!systemCode) {
      throw new PortalRequestError(400, 'Request does not have a valid system code.');
    }

    const licenseRef = db.collection('demoLicenses').doc(systemCodeId(systemCode));
    const licenseSnap = await licenseRef.get();
    const licenseData = licenseSnap.data();
    const requestData = data || {};
    const isReactivation = requestData.status === 'rejected';
    const demoKey = isReactivation ? createDemoKey() : undefined;
    const keyHash = demoKey ? demoKeyHash(demoKey) : undefined;
    const encryptedDemoKey = demoKey ? encryptRegistrationPayload(demoKey) : undefined;
    const previousKeyHash = typeof requestData.demoKeyHash === 'string'
      ? requestData.demoKeyHash
      : '';

    let baseTime = Date.now();
    if (licenseData?.expiresAt instanceof Timestamp) {
      const existingMs = licenseData.expiresAt.toMillis();
      if (existingMs > baseTime) {
        baseTime = existingMs;
      }
    }

    const newExpiry = new Date(baseTime + daysToAdd * 24 * 60 * 60 * 1000);

    await db.runTransaction(async (transaction) => {
      transaction.set(licenseRef, {
        systemCode,
        requestId: requestRef.id,
        expiresAt: Timestamp.fromDate(newExpiry),
        revoked: false,
        ...(keyHash ? { activationRequired: true } : {}),
        extendedAt: FieldValue.serverTimestamp(),
        extendedBy: String(res.locals.adminUid || ''),
      }, { merge: true });

      transaction.update(requestRef, {
        expiresAt: Timestamp.fromDate(newExpiry),
        status: 'approved',
        keyUsed: false,
        redeemedAt: null,
        ...(keyHash ? { demoKeyHash: keyHash, encryptedDemoKey } : {}),
      });
      if (previousKeyHash && previousKeyHash !== keyHash) {
        transaction.delete(db.collection('demoKeyClaims').doc(previousKeyHash));
      }
      if (keyHash) {
        transaction.set(db.collection('demoKeyClaims').doc(keyHash), {
          requestId: requestRef.id,
          systemCode,
          used: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });

    const updated = (await requestRef.get()).data();
    res.json({
      request: mapDemoRequest(requestRef.id, updated || {}),
      newExpiresAt: newExpiry.toISOString(),
      ...(demoKey ? { demoKey } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'The request could not be completed.';
  console.error(`Admin portal API error: ${message}`);
  if (error instanceof PortalRequestError) {
    res.status(error.status).json({ error: message });
    return;
  }
  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  res.status(errorCode.startsWith('auth/') ? 400 : 500).json({ error: message });
});

app.listen(port, host, () => {
  console.log(`Admin portal API listening on http://${host}:${port}`);
  if (!adminAuth || !firestore) {
    console.warn(`Firebase is not configured: ${firebaseSetupError}`);
  }
});
