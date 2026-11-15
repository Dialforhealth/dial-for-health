# Dial for Health — Website starter
Bilingual (Bangla/English) React + Vite + Firebase starter for Bangladesh.

## Important
This is a functional starter, not a fully production-ready medical platform. Admin dashboard CRUD, payment, SMS/phone OTP, FCM web-push setup, doctor/hospital content, legal/privacy pages, monitoring and full QA still need implementation. Do not store sensitive medical records until security and privacy review is complete.

## Setup
1. Create a Firebase project and register a Web app.
2. Enable Email/Password Authentication and create a Cloud Firestore database.
3. Copy `.env.example` to `.env` and fill the Firebase Web App config. Never commit `.env`.
4. Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID.
5. Run `npm install`, `npm run build`, `npm run dev`.
6. In Firebase Console, create an initial admin document manually at `admins/{adminUid}` with `{ "active": true, "roleLevel": "superadmin" }`. Protect this process; never expose admin creation to public users.
7. Run `cd functions && npm install && npm run build`, then from project root deploy rules and functions using Firebase CLI. Cloud Functions deployment may require a billing-enabled Firebase/Google Cloud project.
8. Add doctor documents to `doctors` with at least `name`, `active: true`, `specialty`, `hospitalName`, and `consultationFee`.

## Deploy
`npm run build`, then `firebase deploy --only hosting`. Configure Vercel separately if preferred; add the same VITE_FIREBASE_* environment variables and use `npm run build` with output `dist`.

## Security
Firestore rules deny client-side appointment creation and slot writes; booking must go through the callable Cloud Function. Review and test rules with the Firebase Emulator Suite before production. Storage rules here are a minimal example and should be tightened to admin-only uploads.
