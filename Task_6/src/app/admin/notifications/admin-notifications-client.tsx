"use client";

import { useState, useTransition } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  RotateCcw,
  Shield,
  Activity,
} from "lucide-react";
import {
  requeueNotificationAction,
  triggerManualDispatchAction,
} from "@/actions/admin-notifications";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
interface FormattedNotification {
  id: string;
  userId: string;
  appointmentId?: string | null;
  channel: string;
  category: string;
  template: string;
  recipientMasked: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  scheduledForFormatted: string;
  sentAtFormatted?: string | null;
  createdAtFormatted: string;
}

interface AdminNotificationsClientProps {
  userEmail: string;
  counts: {
    PENDING: number;
    SENT: number;
    FAILED: number;
    CANCELLED: number;
  };
  failedItems: FormattedNotification[];
  stuckItems: FormattedNotification[];
}

export function AdminNotificationsClient({
  userEmail,
  counts,
  failedItems,
  stuckItems,
}: AdminNotificationsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"failed" | "stuck">("failed");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [requeuingIds, setRequeuingIds] = useState<Set<string>>(new Set());

  const handleRequeue = (id: string) => {
    setRequeuingIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      const res = await requeueNotificationAction(id);
      setRequeuingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Notification requeued." });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to requeue." });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  };

  const handleManualDispatch = () => {
    startTransition(async () => {
      const res = await triggerManualDispatchAction();
      if (res.success) {
        setFeedback({ type: "success", text: res.message || "Outbox swept successfully." });
      } else {
        setFeedback({ type: "error", text: res.error || "Manual sweep failed." });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  };

  const total = counts.PENDING + counts.SENT + counts.FAILED + counts.CANCELLED;

  return (
    <div className="space-y-6">
      {/* Top Bar / Heading */}
      <div className="page-heading">
        <div>
          <div className="eyebrow flex items-center gap-1.5 text-emerald-700">
            <Shield size={13} />
            <span>CLINICAL INFRASTRUCTURE ADMINISTRATION</span>
          </div>
          <h1>Notification Delivery Engine</h1>
          <p>
            Real-time delivery status, dead-letter monitoring, and manual outbox requeue for Medrella outpatient communications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="default"
            onClick={handleManualDispatch}
            disabled={isPending}
            className="text-xs inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
            <span>{isPending ? "Dispatching..." : "Sweep Due Outbox"}</span>
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs font-bold border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3.5 space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Messages
          </span>
          <div className="text-xl font-black text-slate-800">{total}</div>
        </Card>

        <Card className="p-3.5 space-y-1 border-emerald-200 bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
              Sent
            </span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700">{counts.SENT}</div>
        </Card>

        <Card className="p-3.5 space-y-1 border-amber-200 bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
              Pending
            </span>
            <Clock size={15} className="text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-700">{counts.PENDING}</div>
        </Card>

        <Card className="p-3.5 space-y-1 border-red-200 bg-red-50/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">
              Failed
            </span>
            <AlertTriangle size={15} className="text-red-600" />
          </div>
          <div className="text-xl font-black text-red-700">{counts.FAILED}</div>
        </Card>

        <Card className="p-3.5 space-y-1 border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Cancelled
            </span>
            <Ban size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-600">{counts.CANCELLED}</div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="space-y-4">
        <div className="card-head">
          <div className="flex items-center gap-3">
            <Button variant="bare"
              onClick={() => setActiveTab("failed")}
              className={`text-xs font-bold pb-1 cursor-pointer transition-colors border-b-2 ${
                activeTab === "failed"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Failed / Dead-Letter ({failedItems.length})
            </Button>
            <Button variant="bare"
              onClick={() => setActiveTab("stuck")}
              className={`text-xs font-bold pb-1 cursor-pointer transition-colors border-b-2 ${
                activeTab === "stuck"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Stuck / Delayed (&gt;15m) ({stuckItems.length})
            </Button>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Activity size={13} className="text-emerald-600" />
            <span>Logged in as Admin: {userEmail}</span>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "failed" && (
          <div>
            {failedItems.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-800">Dead-Letter Queue is Empty</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  All transactional and promotional communications have been delivered successfully.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-xs border-collapse">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 bg-slate-50/60 text-slate-600 font-bold">
                      <TableHead className="py-2.5 px-3">Event / Template</TableHead>
                      <TableHead className="py-2.5 px-3">Category</TableHead>
                      <TableHead className="py-2.5 px-3">Recipient</TableHead>
                      <TableHead className="py-2.5 px-3 text-center">Attempts</TableHead>
                      <TableHead className="py-2.5 px-3">Scheduled / Sent (IST)</TableHead>
                      <TableHead className="py-2.5 px-3">Error Reason</TableHead>
                      <TableHead className="py-2.5 px-3 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {failedItems.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell className="py-2.5 px-3">
                          <div className="font-mono font-bold text-slate-800 text-[11px]">
                            {item.template}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.id.slice(0, 16)}...
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <span
                            className={`badge text-[10px] ${
                              item.category === "promotional" ? "sky" : "green"
                            }`}
                          >
                            {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 px-3 font-mono text-slate-700">
                          {item.recipientMasked}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-center font-bold text-red-600">
                          {item.attempts} / 3
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {item.scheduledForFormatted}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-red-700 max-w-xs truncate text-[11px]">
                          {item.lastError || "No error details available"}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-right">
                          <Button variant="outline"
                            onClick={() => handleRequeue(item.id)}
                            disabled={requeuingIds.has(item.id) || isPending}
                            className="text-[11px] py-1 px-2.5 inline-flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            <RotateCcw size={12} className={requeuingIds.has(item.id) ? "animate-spin" : ""} />
                            <span>Retry</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {activeTab === "stuck" && (
          <div>
            {stuckItems.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-800">No Delayed Messages</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No pending messages have been waiting longer than 15 minutes. Dispatcher is performing in real-time.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-xs border-collapse">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 bg-slate-50/60 text-slate-600 font-bold">
                      <TableHead className="py-2.5 px-3">Event / Template</TableHead>
                      <TableHead className="py-2.5 px-3">Recipient</TableHead>
                      <TableHead className="py-2.5 px-3 text-center">Attempts</TableHead>
                      <TableHead className="py-2.5 px-3">Scheduled For (IST)</TableHead>
                      <TableHead className="py-2.5 px-3">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {stuckItems.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell className="py-2.5 px-3">
                          <div className="font-mono font-bold text-slate-800 text-[11px]">
                            {item.template}
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3 font-mono text-slate-700">
                          {item.recipientMasked}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-center font-bold text-amber-700">
                          {item.attempts}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {item.scheduledForFormatted}
                        </TableCell>
                        <TableCell className="py-2.5 px-3">
                          <Badge variant="amber" className="text-[10px]">PENDING</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
