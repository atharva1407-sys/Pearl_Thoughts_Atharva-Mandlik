"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RescheduleModal } from "@/components/reschedule-modal";

export interface RescheduleTarget {
  appointmentId: string;
  doctorId: string;
  doctorName: string;
  currentDate: string;
  currentTime: string;
}

const OpenRescheduleContext = createContext<((target: RescheduleTarget) => void) | null>(null);

/**
 * Hosts the reschedule dialog that opens right after a patient is marked "Unavailable".
 *
 * The dialog must NOT live inside the row's button: marking a patient unavailable refreshes the page and the row
 * leaves the waiting list (or the dashboard stops rendering the button), which would unmount the button and take its
 * dialog with it. This provider sits above the rows, so it stays mounted through that refresh.
 */
export function UnavailableRescheduleProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<RescheduleTarget | null>(null);

  const open = useCallback((t: RescheduleTarget) => setTarget(t), []);

  return (
    <OpenRescheduleContext.Provider value={open}>
      {children}
      {target && (
        <RescheduleModal
          appointmentId={target.appointmentId}
          doctorId={target.doctorId}
          doctorName={target.doctorName}
          currentDate={target.currentDate}
          currentTime={target.currentTime}
          isOpen={true}
          onClose={() => {
            // Closing without picking a slot leaves the patient under "Not Yet Arrived" (BOOKED).
            setTarget(null);
            router.refresh();
          }}
        />
      )}
    </OpenRescheduleContext.Provider>
  );
}

export function useOpenReschedule(): (target: RescheduleTarget) => void {
  const open = useContext(OpenRescheduleContext);
  if (!open) {
    throw new Error("UnavailableButton must be rendered inside <UnavailableRescheduleProvider>.");
  }
  return open;
}
