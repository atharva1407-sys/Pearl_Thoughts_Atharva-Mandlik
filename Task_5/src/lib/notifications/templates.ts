import { NotificationItem } from "./types";
import { formatKolkataDate, formatKolkataTime } from "../time";
import { buildUnsubscribeUrl } from "./unsubscribe-token";

export interface FormattedNotification {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export const ALLOWED_NON_CLINICAL_REASONS = [
  "Doctor emergency",
  "Clinic maintenance",
  "Schedule conflict",
  "Unforeseen absence",
  "Doctor unavailable",
  "Cancelled by patient",
  "Cancelled by the doctor",
  "Facility emergency",
];

/**
 * Validates doctor/staff cancellation reasons against an approved non-clinical list.
 * Any clinical free-text, symptom, or diagnosis is strictly rejected to preserve patient privacy.
 */
export function sanitizeCancellationReason(rawReason?: string): string | undefined {
  if (!rawReason || typeof rawReason !== "string") return undefined;
  const trimmed = rawReason.trim();
  const match = ALLOWED_NON_CLINICAL_REASONS.find(
    (allowed) => allowed.toLowerCase() === trimmed.toLowerCase()
  );
  return match;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Filter out forbidden clinical keys and apply string escape function.
 */
function sanitizeAndMapPayload(
  payload: NonNullable<NotificationItem["payload"]>,
  esc: (v: string) => string
): Record<string, any> {
  const FORBIDDEN_KEYS = new Set([
    "diagnosis",
    "symptoms",
    "clinicalnotes",
    "notes",
    "reasonforvisit",
    "medicalhistory",
    "prescription",
    "vitalSigns",
  ]);

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      // Strictly omit any clinical fields
      continue;
    }
    out[key] = typeof value === "string" ? esc(value) : value;
  }
  return out;
}

/**
 * Renders subject, plain text, and HTML-escaped body for any notification item.
 */
export function formatNotification(item: NotificationItem): FormattedNotification {
  const raw = renderTemplate(item, (v) => v);
  const safe = renderTemplate(item, escapeHtml);
  return { subject: raw.subject, bodyText: raw.bodyText, bodyHtml: safe.bodyHtml };
}

function renderTemplate(item: NotificationItem, esc: (v: string) => string): FormattedNotification {
  const p = sanitizeAndMapPayload(item.payload || {}, esc);
  const category = item.category || (item.template.startsWith("PROMOTIONAL_") ? "promotional" : "operational");

  // Patient name and doctor
  const patient = p.patientName || "Valued Patient";
  const doctor = p.doctorName || "Specialist";
  const spec = p.specialization ? ` (${p.specialization})` : "";
  const rawDate = p.appointmentDate || "";
  const date = rawDate ? `${formatKolkataDate(rawDate)} (${rawDate})` : "Scheduled Date";
  const rawTime = p.startTime || "";
  const time = rawTime ? formatKolkataTime(rawTime) : "Scheduled Time";
  const token = p.tokenNumber ? `#${p.tokenNumber}` : "";
  const fee = p.amountFormatted || "";
  const refundFee = p.refundAmountFormatted || "";
  const sanitizedReason = sanitizeCancellationReason(p.reason);

  // App Link
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://medrella-healthcare.vercel.app").replace(/\/+$/, "");
  const appointmentsLink = `${appUrl}/patient/dashboard`;

  // Footers
  const operationalFooterText = `\n\n--------------------\nWhy you received this email: This is an operational service email regarding your Medrella Healthcare outpatient appointment or payment record at Ruby Hall Clinic, Pune. Operational messages cannot be unsubscribed from.\nMedrella Healthcare, 40 Sassoon Road, Pune 411001.`;
  const operationalFooterHtml = `<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;"/><p style="font-size:11px;color:#64748b;margin-top:12px;"><b>Why you received this email:</b> This is an operational service email regarding your appointment or billing record with Medrella Healthcare at Ruby Hall Clinic, Pune. Operational messages cannot be unsubscribed from.<br/>Medrella Healthcare, 40 Sassoon Road, Sangamvadi, Pune – 411001.</p>`;

  let promoUnsubscribeUrl = p.unsubscribeUrl;
  if (!promoUnsubscribeUrl && item.userId) {
    promoUnsubscribeUrl = buildUnsubscribeUrl(item.userId, appUrl);
  }
  const safeUnsubUrl = promoUnsubscribeUrl || `${appUrl}/settings`;

  const promotionalFooterText = `\n\n--------------------\nWhy you received this email: You opted in to receive health tips and facility updates from Medrella Healthcare.\nTo unsubscribe with one click, visit: ${safeUnsubUrl}\nMedrella Healthcare, 40 Sassoon Road, Pune 411001.`;
  const promotionalFooterHtml = `<hr style="margin-top:24px;border:none;border-top:1px solid #e2e8f0;"/><p style="font-size:11px;color:#64748b;margin-top:12px;"><b>Why you received this email:</b> You opted in to receive health tips and facility updates from Medrella Healthcare.<br/><a href="${safeUnsubUrl}" style="color:#0875df;text-decoration:underline;">Click here to unsubscribe anytime</a>.</p>`;

  const isPromo = category === "promotional";
  const footerText = isPromo ? promotionalFooterText : operationalFooterText;
  const footerHtml = isPromo ? promotionalFooterHtml : operationalFooterHtml;

  switch (item.template) {
    case "WELCOME": {
      const isDoctor = p.role === "DOCTOR";
      const subject = "Welcome to Medrella Healthcare";
      const nextLink = isDoctor ? `${appUrl}/doctor/dashboard` : `${appUrl}/doctors`;
      const nextText = isDoctor
        ? "Set up your sessions and availability from your dashboard."
        : "You can now browse specialists, book a slot and pay online.";
      const bodyText = `Hello ${patient},

Welcome to Medrella Healthcare, Ruby Hall Clinic, Pune. Your account has been created.
${nextText}

Get started: ${nextLink}${footerText}`;
      const bodyHtml = `<h3>Welcome to Medrella Healthcare</h3><p>Hello <b>${patient}</b>,</p><p>Your account has been created. ${nextText}</p><p><a href="${nextLink}" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">${isDoctor ? "Open Dashboard" : "Find a Doctor"}</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "BOOKING_CONFIRMATION":
    case "BOOKING_CONFIRMED": {
      const subject = `Medrella Appointment Confirmed with Dr. ${doctor} (Token ${token})`;
      const bodyText = `Hello ${patient},\n\nYour appointment with Dr. ${doctor} has been confirmed.\nDate: ${date}\nTime: ${time}\nToken: ${token}\nFee: ${fee || "Complimentary"}\n\nPlease arrive 10 minutes prior to your slot at Ruby Hall Clinic, 40 Sassoon Road, Pune.\n\nView details: ${appointmentsLink}${footerText}`;
      const bodyHtml = `<h3>Appointment Confirmed</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> is confirmed.</p><table style="font-size:13px;border-collapse:collapse;margin:12px 0;"><tr><td style="padding:4px 8px 4px 0;color:#64748b;"><b>Date:</b></td><td>${date}</td></tr><tr><td style="padding:4px 8px 4px 0;color:#64748b;"><b>Time:</b></td><td>${time}</td></tr><tr><td style="padding:4px 8px 4px 0;color:#64748b;"><b>Token:</b></td><td><b>${token}</b></td></tr><tr><td style="padding:4px 8px 4px 0;color:#64748b;"><b>Fee:</b></td><td>${fee || "Complimentary"}</td></tr><tr><td style="padding:4px 8px 4px 0;color:#64748b;"><b>Facility:</b></td><td>Ruby Hall Clinic, Pune</td></tr></table><p><a href="${appointmentsLink}" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">View Appointment</a></p><p style="font-size:12px;color:#64748b;">Please arrive 10 minutes prior to your slot.</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "PAYMENT_CONFIRMED": {
      const receipt = p.receiptNo || "N/A";
      const subject = `Payment Receipt: ${receipt} - Medrella Healthcare`;
      const bodyText = `Hello ${patient},\n\nWe have received your payment of ${fee} for your appointment with Dr. ${doctor}.\nReceipt Number: ${receipt}\nPayment ID: ${p.paymentId || "N/A"}\n\nView and print your receipt: ${appUrl}/patient/payments${footerText}`;
      const bodyHtml = `<h3>Payment Receipt</h3><p>Hello <b>${patient}</b>,</p><p>We have successfully received your consultation fee of <b>${fee}</b> for <b>Dr. ${doctor}</b>.</p><p><b>Receipt Number:</b> <code>${receipt}</code><br/><b>Payment ID:</b> <code>${p.paymentId || "N/A"}</code></p><p><a href="${appUrl}/patient/payments" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">View Payment Receipt</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "APPOINTMENT_CANCELLED": {
      const subject = `Appointment Cancelled: Dr. ${doctor} on ${date}`;
      const reasonLine = sanitizedReason ? `\nReason: ${sanitizedReason}` : "";
      const reasonHtml = sanitizedReason ? `<p><b>Reason:</b> ${sanitizedReason}</p>` : "";
      const refundLine = refundFee ? `\nRefund Status: A refund of ${refundFee} has been initiated to your original payment method.` : "";
      const refundHtml = refundFee ? `<p><b>Refund:</b> A refund of <b>${refundFee}</b> has been initiated to your original payment method.</p>` : "";
      const bodyText = `Hello ${patient},\n\nYour appointment with Dr. ${doctor} on ${date} at ${time} has been cancelled.${reasonLine}${refundLine}\n\nBook a new slot anytime: ${appUrl}/doctors${footerText}`;
      const bodyHtml = `<h3>Appointment Cancelled</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> on <b>${date} at ${time}</b> has been cancelled.</p>${reasonHtml}${refundHtml}<p><a href="${appUrl}/doctors" style="color:#0875df;text-decoration:underline;">Book another consultation</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "APPOINTMENT_CANCELLED_BY_DOCTOR": {
      const subject = `Important: Appointment Cancelled by Dr. ${doctor} on ${date}`;
      const reasonLine = sanitizedReason ? `\nReason: ${sanitizedReason}` : "\nReason: Physician schedule adjustment";
      const reasonHtml = sanitizedReason ? `<p><b>Reason:</b> ${sanitizedReason}</p>` : `<p><b>Reason:</b> Physician schedule adjustment</p>`;
      const refundLine = refundFee ? `\nRefund: A 100% full refund of ${refundFee} has been initiated to your account.` : "";
      const refundHtml = refundFee ? `<p><b>Refund:</b> A 100% full refund of <b>${refundFee}</b> has been initiated to your account.</p>` : "";
      const bodyText = `Hello ${patient},\n\nDr. ${doctor} had to cancel your scheduled consultation on ${date} at ${time}.${reasonLine}${refundLine}\n\nWe apologize for the inconvenience. Please choose another date or specialist here: ${appUrl}/doctors${footerText}`;
      const bodyHtml = `<h3>Appointment Cancelled by Doctor</h3><p>Hello <b>${patient}</b>,</p><p><b>Dr. ${doctor}</b> had to cancel your scheduled visit on <b>${date} at ${time}</b>.</p>${reasonHtml}${refundHtml}<p>We apologize for the disruption to your care schedule.</p><p><a href="${appUrl}/doctors" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">Reschedule with Another Doctor</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "APPOINTMENT_RESCHEDULED": {
      const subject = `Appointment Rescheduled: Dr. ${doctor} (New Slot: ${date} ${time})`;
      const bodyText = `Hello ${patient},\n\nYour appointment with Dr. ${doctor} has been moved to ${date} at ${time}.\nNew Token Number: ${token}\nYour previous payment remains valid.\n\nView updated details: ${appointmentsLink}${footerText}`;
      const bodyHtml = `<h3>Appointment Rescheduled</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> has been rescheduled to <b>${date} at ${time}</b> (Token: <b>${token}</b>).</p><p>Your consultation fee payment remains active.</p><p><a href="${appointmentsLink}" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">View Updated Appointment</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "REFUND_INITIATED": {
      const subject = `Refund Initiated for Consultation with Dr. ${doctor}`;
      const bodyText = `Hello ${patient},\n\nA refund of ${refundFee} has been initiated for your appointment.\nReceipt Number: ${p.receiptNo || "N/A"}\n\nThe refund will credit your original payment method in 5-7 business days.${footerText}`;
      const bodyHtml = `<h3>Refund Initiated</h3><p>Hello <b>${patient}</b>,</p><p>A refund of <b>${refundFee}</b> has been initiated for your consultation with <b>Dr. ${doctor}</b>.</p><p>Receipt Number: <code>${p.receiptNo || "N/A"}</code></p><p>Funds typically credit back within 5–7 banking days.</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "REFUND_PROCESSED": {
      const subject = `Refund Processed Successfully - Medrella Healthcare`;
      const bodyText = `Hello ${patient},\n\nYour refund of ${refundFee} has been processed successfully by our payment gateway.\n\nMedrella Healthcare${footerText}`;
      const bodyHtml = `<h3>Refund Processed</h3><p>Hello <b>${patient}</b>,</p><p>Your refund of <b>${refundFee}</b> has been processed successfully by our payment gateway and settled with your issuing bank.</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "REFUND_FAILED": {
      const subject = `Action Required: Refund Could Not Be Completed`;
      const bodyText = `Hello ${patient},\n\nWe encountered an issue processing your refund of ${refundFee}. Our billing operations team has been notified and will re-issue the refund shortly.${footerText}`;
      const bodyHtml = `<h3>Refund Processing Update</h3><p>Hello <b>${patient}</b>,</p><p>There was a temporary issue processing your refund of <b>${refundFee}</b>. Our finance team has been alerted and will retry shortly.</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "APPOINTMENT_REMINDER": {
      const subject = `Upcoming Appointment Reminder: Dr. ${doctor} on ${date} at ${time}`;
      const bodyText = `Hello ${patient},\n\nThis is a friendly reminder of your upcoming consultation with Dr. ${doctor} on ${date} at ${time} (Token ${token}).\n\nLocation: Ruby Hall Clinic, 40 Sassoon Road, Pune.\nPlease arrive 10 minutes prior to your consultation.\n\nView details: ${appointmentsLink}${footerText}`;
      const bodyHtml = `<h3>Appointment Reminder</h3><p>Hello <b>${patient}</b>,</p><p>Reminder for your upcoming outpatient visit with <b>Dr. ${doctor}</b> on <b>${date} at ${time}</b> (Token: <b>${token}</b>).</p><p><b>Facility:</b> Ruby Hall Clinic, Pune</p><p><a href="${appointmentsLink}" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">View Appointment</a></p><p style="font-size:12px;color:#64748b;">Please arrive 10 minutes early.</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    case "PROMOTIONAL_NEWSLETTER":
    case "PROMOTIONAL_HEALTH_TIP": {
      const subject = p.customSubject || `Medrella Health Bulletin: Wellness & Care Advice`;
      const tip = p.customMessage || `Regular checkups and seasonal vaccinations are essential for long-term health. Consult our specialists at Ruby Hall Clinic for comprehensive health check packages.`;
      const bodyText = `Hello ${patient},\n\n${tip}\n\nExplore doctors and packages: ${appUrl}/doctors${footerText}`;
      const bodyHtml = `<h3>Medrella Health &amp; Wellness</h3><p>Hello <b>${patient}</b>,</p><p>${tip}</p><p><a href="${appUrl}/doctors" style="background:#0875df;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-size:12px;font-weight:bold;">Explore Health Packages</a></p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }

    default: {
      const subject = `Medrella Healthcare Notification: ${item.template}`;
      const bodyText = `Hello ${patient},\n\n${p.customMessage || "You have an update regarding your appointment."}\n\nMedrella Healthcare${footerText}`;
      const bodyHtml = `<p>Hello <b>${patient}</b>,</p><p>${p.customMessage || "You have an update regarding your appointment."}</p>${footerHtml}`;
      return { subject, bodyText, bodyHtml };
    }
  }
}
