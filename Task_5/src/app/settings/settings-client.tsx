"use client";

import { useState, useTransition } from "react";
import {
  Save,
  RotateCcw,
  Trash2,
  Bell,
  ShieldCheck,
  Mail,
  CheckCircle,
  Info,
} from "lucide-react";
import { restoreTestDataAction, clearTestDataAction } from "@/actions/seed";
import { updateNotificationPreferencesAction } from "@/actions/notifications";
import type { NotificationPreferencesEntity } from "@/lib/notifications/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
interface SettingsClientProps {
  isProduction: boolean;
  userRole: "PATIENT" | "DOCTOR";
  userEmail?: string;
  initialPreferences: NotificationPreferencesEntity;
}

export function SettingsClient({
  isProduction,
  userRole,
  userEmail,
  initialPreferences,
}: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error">("success");

  // Notification Preferences State
  const [emailPromotional, setEmailPromotional] = useState<boolean>(
    initialPreferences.emailPromotional ?? false
  );
  const [consentedAt, setConsentedAt] = useState<Date | null>(
    initialPreferences.consentedAt ? new Date(initialPreferences.consentedAt) : null
  );

  const handleSaveNotificationPreferences = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateNotificationPreferencesAction({ emailPromotional });
      if (res.success) {
        setStatusType("success");
        setStatusMessage(res.message || "Notification preferences updated.");
        if (emailPromotional) {
          setConsentedAt(new Date());
        } else {
          setConsentedAt(null);
        }
      } else {
        setStatusType("error");
        setStatusMessage(res.error || "Failed to update notification preferences.");
      }
      setTimeout(() => setStatusMessage(null), 4000);
    });
  };

  const handleRestore = () => {
    startTransition(async () => {
      const res = await restoreTestDataAction();
      setStatusType(res.success ? "success" : "error");
      setStatusMessage(res.message || res.error || null);
      setTimeout(() => setStatusMessage(null), 3500);
    });
  };

  const handleClear = () => {
    if (!confirm("Are you sure you want to clear active data? This action cannot be undone.")) {
      return;
    }
    startTransition(async () => {
      const res = await clearTestDataAction();
      setStatusType(res.success ? "success" : "error");
      setStatusMessage(res.message || res.error || null);
      setTimeout(() => setStatusMessage(null), 3500);
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {userRole === "DOCTOR" ? "HOSPITAL CONFIGURATION" : "ACCOUNT SETTINGS"}
          </div>
          <h1>{userRole === "DOCTOR" ? "Hospital & Account Settings" : "Account & Notifications"}</h1>
          <p>
            {userRole === "DOCTOR"
              ? "Manage OPD facility parameters, notification preferences, and system controls."
              : "Manage your communication preferences and outpatient notification settings."}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-bold border ${
            statusType === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {/* Notifications Preferences Card (Available to Patients & Doctors) */}
      <Card className="space-y-5">
        <div className="card-head">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <Bell size={18} />
            </div>
            <div>
              <h2>Notification Preferences</h2>
              <p>Email delivery channels and consent management</p>
            </div>
          </div>
          <Badge variant="green">Email Active</Badge>
        </div>

        <form onSubmit={handleSaveNotificationPreferences} className="space-y-5">
          {/* Operational / Mandatory Notifications Notice */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-emerald-600">
                <ShieldCheck size={20} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Mandatory Operational Communications
                  </span>
                  <Badge variant="green" className="text-[10px] py-0 px-1.5">Always Enabled</Badge>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Transactional messages are essential for healthcare service delivery and patient safety.
                  These include <strong>booking confirmations</strong>, <strong>payment receipts</strong>,{" "}
                  <strong>cancellation notices</strong>, <strong>refund status updates</strong>, and{" "}
                  <strong>appointment reminders (24h and 2h prior to consultation)</strong>.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
                  <Info size={13} />
                  <span>
                    Delivered to <strong>{userEmail || "your registered email"}</strong> in Asia/Kolkata timezone.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Promotional Toggle */}
          <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-slate-500">
                  <Mail size={18} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="promoToggle" className="text-xs font-bold text-slate-800 cursor-pointer">
                    Promotional &amp; Preventive Health Updates
                  </Label>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Receive optional periodic health tips, preventive wellness advisories, outpatient camp notices,
                    and seasonal health guidance from Medrella specialists.
                  </p>
                  {consentedAt && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-700 pt-1">
                      <CheckCircle size={12} />
                      <span>
                        Consent recorded on: {consentedAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} at{" "}
                        {consentedAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1">
                <Label className="relative inline-flex items-center cursor-pointer">
                  <Checkbox
                    id="promoToggle"
                    checked={emailPromotional}
                    onCheckedChange={(v) => setEmailPromotional(v === true)}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </Label>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="default"
              type="submit"
              disabled={isPending}
              className="text-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <Save size={14} />
              <span>{isPending ? "Saving..." : "Save Preferences"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Hospital Workspace Settings (Doctors Only) */}
      {userRole === "DOCTOR" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Hospital Configuration Form */}
          <Card className="lg:col-span-2 space-y-4">
            <div className="card-head">
              <div>
                <h2>Facility Information</h2>
                <p>Primary hospital branch settings</p>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                alert("Hospital facility information saved!");
              }}
            >
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Hospital Facility Name
                </Label>
                <Input
                  type="text"
                  defaultValue="Ruby Hall, Pune"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">
                    Location / City
                  </Label>
                  <Input
                    type="text"
                    defaultValue="Pune, Maharashtra"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">
                    Primary Helpline Phone
                  </Label>
                  <Input
                    type="text"
                    defaultValue="+91 20 6645 5100"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  Full Street Address
                </Label>
                <Input
                  type="text"
                  defaultValue="40, Sassoon Road, Sangamvadi, Pune – 411001"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">
                    Administrative Email
                  </Label>
                  <Input
                    type="email"
                    defaultValue="info@rubyhall-pune.medrella.com"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">
                    Timezone
                  </Label>
                  <Select >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="(GMT+5:30) India Standard Time (IST)">(GMT+5:30) India Standard Time (IST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <Button variant="default" type="submit" className="text-xs">
                  <Save size={14} />
                  <span>Save Facility Info</span>
                </Button>
              </div>
            </form>
          </Card>

          {/* System Health & Test Data Controls */}
          <div className="space-y-5">
            <Card className="space-y-4">
              <div className="card-head">
                <div>
                  <h2>System Health &amp; Status</h2>
                  <p>Operational infrastructure</p>
                </div>
                <Badge variant="green">Live</Badge>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500">Service Status</span>
                  <Badge variant="green">Operational</Badge>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500">Database Engine</span>
                  <span className="font-bold text-slate-800 font-mono">PostgreSQL (Neon)</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-slate-500">Email Gateway</span>
                  <span className="font-bold text-slate-800 font-mono">Resend API (IST)</span>
                </div>

                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500">Session Security</span>
                  <span className="font-bold text-emerald-700">JWT (HttpOnly Cookie)</span>
                </div>
              </div>
            </Card>

            {/* Test Data Controls (Development Only) */}
            <Card className="space-y-3">
              <div className="card-head">
                <div>
                  <h2>Database Management</h2>
                  <p>{isProduction ? "Live Production Database" : "Development Controls"}</p>
                </div>
                <span className={`badge ${isProduction ? "green" : "sky"}`}>
                  {isProduction ? "Protected" : "Dev Only"}
                </span>
              </div>

              {isProduction ? (
                <p className="text-xs text-slate-500 m-0 leading-relaxed">
                  Database wipe and seed mutations are strictly disabled in production to protect live clinical records.
                </p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 m-0 leading-relaxed">
                    Development controls for testing. In production, wipe and seed actions are permanently locked.
                  </p>

                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                    <Button variant="default"
                      type="button"
                      disabled={isPending}
                      onClick={handleRestore}
                      className="text-xs justify-center cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>{isPending ? "Processing..." : "Seed Development Data"}</span>
                    </Button>

                    <Button variant="outline"
                      type="button"
                      disabled={isPending}
                      onClick={handleClear}
                      className="text-xs justify-center text-slate-600 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Clear Dev Data</span>
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
