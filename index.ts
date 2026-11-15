import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
admin.initializeApp();
const db=admin.firestore();
function normalizeSlotKey(doctorId:string,date:string,time:string){return `${doctorId}_${date}_${time}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,128);}
export const createVerifiedAppointment=onCall(async request=>{
 if(!request.auth) throw new HttpsError('unauthenticated','Authentication required.');
 const {doctorId,appointmentDate,appointmentTime,patientName,patientAge,patientGender,patientPhone,notes}=request.data as Record<string,unknown>;
 if(typeof doctorId!=='string'||typeof appointmentDate!=='string'||typeof appointmentTime!=='string'||typeof patientName!=='string'||typeof patientPhone!=='string') throw new HttpsError('invalid-argument','Missing required appointment fields.');
 const slotLockId=normalizeSlotKey(doctorId,appointmentDate,appointmentTime), appointmentRef=db.collection('appointments').doc(),slotRef=db.collection('appointment_slots').doc(slotLockId),doctorRef=db.collection('doctors').doc(doctorId);
 return db.runTransaction(async tx=>{
  const [doctorSnap,slotSnap]=await Promise.all([tx.get(doctorRef),tx.get(slotRef)]);
  if(!doctorSnap.exists||doctorSnap.data()?.active!==true) throw new HttpsError('not-found','Selected doctor is currently unavailable.');
  if(slotSnap.exists) throw new HttpsError('already-exists','This time slot is already booked.');
  const d=doctorSnap.data()!,now=admin.firestore.FieldValue.serverTimestamp(),appointmentCode=`DFH-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  tx.set(appointmentRef,{appointmentCode,userId:request.auth!.uid,doctorId,doctorName:d.name,hospitalName:d.hospitalName,appointmentDate,appointmentTime,slotLockId,patientName:patientName.trim().slice(0,120),patientAge:Number(patientAge)||0,patientGender:patientGender==='female'||patientGender==='other'?patientGender:'male',patientPhone:patientPhone.trim().slice(0,30),consultationFee:Number(d.consultationFee)||0,status:'pending',notes:typeof notes==='string'?notes.trim().slice(0,500):'',createdAt:now,updatedAt:now});
  tx.set(slotRef,{appointmentId:appointmentRef.id,userId:request.auth!.uid,doctorId,appointmentDate,appointmentTime,createdAt:now});
  return {appointmentId:appointmentRef.id,appointmentCode};
 });
});
export const syncAdminClaims=onDocumentCreated('admins/{adminUid}',async event=>{const snap=event.data;if(!snap)return;const data=snap.data();await admin.auth().setCustomUserClaims(event.params.adminUid,{admin:data.active===true,roleLevel:data.roleLevel||'manager'});});
export const onAppointmentStatusChanged=onDocumentUpdated('appointments/{appointmentId}',async event=>{
 const before=event.data?.before.data(),after=event.data?.after.data();if(!before||!after||before.status===after.status)return;
 await db.collection('notifications').add({targetUserId:after.userId,title:`অ্যাপয়েন্টমেন্ট আপডেট (${after.appointmentCode})`,message:`${after.doctorName}-এর সাথে আপনার অ্যাপয়েন্টমেন্টের অবস্থা এখন: ${after.status}`,type:'appointment',readBy:[],createdAt:admin.firestore.FieldValue.serverTimestamp()});
});