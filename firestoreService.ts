import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import {
  ActivityLog,
  AdminAccount,
  Advertisement,
  AppNotification,
  AppSettings,
  Appointment,
  AppointmentStatus,
  Department,
  DiagnosticCenter,
  Doctor,
  HealthTip,
  Hospital,
  Review,
  UserPrivateInfo,
  UserPublicProfile,
} from '../types/healthcare';

export function normalizeSlotLockId(
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string
): string {
  return `${doctorId}_${appointmentDate}_${appointmentTime}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
}

export async function uploadHealthcareImage(
  file: File,
  folder: 'profiles' | 'doctors' | 'hospitals' | 'diagnostics' | 'advertisements',
  ownerUid?: string
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধুমাত্র ইমেজ ফাইল (JPG, PNG, WebP) আপলোড করা যাবে।');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('ছবির আকার ৫ মেগাবাইটের কম হতে হবে।');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path =
    folder === 'profiles' && ownerUid
      ? `profiles/${ownerUid}/${Date.now()}_${safeName}`
      : `${folder}/${Date.now()}_${safeName}`;

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

export async function ensureUserProfile(params: {
  uid: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
}) {
  const userRef = doc(db, 'users', params.uid);
  const privateRef = doc(db, 'users', params.uid, 'private', 'contact');
  try {
    const snap = await getDoc(userRef);
    const now = serverTimestamp();
    if (!snap.exists()) {
      const userCode = `DFH-${params.uid.slice(0, 6).toUpperCase()}`;
      await setDoc(userRef, {
        uid: params.uid,
        userCode,
        displayName: (params.displayName || 'রোগী').slice(0, 120),
        role: 'user',
        photoUrl: params.photoUrl || '',
        language: 'bn',
        favoriteDoctorIds: [],
        favoriteHospitalIds: [],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists()) {
      await setDoc(privateRef, {
        uid: params.uid,
        email: (params.email || '').slice(0, 160),
        phone: (params.phone || '').slice(0, 30),
        address: '',
        bloodGroup: '',
        gender: '',
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

export async function updateUserProfileData(
  uid: string,
  publicUpdates: Partial<Pick<UserPublicProfile, 'displayName' | 'photoUrl' | 'language'>>,
  privateUpdates: Partial<Pick<UserPrivateInfo, 'email' | 'phone' | 'address' | 'bloodGroup' | 'gender'>>
) {
  try {
    const now = serverTimestamp();
    if (Object.keys(publicUpdates).length > 0) {
      await updateDoc(doc(db, 'users', uid), {
        ...publicUpdates,
        updatedAt: now,
      });
    }
    if (Object.keys(privateUpdates).length > 0) {
      await setDoc(
        doc(db, 'users', uid, 'private', 'contact'),
        {
          uid,
          ...privateUpdates,
          updatedAt: now,
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function toggleFavoriteItem(
  uid: string,
  type: 'doctor' | 'hospital',
  itemId: string,
  currentlyFavorite: boolean
) {
  const field = type === 'doctor' ? 'favoriteDoctorIds' : 'favoriteHospitalIds';
  try {
    await updateDoc(doc(db, 'users', uid), {
      [field]: currentlyFavorite ? arrayRemove(itemId) : arrayUnion(itemId),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

/**
 * Atomic transaction booking preventing double booking across concurrent requests.
 */
export async function bookAppointmentTransaction(input: {
  userId: string;
  doctorId: string;
  doctorName: string;
  hospitalName: string;
  appointmentDate: string;
  appointmentTime: string;
  patientName: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  patientPhone: string;
  consultationFee: number;
  notes?: string;
}): Promise<{ appointmentId: string; appointmentCode: string }> {
  const slotLockId = normalizeSlotLockId(
    input.doctorId,
    input.appointmentDate,
    input.appointmentTime
  );
  const appointmentRef = doc(collection(db, 'appointments'));
  const slotRef = doc(db, 'appointment_slots', slotLockId);
  const appointmentCode = `DFH-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  try {
    await runTransaction(db, async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists()) {
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      const now = serverTimestamp();
      tx.set(appointmentRef, {
        appointmentCode,
        userId: input.userId,
        doctorId: input.doctorId,
        doctorName: input.doctorName.slice(0, 120),
        hospitalName: input.hospitalName.slice(0, 160),
        appointmentDate: input.appointmentDate.slice(0, 20),
        appointmentTime: input.appointmentTime.slice(0, 40),
        slotLockId,
        patientName: input.patientName.trim().slice(0, 120),
        patientAge: Number(input.patientAge),
        patientGender: input.patientGender,
        patientPhone: input.patientPhone.trim().slice(0, 30),
        consultationFee: Number(input.consultationFee),
        status: 'pending',
        notes: (input.notes || '').trim().slice(0, 500),
        createdAt: now,
        updatedAt: now,
      });

      tx.set(slotRef, {
        appointmentId: appointmentRef.id,
        userId: input.userId,
        doctorId: input.doctorId,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        createdAt: now,
      });
    });

    // Notify user immediately inside Firestore notification center
    await addDoc(collection(db, 'notifications'), {
      targetUserId: input.userId,
      title: `অ্যাপয়েন্টমেন্ট অনুরোধ গৃহীত (${appointmentCode})`,
      message: `${input.doctorName} (${input.appointmentDate}, ${input.appointmentTime}) এর জন্য আপনার বুকিং অপেক্ষমাণ রয়েছে।`,
      type: 'appointment',
      readBy: [],
      createdAt: serverTimestamp(),
    });

    return { appointmentId: appointmentRef.id, appointmentCode };
  } catch (error) {
    if (error instanceof Error && error.message === 'SLOT_ALREADY_BOOKED') {
      throw new Error(
        'দুঃখিত, এই তারিখ ও সময়ের স্লটটি ইতিমধ্যে বুক হয়ে গেছে। অনুগ্রহ করে অন্য একটি সময় নির্বাচন করুন।'
      );
    }
    handleFirestoreError(error, OperationType.WRITE, `appointments/${appointmentRef.id}`);
  }
}

export async function cancelUserAppointment(appointment: Appointment) {
  try {
    await runTransaction(db, async (tx) => {
      const appRef = doc(db, 'appointments', appointment.id);
      const slotRef = doc(db, 'appointment_slots', appointment.slotLockId);
      tx.update(appRef, {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      tx.delete(slotRef);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${appointment.id}`);
  }
}

export async function adminUpdateAppointment(
  appointment: Appointment,
  updates: { status?: AppointmentStatus; appointmentDate?: string; appointmentTime?: string }
) {
  try {
    await runTransaction(db, async (tx) => {
      const appRef = doc(db, 'appointments', appointment.id);
      const oldSlotRef = doc(db, 'appointment_slots', appointment.slotLockId);

      const newDate = updates.appointmentDate || appointment.appointmentDate;
      const newTime = updates.appointmentTime || appointment.appointmentTime;
      const newSlotLockId = normalizeSlotLockId(appointment.doctorId, newDate, newTime);

      if (updates.status === 'cancelled') {
        tx.delete(oldSlotRef);
      } else if (newSlotLockId !== appointment.slotLockId) {
        const newSlotRef = doc(db, 'appointment_slots', newSlotLockId);
        const existingNew = await tx.get(newSlotRef);
        if (existingNew.exists()) {
          throw new Error('নির্বাচিত নতুন স্লটটি ইতিমধ্যে বুক করা আছে।');
        }
        tx.delete(oldSlotRef);
        tx.set(newSlotRef, {
          appointmentId: appointment.id,
          userId: appointment.userId,
          doctorId: appointment.doctorId,
          appointmentDate: newDate,
          appointmentTime: newTime,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(appRef, {
        status: updates.status || appointment.status,
        appointmentDate: newDate,
        appointmentTime: newTime,
        slotLockId: newSlotLockId,
        updatedAt: serverTimestamp(),
      });
    });

    await addDoc(collection(db, 'notifications'), {
      targetUserId: appointment.userId,
      title: `অ্যাপয়েন্টমেন্ট আপডেট (${appointment.appointmentCode})`,
      message: `${appointment.doctorName}-এর সাথে আপনার অ্যাপয়েন্টমেন্টটি আপডেট করা হয়েছে (${updates.status || appointment.status})।`,
      type: 'appointment',
      readBy: [],
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('স্লটটি ইতিমধ্যে')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `appointments/${appointment.id}`);
  }
}

export async function logAdminActivity(
  action: string,
  targetCollection: string,
  targetId = '',
  details = ''
) {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await addDoc(collection(db, 'activity_logs'), {
      actorUid: user.uid,
      actorEmail: user.email || '',
      action: action.slice(0, 120),
      targetCollection: targetCollection.slice(0, 80),
      targetId: targetId.slice(0, 128),
      details: details.slice(0, 400),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Activity log skipped:', error);
  }
}

export async function submitDoctorReview(input: {
  doctorId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
}) {
  try {
    await addDoc(collection(db, 'reviews'), {
      doctorId: input.doctorId,
      userId: input.userId,
      userName: input.userName.slice(0, 120),
      rating: Math.min(5, Math.max(1, Number(input.rating))),
      comment: input.comment.trim().slice(0, 600),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reviews');
  }
}

export async function trackAdvertisementClick(adId: string) {
  try {
    await updateDoc(doc(db, 'advertisements', adId), {
      clicks: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-blocking telemetry
    console.debug('Ad click track skipped', error);
  }
}

export async function markNotificationRead(notificationId: string, uid: string) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      readBy: arrayUnion(uid),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

// Generic Admin CRUD Helpers
export async function saveEntity(
  collectionName: string,
  id: string | null,
  data: Record<string, unknown>,
  actionLabel: string
) {
  try {
    const now = serverTimestamp();
    if (id) {
      await updateDoc(doc(db, collectionName, id), {
        ...data,
        updatedAt: now,
      });
      await logAdminActivity(actionLabel, collectionName, id, 'Updated record');
      return id;
    } else {
      const refDoc = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: now,
        updatedAt: now,
      });
      await logAdminActivity(actionLabel, collectionName, refDoc.id, 'Created record');
      return refDoc.id;
    }
  } catch (error) {
    handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, collectionName);
  }
}

export async function deleteEntity(
  collectionName: string,
  id: string,
  actionLabel: string
) {
  try {
    await deleteDoc(doc(db, collectionName, id));
    await logAdminActivity(actionLabel, collectionName, id, 'Deleted record');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
  }
}

export async function saveAppSettings(settings: AppSettings) {
  try {
    await setDoc(
      doc(db, 'app_settings', 'global'),
      {
        ...settings,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await logAdminActivity('Update Website Settings', 'app_settings', 'global', settings.siteName);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'app_settings/global');
  }
}

export async function sendAdminNotification(input: {
  targetUserId: string;
  title: string;
  message: string;
  type: AppNotification['type'];
}) {
  try {
    const refDoc = await addDoc(collection(db, 'notifications'), {
      targetUserId: input.targetUserId || 'all',
      title: input.title.trim().slice(0, 160),
      message: input.message.trim().slice(0, 600),
      type: input.type,
      readBy: [],
      createdAt: serverTimestamp(),
    });
    await logAdminActivity('Send Notification', 'notifications', refDoc.id, input.title);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'notifications');
  }
}

// Subscriptions
export function subscribeCollection<T>(
  collectionName: string,
  callback: (items: T[]) => void,
  orderField?: string
) {
  const q = orderField
    ? query(collection(db, collectionName), orderBy(orderField, 'desc'))
    : collection(db, collectionName);
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as T[];
      callback(data);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export function subscribeUserAppointments(
  uid: string,
  callback: (items: Appointment[]) => void
) {
  const q = query(
    collection(db, 'appointments'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Appointment[];
      callback(data);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    }
  );
}

export function subscribeDoctorReviews(
  doctorId: string,
  callback: (items: Review[]) => void
) {
  const q = query(
    collection(db, 'reviews'),
    where('doctorId', '==', doctorId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Review[];
      callback(data);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reviews');
    }
  );
}

export function subscribeUserNotifications(
  uid: string,
  callback: (items: AppNotification[]) => void
) {
  const q = query(
    collection(db, 'notifications'),
    where('targetUserId', 'in', ['all', uid]),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as AppNotification[];
      callback(data);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    }
  );
}

/**
 * Admin-only utility to populate initial Bangladesh healthcare records directly into Cloud Firestore.
 */
export async function seedInitialHealthcareData() {
  const batch = writeBatch(db);
  const now = serverTimestamp();

  const departments = [
    { id: 'dept-cardiology', nameBn: 'হৃদরোগ (কার্ডিওলজি)', nameEn: 'Cardiology', description: 'হৃৎপিণ্ড ও রক্তনালী সংক্রান্ত চিকিৎসা ও ইন্টারভেনশন', displayOrder: 1 },
    { id: 'dept-medicine', nameBn: 'মেডিসিন', nameEn: 'Internal Medicine', description: 'জ্বর, ডায়াবেটিস, উচ্চ রক্তচাপ ও সাধারণ মেডিসিন', displayOrder: 2 },
    { id: 'dept-gynecology', nameBn: 'স্ত্রী ও প্রসূতিবিদ্যা', nameEn: 'Gynecology & Obstetrics', description: 'মাতৃস্বাস্থ্য, গর্ভাবস্থা ও প্রসূতি সেবা', displayOrder: 3 },
    { id: 'dept-pediatrics', nameBn: 'শিশু রোগ', nameEn: 'Pediatrics', description: 'নবজাতক ও শিশু-কিশোর স্বাস্থ্যসেবা', displayOrder: 4 },
    { id: 'dept-orthopedics', nameBn: 'অর্থোপেডিকস', nameEn: 'Orthopedics', description: 'হাড়, জয়েন্ট ও মেরুদণ্ডের চিকিৎসা', displayOrder: 5 },
    { id: 'dept-neurology', nameBn: 'নিউরোলজি', nameEn: 'Neurology', description: 'মস্তিষ্ক ও স্নায়ুতন্ত্রের বিশেষজ্ঞ সেবা', displayOrder: 6 },
  ];

  departments.forEach((dept) => {
    batch.set(doc(db, 'departments', dept.id), {
      ...dept,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  const hospitals = [
    {
      id: 'hosp-dhaka-medical-care',
      name: 'মেট্রোপলিটন স্পেশালাইজড হাসপাতাল',
      nameEn: 'Metropolitan Specialized Hospital',
      address: 'প্লট ১৮, রোড ২, ধানমন্ডি, ঢাকা ১২০৫',
      location: 'ঢাকা',
      contactPhone: '+880 1711-002233',
      emergencyPhone: '10655',
      description: '২৪ ঘণ্টা জরুরি বিভাগ, আইসিইউ, সিসিইউ এবং আধুনিক কার্ডিয়াক ক্যাথ-ল্যাব সমৃদ্ধ মাল্টি-স্পেশালিটি হাসপাতাল।',
      departments: ['হৃদরোগ (কার্ডিওলজি)', 'মেডিসিন', 'অর্থোপেডিকস', 'নিউরোলজি'],
      diagnosticServices: ['৩ টেসলা এমআরআই', '১২৮ স্লাইস সিটি স্ক্যান', 'ইকোকার্ডিওগ্রাম'],
      medicalFacilities: ['২৪/৭ ইমার্জেন্সি', 'আইসিইউ ও এনআইসিইউ', 'ফার্মেসি', 'অ্যাম্বুলেন্স'],
      visitingHours: 'সকাল ৮:০০ – রাত ১০:০০ (ইমার্জেন্সি ২৪ ঘণ্টা)',
      mapUrl: 'https://maps.google.com/?q=Dhanmondi+Dhaka',
      websiteUrl: 'https://dialforhealth.bd',
      imageUrl: '/src/assets/images/hospital_modern_center_1794682562193.jpg',
      featured: true,
      published: true,
    },
    {
      id: 'hosp-chattogram-central',
      name: 'চট্টগ্রাম সেন্ট্রাল কেয়ার হাসপাতাল',
      nameEn: 'Chattogram Central Care Hospital',
      address: 'জিইসি মোড়, ও.আর. নিজাম রোড, চট্টগ্রাম ৪০০০',
      location: 'চট্টগ্রাম',
      contactPhone: '+880 1819-445566',
      emergencyPhone: '10678',
      description: 'চট্টগ্রাম বিভাগের আধুনিক প্রসূতি, শিশু ও জেনারেল সার্জারি কেন্দ্র।',
      departments: ['স্ত্রী ও প্রসূতিবিদ্যা', 'শিশু রোগ', 'মেডিসিন'],
      diagnosticServices: ['৪ডি আল্ট্রাসনোগ্রাফি', 'ডিজিটাল এক্স-রে', 'প্যাথলজি ল্যাব'],
      medicalFacilities: ['২৪/৭ জরুরি বিভাগ', 'ব্লাড ব্যাংক', 'লেবার স্যুইট'],
      visitingHours: 'সকাল ৯:০০ – রাত ৯:০০',
      mapUrl: 'https://maps.google.com/?q=GEC+Circle+Chattogram',
      websiteUrl: 'https://dialforhealth.bd',
      imageUrl: '/src/assets/images/hero_healthcare_bangladesh_1794682597661.jpg',
      featured: true,
      published: true,
    },
  ];

  hospitals.forEach((h) => {
    batch.set(doc(db, 'hospitals', h.id), { ...h, createdAt: now, updatedAt: now });
  });

  const doctors = [
    {
      id: 'doc-rahim-chowdhury',
      name: 'অধ্যাপক ডা. রহিম চৌধুরী',
      nameEn: 'Prof. Dr. Rahim Chowdhury',
      degree: 'এমবিবিএস, এমডি (কার্ডিওলজি), এফসিপিএস',
      department: 'হৃদরোগ (কার্ডিওলজি)',
      qualification: 'প্রাক্তন সিনিয়র কনসালটেন্ট, জাতীয় হৃদরোগ ইনস্টিটিউট',
      experienceYears: 18,
      hospitalId: 'hosp-dhaka-medical-care',
      hospitalName: 'মেট্রোপলিটন স্পেশালাইজড হাসপাতাল',
      chamberAddress: 'রুম ৪০২, চতুর্থ তলা, ধানমন্ডি, ঢাকা',
      location: 'ঢাকা',
      visitingSchedule: 'শনি – বুধ, বিকাল ৫:০০ – রাত ৯:০০',
      consultationFee: 1200,
      availableSlots: ['05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '08:00 PM'],
      contactPhone: '+880 1711-002233',
      photoUrl: '/src/assets/images/doctor_specialist_male_1794682561273.jpg',
      rating: 4.9,
      reviewCount: 42,
      featured: true,
      active: true,
    },
    {
      id: 'doc-amina-khan',
      name: 'ডা. আমিনা খান',
      nameEn: 'Dr. Amina Khan',
      degree: 'এমবিবিএস, এফসিপিএস (গাইনি ও অবস)',
      department: 'স্ত্রী ও প্রসূতিবিদ্যা',
      qualification: 'কনসালটেন্ট গাইনি ও ল্যাপারোস্কোপিক সার্জন',
      experienceYears: 12,
      hospitalId: 'hosp-chattogram-central',
      hospitalName: 'চট্টগ্রাম সেন্ট্রাল কেয়ার হাসপাতাল',
      chamberAddress: 'রুম ২০৫, দ্বিতীয় তলা, জিইসি মোড়, চট্টগ্রাম',
      location: 'চট্টগ্রাম',
      visitingSchedule: 'রবি – বৃহঃ, সকাল ১০:০০ – বিকাল ৪:০০',
      consultationFee: 1000,
      availableSlots: ['10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '03:00 PM', '03:30 PM'],
      contactPhone: '+880 1819-445566',
      photoUrl: '/src/assets/images/doctor_specialist_female_1794682561195.jpg',
      rating: 4.8,
      reviewCount: 31,
      featured: true,
      active: true,
    },
    {
      id: 'doc-tareq-hasan',
      name: 'ডা. তারেক হাসান',
      nameEn: 'Dr. Tareq Hasan',
      degree: 'এমবিবিএস, বিসিএস (স্বাস্থ্য), এমডি (মেডিসিন)',
      department: 'মেডিসিন',
      qualification: 'ডায়াবেটিস ও ইন্টারনাল মেডিসিন বিশেষজ্ঞ',
      experienceYears: 10,
      hospitalId: 'hosp-dhaka-medical-care',
      hospitalName: 'মেট্রোপলিটন স্পেশালাইজড হাসপাতাল',
      chamberAddress: 'রুম ৩০৮, তৃতীয় তলা, ধানমন্ডি, ঢাকা',
      location: 'ঢাকা',
      visitingSchedule: 'প্রতিদিন সন্ধ্যা ৬:০০ – রাত ৯:৩০ (শুক্রবার বন্ধ)',
      consultationFee: 800,
      availableSlots: ['06:00 PM', '06:30 PM', '07:30 PM', '08:00 PM', '08:30 PM'],
      contactPhone: '+880 1711-002233',
      photoUrl: '/src/assets/images/doctor_specialist_male_1794682561273.jpg',
      rating: 4.7,
      reviewCount: 19,
      featured: true,
      active: true,
    },
  ];

  doctors.forEach((d) => {
    batch.set(doc(db, 'doctors', d.id), { ...d, createdAt: now, updatedAt: now });
  });

  batch.set(doc(db, 'diagnostic_centers', 'diag-popular-digital'), {
    name: 'লাইফলাইন ডিজিটাল ডায়াগনস্টিক সেন্টার',
    nameEn: 'Lifeline Digital Diagnostic Center',
    address: 'বাড়ি ১২, রোড ৪, বনানী, ঢাকা ১২১৩',
    location: 'ঢাকা',
    contactPhone: '+880 1755-889900',
    imageUrl: '/src/assets/images/diagnostic_center_lab_1794682562301.jpg',
    availableTests: [
      { name: 'সম্পূর্ণ রক্ত পরীক্ষা (CBC)', price: 450 },
      { name: 'লিপিড প্রোফাইল ও কোলেস্টেরল', price: 1100 },
      { name: 'ডায়াবেটিস (HbA1c)', price: 950 },
      { name: 'ডিজিটাল বুকের এক্স-রে', price: 600 },
      { name: 'পুরো পেটের আল্ট্রাসনোগ্রাম', price: 1500 },
    ],
    serviceDetails: 'হোম স্যাম্পল কালেকশন, অনলাইন পিডিএফ রিপোর্ট ডেলিভারি এবং আন্তর্জাতিক মানের অটোমেটেড অ্যানালাইজার।',
    openingHours: 'সকাল ৭:০০ – রাত ১১:০০ (সপ্তাহে ৭ দিন)',
    websiteUrl: 'https://dialforhealth.bd',
    appointmentInfo: 'সকালবেলা খালি পেটে রক্তের নমুনা দেওয়ার জন্য আগে কল বা অনলাইন স্লট নিন।',
    published: true,
    createdAt: now,
    updatedAt: now,
  });

  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);
  const startDate = today.toISOString().split('T')[0];
  const expiryDate = nextYear.toISOString().split('T')[0];

  batch.set(doc(db, 'advertisements', 'ad-cardiac-checkup'), {
    title: 'সম্পূর্ণ হার্ট চেকআপ প্যাকেজ — ২৫% বিশেষ ছাড়',
    description: 'ইসিজি, ইকো, লিপিড প্রোফাইল ও কার্ডিওলজিস্ট কনসালটেশন একসাথে এখন ৳ ৩,৫০০ টাকায়।',
    category: 'hospital',
    placement: 'home_top',
    imageUrl: '/src/assets/images/hero_healthcare_bangladesh_1794682597661.jpg',
    contactNumber: '+8801711002233',
    websiteUrl: '/hospitals',
    whatsappUrl: 'https://wa.me/8801711002233',
    startDate,
    expiryDate,
    active: true,
    priority: 10,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'advertisements', 'ad-diagnostic-home'), {
    title: 'ঘরে বসে রক্ত পরীক্ষা ও ডায়াবেটিস স্ক্রিনিং',
    description: 'ঢাকা ও চট্টগ্রামে দক্ষ টেকনিশিয়ানের মাধ্যমে বিনামূল্যে হোম স্যাম্পল কালেকশন এবং ৬ ঘণ্টায় অনলাইন রিপোর্ট।',
    category: 'diagnostic',
    placement: 'home_middle',
    imageUrl: '/src/assets/images/diagnostic_center_lab_1794682562301.jpg',
    contactNumber: '+8801755889900',
    websiteUrl: '/diagnostic-centers',
    whatsappUrl: 'https://wa.me/8801755889900',
    startDate,
    expiryDate,
    active: true,
    priority: 8,
    impressions: 0,
    clicks: 0,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'health_tips', 'tip-heart-prevention'), {
    title: 'উচ্চ রক্তচাপ নিয়ন্ত্রণে দৈনন্দিন ৫টি কার্যকর অভ্যাস',
    category: 'হৃদরোগ প্রতিরোধ',
    summary: 'খাবারে অতিরিক্ত লবণ কমানো, প্রতিদিন ৩০ মিনিট হাঁটা এবং নিয়মিত রক্তচাপ পরিমাপের সঠিক নিয়ম।',
    content: 'উচ্চ রক্তচাপকে নীরব ঘাতক বলা হয়। প্রতিদিন নির্দিষ্ট সময়ে রক্তচাপ পরিমাপ, পর্যাপ্ত ঘুম, তাজা শাকসবজি গ্রহণ এবং চিকিৎসকের পরামর্শ ছাড়া ওষুধ বন্ধ না করা অত্যন্ত জরুরি।',
    author: 'অধ্যাপক ডা. রহিম চৌধুরী',
    published: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'health_tips', 'tip-hydration-monsoon'), {
    title: 'মৌসুমি জ্বর ও ডেঙ্গু প্রতিরোধে করণীয়',
    category: 'জনস্বাস্থ্য সতর্কতা',
    summary: 'জ্বর হলে দ্রুত এনএস১ অ্যান্টিজেন পরীক্ষা, পর্যাপ্ত তরল পান এবং ব্যথানাশক ওষুধ ব্যবহারে সতর্কতা।',
    content: 'তিন দিনের বেশি জ্বর থাকলে অথবা তীব্র মাথাব্যথা ও শরীর ব্যথা অনুভব করলে দেরি না করে চিকিৎসকের পরামর্শ নিন এবং বাসার আশপাশে জমে থাকা পানি পরিষ্কার রাখুন।',
    author: 'ডা. তারেক হাসান',
    published: true,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'app_settings', 'global'), {
    siteName: 'Dial for Health',
    tagline: 'Your Health, Our Priority',
    supportPhone: '+880 1700-112233',
    emergencyHotline: '999 / 16263',
    whatsappNumber: '+8801700112233',
    supportEmail: 'support@dialforhealth.bd',
    address: 'হাউজ ২৪, রোড ১১, বনানী, ঢাকা ১২১৩, বাংলাদেশ',
    aboutContent:
      'Dial for Health বাংলাদেশের রোগী ও চিকিৎসকদের মধ্যে দ্রুত, স্বচ্ছ ও নির্ভরযোগ্য সংযোগ স্থাপনের একটি পূর্ণাঙ্গ ডিজিটাল স্বাস্থ্যসেবা প্ল্যাটফর্ম।',
    privacyContent:
      'রোগীর ব্যক্তিগত তথ্য, মোবাইল নম্বর এবং অ্যাপয়েন্টমেন্টের বিবরণ সম্পূর্ণ এনক্রিপ্টেড ও নিরাপদ Firebase অবকাঠামোতে সংরক্ষিত থাকে। তৃতীয় পক্ষের সাথে কোনো ব্যক্তিগত তথ্য বিনিময় করা হয় না।',
    termsContent:
      'অনলাইন অ্যাপয়েন্টমেন্টের মাধ্যমে চিকিৎসকের নির্ধারিত চেম্বারে সাক্ষাতের সময় সংরক্ষণ করা হয়। জরুরি মেডিকেল অবস্থায় নিকটস্থ হাসপাতালের জরুরি বিভাগে যোগাযোগ করুন।',
    updatedAt: now,
  });

  await batch.commit();
  await logAdminActivity('Seed Initial Healthcare Data', 'all', 'batch', 'Initialized Bangladesh catalog');
}
