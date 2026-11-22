import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const adminLoginEmail = import.meta.env.VITE_ADMIN_LOGIN_EMAIL as string | undefined;
export const firebaseWebConfigured = Object.values(config).every(
  (value) => typeof value === 'string' && value.length > 0
);
export const firebaseConfigured = firebaseWebConfigured && Boolean(adminLoginEmail);

const firebaseApp = firebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;

export async function verifyPortalAdmin(user: User): Promise<{ username: string }> {
  if (!firebaseDb) {
    throw new Error('Firebase admin login is not configured.');
  }
  if (user.email?.trim().toLowerCase() !== adminLoginEmail?.trim().toLowerCase()) {
    throw new Error(`Use the account configured for ${adminLoginEmail}.`);
  }

  const adminSnapshot = await getDoc(doc(firebaseDb, 'portalAdmins', user.uid));
  const adminRecord = adminSnapshot.data();
  if (
    !adminSnapshot.exists() ||
    adminRecord?.active !== true ||
    typeof adminRecord.username !== 'string' ||
    adminRecord.username.toLowerCase() !== 'aptadmin'
  ) {
    throw new Error('This Firebase account is not authorized as aptadmin.');
  }

  return { username: adminRecord.username };
}
