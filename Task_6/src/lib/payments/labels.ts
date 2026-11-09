import type { RefundStatus } from "@/db/repo";

/** Patient-facing wording. "Refunded" is only ever shown once the gateway has actually processed the refund. */
export function refundLabel(status: RefundStatus): string {
  switch (status) {
    case "PROCESSED":
      return "Refunded";
    case "PENDING":
      return "Refund in progress";
    case "REQUESTED":
      return "Refund requested";
    case "FAILED":
      return "Refund failed";
  }
}

export function refundBadgeClass(status: RefundStatus): string {
  switch (status) {
    case "PROCESSED":
      return "green";
    case "FAILED":
      return "red";
    default:
      return "amber";
  }
}

export function refundHint(status: RefundStatus): string {
  switch (status) {
    case "PROCESSED":
      return "The money has been returned to your original payment method.";
    case "PENDING":
      return "Started with your bank. It usually reaches you in 5-7 business days.";
    case "REQUESTED":
      return "Recorded and about to be sent to the payment gateway.";
    case "FAILED":
      return "We could not send this refund automatically. Our team has been alerted and will retry it.";
  }
}
