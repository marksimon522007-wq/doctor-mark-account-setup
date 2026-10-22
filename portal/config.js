/* This key is intentionally PUBLIC. Never put a secret/service_role key here. */
window.DR_MARK_CONFIG = Object.freeze({
  supabaseUrl: 'https://jmheltndxoiyymglewxn.supabase.co',
  publishableKey: 'sb_publishable_VSZUKxCNe42zmka9OFJePA_9T8CiACv',
  teacherTimeZone: 'Africa/Cairo',
  defaultDueTime: '17:00'
});

/* Kept for the pre-existing /portal/worker.html checker page. */
window.DR_MARK_BACKEND = Object.freeze({
  supabaseUrl: window.DR_MARK_CONFIG.supabaseUrl,
  supabaseKey: window.DR_MARK_CONFIG.publishableKey,
  studentEmailDomain: "students.drmark.local",
  storageBucket: "student-portal-files"
});