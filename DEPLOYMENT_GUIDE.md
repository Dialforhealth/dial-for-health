# Dial for Health — Deployment, Firebase & Security Guide

**Tagline:** *Your Health, Our Priority.*  
**Platform:** Unified Bangladesh Healthcare Web Platform (User Panel `/` + `/dashboard` & Admin Panel `/admin/login` + `/admin/dashboard`)

---

## 1. Firebase Services Provisioned & Configuration

This project is connected to Firebase Project `gen-lang-client-0553508174` via `firebase-applet-config.json`.

### Enable Additional Sign-In Methods in Firebase Console
Google Sign-In is active out-of-the-box. To enable **Email/Password** and **Real SMS Phone OTP**:
1. Open [Firebase Console](https://console.firebase.google.com/) → select your project (`gen-lang-client-0553508174`).
2. Navigate to **Authentication → Sign-in method**.
3. Enable **Email/Password**.
4. Enable **Phone** (for real SMS OTP verification via `RecaptchaVerifier` + `signInWithPhoneNumber`). Add your test numbers for development or attach a billing account for live Bangladesh SMS delivery.
5. Add your production domain under **Authentication → Settings → Authorized domains**.
6. Enable **Firebase App Check** (reCAPTCHA v3 / Enterprise) in **App Check** to protect Firestore & Storage from unauthorized API traffic.

---

## 2. Firestore Database Structure

Defined in `firebase-blueprint.json` and enforced by `firestore.rules`:
- `/users/{userId}` + `/users/{userId}/private/contact` (PII-isolated contact data)
- `/admins/{adminId}` (Server-verified admin registry & permissions)
- `/doctors/{doctorId}`
- `/hospitals/{hospitalId}`
- `/diagnostic_centers/{centerId}`
- `/departments/{departmentId}`
- `/appointments/{appointmentId}`
- `/appointment_slots/{slotLockId}` (Atomic lock preventing double booking)
- `/advertisements/{adId}` (Placement, start/expiry dates, priority, clicks)
- `/notifications/{notificationId}`
- `/reviews/{reviewId}`
- `/health_tips/{tipId}`
- `/app_settings/global`
- `/activity_logs/{logId}`

---

## 3. First Administrator Setup & Role Protection

- Primary administrator access is bootstrapped securely for verified email `sayed.gemini26@gmail.com` in `firestore.rules` (`isVerifiedAdminEmail()`).
- Additional admins can only be added by an existing verified administrator from **Admin Dashboard → M. Admin Account Management** (`/admin/dashboard`).
- Ordinary users (`role: 'user'`) are strictly blocked by Firestore Security Rules from writing to `/admins`, `/doctors`, `/hospitals`, `/diagnostic_centers`, `/advertisements`, `/health_tips`, `/app_settings`, or `/activity_logs`.

---

## 4. Deploying Cloud Functions, Security Rules & Storage Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Cloud Functions source is located in `functions/src/index.ts` (`createVerifiedAppointment`, `syncAdminClaims`, `onAppointmentStatusChanged`).

---

## 5. Production Build & Hosting (Firebase Hosting or Vercel)

```bash
npm install
npm run build
```

- **Firebase Hosting:** Point `public` to `dist` with SPA rewrite `** -> /index.html` and run `firebase deploy --only hosting`.
- **Vercel:** Connect GitHub repository, build command `npm run build`, output directory `dist`. Add a `vercel.json` rewrite `{ "source": "/(.*)", "destination": "/index.html" }`.
- **Custom Domain:** Add your domain (e.g., `dialforhealth.bd`) in Firebase Hosting or Vercel → Domains, update DNS `A` / `CNAME` records, and authorize the domain in Firebase Auth.
