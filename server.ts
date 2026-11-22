import 'dotenv/config';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { AppVersion, UserRole, UserType } from './src/types';

const app = express();
const port = Number(process.env.ADMIN_API_PORT || 3002);
const portalAdminEmail = (process.env.VITE_ADMIN_LOGIN_EMAIL || '').trim().toLowerCase();
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, firebaseConfigured: Boolean(adminAuth && firestore && portalAdminEmail) });
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

function parseUserType(value: unknown): UserType | null {
  return value === 'current' || value === 'demo' ? value : null;
}

function parseUserRole(value: unknown): UserRole | null {
  return value === 'cashier' || value === 'custom' ? value : null;
}

const APP_VERSIONS: AppVersion[] = ['Soft', 'Silver', 'Standard'];

app.get('/api/admin/session', (_req, res) => {
  res.json({ username: res.locals.adminUsername || 'aptadmin' });
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
    const [existing, adminRecord] = await Promise.all([
      userRef.get(),
      db.collection('portalAdmins').doc(uid).get(),
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
    await userRef.set({
      username,
      email,
      displayName,
      role,
      userType,
      disabled: input.disabled === true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'The request could not be completed.';
  console.error(`Admin portal API error: ${message}`);
  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
  res.status(errorCode.startsWith('auth/') ? 400 : 500).json({ error: message });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Admin portal API listening on http://127.0.0.1:${port}`);
  if (!adminAuth || !firestore) {
    console.warn(`Firebase is not configured: ${firebaseSetupError}`);
  }
});
