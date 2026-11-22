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

The Admin SDK service account is used only by the Node API, which defaults to `127.0.0.1:3002`. The browser app on port 3001 signs in with Firebase Auth and sends its Firebase ID token to that API. The API checks the `portalAdmins` document before managing accounts. For a hosted API, set `ADMIN_API_HOST=0.0.0.0`; the server also honors the hosting provider's `PORT` variable. If the browser app is hosted on another origin, set `VITE_API_BASE_URL` when building the frontend and add that exact origin to `ADMIN_PORTAL_ORIGINS` on the API. Do not use `*` for the allowed-origin list.

## Run

```powershell
npm install
npm run dev
```

Open <http://127.0.0.1:3001> on the development computer or <http://192.168.1.113:3001> from a device on the same Wi-Fi network. The development command starts the API on port 3002 and the web app on port 3001. Firebase configuration is required for sign-in and data operations.

## aptPOS demo requests

The **Demo Requests** section receives initial two-day demo requests and expired-demo extension requests from aptPOS. Approving a request generates a one-time, system-code-bound key. Copy and share that key with the requester; it is not stored in readable form and is shown only in the approval response. The two-day period starts when the requester redeems the key. Extensions also grant two days from redemption.

The POS server forwards requests to this API using `DEMO_PORTAL_API_URL` (defaults to `http://127.0.0.1:3002` for both apps running on one computer). Set it to the deployed API's HTTPS base URL in each POS server environment when the apps run on different machines. GitHub stores this source code but does not run the Node API; deploy the API to a Node-capable host and keep Firebase Admin credentials in that host's secret environment, never in the browser or POS app.

## Data managed

- `appUsers/{uid}` stores the username, email, display name, role, current/demo category, disabled status, and activated app version.
- Firebase Authentication stores account credentials; passwords are never written to Firestore.
- `activationRequests/{id}` stores the selected user, requested version, note, status, and review timestamps.
- `demoRequests/{id}`, `demoLicenses/{systemHash}`, and `demoKeyClaims/{keyHash}` manage demo requests, two-day entitlements, and one-time keys.
- `portalAdmins/{uid}` identifies portal administrators. Create administrator records in the Firebase Console; the portal cannot grant admin access.
