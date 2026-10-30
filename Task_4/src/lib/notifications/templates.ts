import { NotificationItem } from "./types";

export interface FormattedNotification {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Copy of the payload with every text value passed through `esc` (numbers and booleans are left alone). */
function mapPayload(payload: NonNullable<NotificationItem["payload"]>, esc: (v: string) => string) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = typeof value === "string" ? esc(value) : value;
  }
  return out;
}

/**
 * Subject and plain text use the raw values; the HTML body uses HTML-escaped values, because names
 * and reasons are typed by users and must never be able to inject markup into an email.
 */
export function formatNotification(item: NotificationItem): FormattedNotification {
  const raw = renderTemplate(item, (v) => v);
  const safe = renderTemplate(item, escapeHtml);
  return { subject: raw.subject, bodyText: raw.bodyText, bodyHtml: safe.bodyHtml };
}

function renderTemplate(item: NotificationItem, esc: (v: string) => string): FormattedNotification {
  const p = mapPayload(item.payload || {}, esc);
  const patient = p.patientName || "Valued Patient";
  const doctor = p.doctorName || "Specialist";
  const date = p.appointmentDate || "Scheduled Date";
  const time = p.startTime || "Scheduled Time";
  const token = p.tokenNumber ? `#${p.tokenNumber}` : "";
  const fee = p.amountFormatted || "";
  const refundFee = p.refundAmountFormatted || "";

  switch (item.template) {
    case "BOOKING_CONFIRMATION": // older name for the same email
    case "BOOKING_CONFIRMED":
      return {
        subject: `Medrella Appointment Confirmed with Dr. ${doctor} (Token ${token})`,
        bodyText: `Hello ${patient},\n\nYour appointment with Dr. ${doctor} has been confirmed.\nDate: ${date}\nTime: ${time}\nToken: ${token}\nFee: ${fee}\n\nPlease arrive 10 minutes prior to your slot at Ruby Hall Clinic, Pune.\n\nThank you,\nMedrella Healthcare`,
        bodyHtml: `<h3>Appointment Confirmed</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> is confirmed.</p><ul><li><b>Date:</b> ${date}</li><li><b>Time:</b> ${time}</li><li><b>Token Number:</b> ${token}</li><li><b>Amount Paid:</b> ${fee}</li></ul><p>Please arrive 10 minutes early at Ruby Hall Clinic, Pune.</p>`,
      };

    case "PAYMENT_CONFIRMED":
      return {
        subject: `Payment Receipt: ${p.receiptNo || "Consultation Fee"} - Medrella Healthcare`,
        bodyText: `Hello ${patient},\n\nWe have received your payment of ${fee} for your appointment with Dr. ${doctor}.\nReceipt No: ${p.receiptNo || "N/A"}\nPayment ID: ${p.paymentId || "N/A"}\n\nThank you,\nMedrella Healthcare`,
        bodyHtml: `<h3>Payment Receipt</h3><p>Hello <b>${patient}</b>,</p><p>We have successfully received your payment of <b>${fee}</b> for Dr. ${doctor}.</p><p>Receipt No: <code>${p.receiptNo || "N/A"}</code><br/>Payment ID: <code>${p.paymentId || "N/A"}</code></p>`,
      };

    case "APPOINTMENT_CANCELLED":
      return {
        subject: `Appointment Cancelled - Dr. ${doctor} on ${date}`,
        bodyText: `Hello ${patient},\n\nYour appointment with Dr. ${doctor} on ${date} at ${time} has been cancelled.\n${p.reason ? `Reason: ${p.reason}\n` : ""}${refundFee ? `Refund Status: A refund of ${refundFee} has been initiated.\n` : ""}\nThank you,\nMedrella Healthcare`,
        bodyHtml: `<h3>Appointment Cancelled</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> on <b>${date}</b> at <b>${time}</b> has been cancelled.</p>${p.reason ? `<p><b>Reason:</b> ${p.reason}</p>` : ""}${refundFee ? `<p><b>Refund:</b> A refund of <b>${refundFee}</b> has been initiated.</p>` : ""}`,
      };

    case "APPOINTMENT_RESCHEDULED":
      return {
        subject: `Appointment Rescheduled - Dr. ${doctor} (New Time: ${date} ${time})`,
        bodyText: `Hello ${patient},\n\nYour appointment with Dr. ${doctor} has been moved to ${date} at ${time}.\nToken Number: ${token}\nYour previous payment remains valid.\n\nThank you,\nMedrella Healthcare`,
        bodyHtml: `<h3>Appointment Rescheduled</h3><p>Hello <b>${patient}</b>,</p><p>Your appointment with <b>Dr. ${doctor}</b> has been rescheduled to <b>${date} at ${time}</b> (Token: <b>${token}</b>).</p><p>Your consultation fee payment remains active.</p>`,
      };

    case "REFUND_INITIATED":
      return {
        subject: `Refund Initiated for Appointment with Dr. ${doctor}`,
        bodyText: `Hello ${patient},\n\nA refund of ${refundFee} has been initiated for your appointment.\nReceipt No: ${p.receiptNo || "N/A"}\nIt will reflect in your original payment method in 5-7 business days.\n\nMedrella Healthcare`,
        bodyHtml: `<h3>Refund Initiated</h3><p>Hello <b>${patient}</b>,</p><p>A refund of <b>${refundFee}</b> has been initiated for your consultation. It typically reflects in your bank / card account within 5–7 business days.</p>`,
      };

    case "REFUND_PROCESSED":
      return {
        subject: `Refund Processed Successfully - Medrella Healthcare`,
        bodyText: `Hello ${patient},\n\nYour refund of ${refundFee} has been processed successfully by our payment gateway.\n\nMedrella Healthcare`,
        bodyHtml: `<h3>Refund Processed</h3><p>Hello <b>${patient}</b>,</p><p>Your refund of <b>${refundFee}</b> has been processed successfully.</p>`,
      };

    case "REFUND_FAILED":
      return {
        subject: `Action Required: Refund Could Not Be Completed`,
        bodyText: `Hello ${patient},\n\nWe encountered an issue processing your refund of ${refundFee}. Our support team has been alerted and will retry shortly.\n\nMedrella Healthcare`,
        bodyHtml: `<h3>Refund Processing Update</h3><p>Hello <b>${patient}</b>,</p><p>There was a temporary issue processing your refund of <b>${refundFee}</b>. Our team is resolving it.</p>`,
      };

    case "APPOINTMENT_REMINDER":
      return {
        subject: `Upcoming Appointment Reminder: Dr. ${doctor} on ${date} at ${time}`,
        bodyText: `Hello ${patient},\n\nThis is a friendly reminder of your upcoming consultation with Dr. ${doctor} on ${date} at ${time} (Token: ${token}).\nPlease arrive at Ruby Hall Clinic, Pune on time.\n\nMedrella Healthcare`,
        bodyHtml: `<h3>Appointment Reminder</h3><p>Hello <b>${patient}</b>,</p><p>Reminder for your upcoming visit with <b>Dr. ${doctor}</b> on <b>${date} at ${time}</b> (Token: <b>${token}</b>).</p>`,
      };

    default:
      return {
        subject: `Medrella Healthcare Notification: ${item.template}`,
        bodyText: `Hello ${patient},\n\n${p.customMessage || "You have an update regarding your appointment."}\n\nMedrella Healthcare`,
        bodyHtml: `<p>Hello <b>${patient}</b>,</p><p>${p.customMessage || "You have an update regarding your appointment."}</p>`,
      };
  }
}
