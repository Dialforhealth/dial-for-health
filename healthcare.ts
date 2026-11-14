export type LanguageCode = 'bn' | 'en';
export type UserRole = 'user' | 'admin';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type AdCategory = 'hospital' | 'diagnostic' | 'doctor' | 'sponsored' | 'service';
export type AdPlacement =
  | 'home_top'
  | 'home_middle'
  | 'home_bottom'
  | 'doctor_banner'
  | 'hospital_banner'
  | 'diagnostic_banner'
  | 'fullscreen_promo';

export interface UserPublicProfile {
  uid: string;
  userCode?: string;
  displayName: string;
  role: 'user';
  photoUrl?: string;
  language?: LanguageCode;
  favoriteDoctorIds?: string[];
  favoriteHospitalIds?: string[];
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email?: string;
  phone?: string;
  address?: string;
  bloodGroup?: string;
  gender?: string;
  updatedAt?: unknown;
}

export interface AdminAccount {
  uid: string;
  adminId: string;
  email: string;
  name: string;
  roleLevel: 'super_admin' | 'manager' | 'moderator';
  permissions?: string[];
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Department {
  id: string;
  nameBn: string;
  nameEn: string;
  description?: string;
  displayOrder?: number;
  active: boolean;
}

export interface Doctor {
  id: string;
  name: string;
  nameEn?: string;
  degree: string;
  department: string;
  qualification?: string;
  experienceYears?: number;
  hospitalId?: string;
  hospitalName: string;
  chamberAddress?: string;
  location: string;
  visitingSchedule?: string;
  consultationFee: number;
  availableSlots?: string[];
  contactPhone?: string;
  photoUrl?: string;
  rating?: number;
  reviewCount?: number;
  featured?: boolean;
  active: boolean;
}

export interface Hospital {
  id: string;
  name: string;
  nameEn?: string;
  logoUrl?: string;
  imageUrl?: string;
  address: string;
  location: string;
  contactPhone: string;
  emergencyPhone?: string;
  description?: string;
  departments?: string[];
  diagnosticServices?: string[];
  medicalFacilities?: string[];
  visitingHours?: string;
  mapUrl?: string;
  websiteUrl?: string;
  featured?: boolean;
  published: boolean;
}

export interface DiagnosticTestItem {
  name: string;
  price: number;
}

export interface DiagnosticCenter {
  id: string;
  name: string;
  nameEn?: string;
  logoUrl?: string;
  imageUrl?: string;
  address: string;
  location: string;
  contactPhone: string;
  availableTests?: DiagnosticTestItem[];
  serviceDetails?: string;
  openingHours?: string;
  websiteUrl?: string;
  appointmentInfo?: string;
  published: boolean;
}

export interface Appointment {
  id: string;
  appointmentCode: string;
  userId: string;
  doctorId: string;
  doctorName: string;
  hospitalName: string;
  appointmentDate: string;
  appointmentTime: string;
  slotLockId: string;
  patientName: string;
  patientAge: number;
  patientGender: 'male' | 'female' | 'other';
  patientPhone: string;
  consultationFee: number;
  status: AppointmentStatus;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Advertisement {
  id: string;
  title: string;
  description?: string;
  category: AdCategory;
  placement: AdPlacement;
  imageUrl?: string;
  contactNumber?: string;
  websiteUrl?: string;
  whatsappUrl?: string;
  startDate: string;
  expiryDate: string;
  active: boolean;
  priority: number;
  impressions: number;
  clicks: number;
}

export interface AppNotification {
  id: string;
  targetUserId: string;
  title: string;
  message: string;
  type: 'appointment' | 'announcement' | 'doctor' | 'hospital' | 'advertisement';
  readBy?: string[];
  createdAt?: unknown;
}

export interface Review {
  id: string;
  doctorId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt?: unknown;
}

export interface HealthTip {
  id: string;
  title: string;
  category: string;
  summary: string;
  content?: string;
  author?: string;
  published: boolean;
  createdAt?: unknown;
}

export interface AppSettings {
  siteName: string;
  tagline: string;
  supportPhone: string;
  emergencyHotline: string;
  whatsappNumber?: string;
  supportEmail?: string;
  address?: string;
  aboutContent?: string;
  privacyContent?: string;
  termsContent?: string;
}

export interface ActivityLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetCollection: string;
  targetId?: string;
  details?: string;
  createdAt?: unknown;
}
