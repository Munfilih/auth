# aptPOS Admin Portal

This is a standalone project in `D:\aptpos-admin-portal`. It does not import, call, or share a database with the aptPOS application. User accounts and activation requests are stored in Firebase Authentication and Cloud Firestore.

## Firebase setup

1. Create a Firebase project and enable **Authentication → Email/Password** and **Google** sign-in.
2. Create the Firebase Authentication account for the portal administrator. Set `VITE_ADMIN_LOGIN_EMAIL=munfilih@gmail.com` in `.env`. The portal login username is `aptadmin`; only this email is authorized by the app and API, including when using Google sign-in.
3. Create a Firestore document at `portalAdmins/{firebase-auth-uid}` with:

   ```json
   {
     "username": "aptadmin",
     "active": true
   }
   ```

4. Create a Firebase service account and keep its JSON file outside this project. Set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path and set `FIREBASE_PROJECT_ID`.
5. Copy `.env.example` to `.env` and fill in the Firebase Web App values. Do not commit `.env` or the service-account file.
6. Publish the included Firestore rules from `firestore.rules`.

If the administrator already has an Email/Password account, the first Google sign-in may ask for that password to link Google to the existing Firebase account. This preserves the administrator's UID and access record; later Google sign-ins work directly.

The browser app signs in with Firebase Auth and verifies the signed-in user's own `portalAdmins/{uid}` document directly through Firestore rules. This keeps sign-in independent of the Node API. The Admin SDK service account is used only by the Node API for privileged user and request management; the API also checks the `portalAdmins` document before handling those operations. The API defaults to `127.0.0.1:3002`. For a hosted API, set `ADMIN_API_HOST=0.0.0.0`; the server also honors the hosting provider's `PORT` variable. If the browser app is hosted on another origin, set `VITE_API_BASE_URL` when building the frontend and add that exact origin to `ADMIN_PORTAL_ORIGINS` on the API. Do not use `*` for the allowed-origin list.

## Run

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:3001> on the development computer or <http://192.168.1.113:3001> from a device on the same Wi-Fi network. The development command starts the API on port 3002 and the web app on port 3001. Firebase configuration is required for sign-in and data operations.

## GitHub Pages

The GitHub Actions workflow builds the Vite app (including the `/auth/` project-site base path) and deploys `dist/`. Add these repository variables under **Settings → Secrets and variables → Actions → Variables**: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_ADMIN_LOGIN_EMAIL`, and `VITE_API_BASE_URL`. Firebase Auth and the admin's own Firestore record authorize sign-in; `VITE_API_BASE_URL` points to the HTTPS URL of the separately hosted Node API used for management operations. Add `https://munfilih.github.io` to that API's `ADMIN_PORTAL_ORIGINS`. GitHub Pages hosts only the frontend; it cannot run the Node API or hold Firebase Admin credentials.

## aptPOS demo requests

The **Demo Key Requests** tab receives initial two-day demo requests and expired-demo extension requests from aptPOS. Requests appear in a list; select one to open its details. Approving a request generates a one-time, system-code-bound key. Copy and share that key with the requester; it is not stored in readable form and is shown only in the approval response. The two-day period starts when the requester redeems the key. Extensions also grant two days from redemption.

The request list shows the system's last successful demo login, total logins, and current expiration. Click an approved request's expiration to set a specific date and time; moving it earlier or later immediately changes the Firebase license expiry used by aptPOS. The details view shows login history, system details, and demo status API payload traffic. Telemetry stores timestamps, login counts, approximate request/response payload bytes, hostname, OS, CPU, and memory in Firestore; it does not collect IP addresses or credentials. Deleting a system removes its demo data, telemetry, and any registered-system entitlement/version assignment, while preserving Firebase Authentication and `appUsers` accounts.

An approved demo system can be converted to a registered system by selecting Soft, Silver, or Standard. The **Version Control Settings** page configures which POS modules each version allows; registered aptPOS systems receive and enforce the saved policy on their next status check. New version policies initially allow every module to preserve existing access until the administrator changes and saves them.

The POS server forwards requests to this API using `DEMO_PORTAL_API_URL` (defaults to `http://127.0.0.1:3002` for both apps running on one computer). Set it to the deployed API's HTTPS base URL in each POS server environment when the apps run on different machines. GitHub stores this source code but does not run the Node API; deploy the API to a Node-capable host and keep Firebase Admin credentials in that host's secret environment, never in the browser or POS app.

## Data managed

- `appUsers/{uid}` stores the username, email, display name, role, current/demo category, disabled status, and activated app version.
- Firebase Authentication stores account credentials; passwords are never written to Firestore.
- `activationRequests/{id}` stores the selected user, requested version, note, status, and review timestamps.
- `demoRequests/{id}`, `demoLicenses/{systemHash}`, and `demoKeyClaims/{keyHash}` manage demo requests, two-day entitlements, and one-time keys.
- `registeredSystems/{systemHash}` stores converted system registrations and their selected version. `versionControl/settings` stores the allowed POS modules for Soft, Silver, and Standard.
- `portalAdmins/{uid}` identifies portal administrators. Create administrator records in the Firebase Console; the portal cannot grant admin access.
