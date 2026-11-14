import { LanguageCode } from '../types/healthcare';

export const TRANSLATIONS = {
  bn: {
    brand: 'Dial for Health',
    tagline: 'Your Health, Our Priority',
    nav: {
      home: 'হোম',
      doctors: 'ডাক্তার',
      hospitals: 'হাসপাতাল',
      diagnostics: 'ডায়াগনস্টিক',
      appointments: 'অ্যাপয়েন্টমেন্ট',
      about: 'আমাদের সম্পর্কে',
      contact: 'যোগাযোগ',
    },
    actions: {
      login: 'লগইন / নিবন্ধন',
      dashboard: 'ড্যাশবোর্ড',
      adminPanel: 'অ্যাডমিন প্যানেল',
      bookNow: 'অ্যাপয়েন্টমেন্ট নিন',
      searchPlaceholder: 'ডাক্তার, বিশেষজ্ঞ, হাসপাতাল বা লোকেশন খুঁজুন...',
      searchBtn: 'খুঁজুন',
      viewDetails: 'বিস্তারিত দেখুন',
      save: 'সংরক্ষণ করুন',
      cancel: 'বাতিল করুন',
      logout: 'লগআউট',
    },
    status: {
      pending: 'অপেক্ষমাণ',
      confirmed: 'নিশ্চিত',
      cancelled: 'বাতিল',
      completed: 'সম্পন্ন',
    },
    hero: {
      kicker: 'বাংলাদেশের ডিজিটাল স্বাস্থ্যসেবা নেটওয়ার্ক',
      title: 'সঠিক ডাক্তার, হাসপাতাল ও ডায়াগনস্টিক সেবা—এক ঠিকানায়',
      subtitle:
        'দেশব্যাপী তালিকাভুক্ত বিশেষজ্ঞ চিকিৎসকের সময়সূচি দেখুন, রিয়েল-টাইম স্লটে ডাবল-বুকিং ছাড়াই অনলাইন অ্যাপয়েন্টমেন্ট নিন এবং ২৪/৭ জরুরি তথ্য পান।',
      ctaPrimary: 'এখনই ডাক্তার খুঁজুন',
      ctaSecondary: 'হাসপাতাল ও জরুরি সেবা',
    },
  },
  en: {
    brand: 'Dial for Health',
    tagline: 'Your Health, Our Priority',
    nav: {
      home: 'Home',
      doctors: 'Doctors',
      hospitals: 'Hospitals',
      diagnostics: 'Diagnostics',
      appointments: 'Appointments',
      about: 'About Us',
      contact: 'Contact',
    },
    actions: {
      login: 'Login / Register',
      dashboard: 'Dashboard',
      adminPanel: 'Admin Panel',
      bookNow: 'Book Appointment',
      searchPlaceholder: 'Search doctors, specialties, hospitals, or cities...',
      searchBtn: 'Search',
      viewDetails: 'View Details',
      save: 'Save',
      cancel: 'Cancel',
      logout: 'Logout',
    },
    status: {
      pending: 'Pending',
      confirmed: 'Confirmed',
      cancelled: 'Cancelled',
      completed: 'Completed',
    },
    hero: {
      kicker: 'Bangladesh Digital Healthcare Network',
      title: 'Verified Doctors, Hospitals & Diagnostic Care in One Platform',
      subtitle:
        'Browse specialist schedules across Bangladesh, reserve real-time slots with double-booking protection, and locate emergency hospital services.',
      ctaPrimary: 'Find a Doctor',
      ctaSecondary: 'Hospitals & Emergency',
    },
  },
} as const;

export function t(lang: LanguageCode) {
  return TRANSLATIONS[lang];
}
