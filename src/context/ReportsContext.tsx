import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Report, ReportReason, ReportTargetKind } from '../types';
import { generateId } from '../utils/format';
import { supabase } from '../lib/supabase';

// MULTI-DEVICE MIGRATION -- reports used to live only in this device's
// AsyncStorage (`velora.reports.v1`). They now live in the real, shared
// `public.reports` table (see supabase_migration_multidevice.sql), readable
// and insertable only by the reporter (RLS: reporter_id = auth.uid()) --
// there's no in-app moderation queue, so as the project owner you review
// every report directly in Supabase's Table Editor, which isn't subject to
// RLS.

export interface SubmitReportInput {
  reporterId: string;
  targetKind: ReportTargetKind;
  targetId: string;
  targetLabel: string;
  reason: ReportReason;
  details: string;
}

interface ReportsContextValue {
  submitReport: (input: SubmitReportInput) => Promise<Report>;
  // Blocks the same person from repeatedly re-reporting the exact same
  // listing/person/conversation -- the report screen uses this to show
  // "You've already reported this" instead of the form, the same way
  // ReviewsContext.hasReviewedBooking already gates Rate & Review.
  hasReportedTarget: (reporterId: string, targetKind: ReportTargetKind, targetId: string) => boolean;
  refreshReports: () => Promise<void>;
}

const ReportsContext = createContext<ReportsContextValue | undefined>(undefined);

interface ReportRow {
  id: string;
  reporter_id: string;
  target_kind: string;
  target_id: string;
  target_label: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
}

const rowToReport = (row: ReportRow): Report => ({
  id: row.id,
  reporterId: row.reporter_id,
  targetKind: row.target_kind as ReportTargetKind,
  targetId: row.target_id,
  targetLabel: row.target_label,
  reason: row.reason as ReportReason,
  details: row.details,
  createdAt: row.created_at,
  status: row.status as Report['status'],
});

export const ReportsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reports, setReports] = useState<Report[]>([]);

  const fetchReports = async () => {
    // RLS returns only reports this signed-in user has themselves filed.
    const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (error) {
      console.log(`VELORA_REPORTS_FETCH_ERROR: ${error.message}`);
      return;
    }
    setReports(((data ?? []) as ReportRow[]).map(rowToReport));
  };

  useEffect(() => {
    fetchReports();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchReports();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const submitReport = async (input: SubmitReportInput): Promise<Report> => {
    const report: Report = {
      id: generateId('report'),
      createdAt: new Date().toISOString(),
      status: 'open',
      ...input,
    };
    const { error } = await supabase.from('reports').insert({
      id: report.id,
      reporter_id: report.reporterId,
      target_kind: report.targetKind,
      target_id: report.targetId,
      target_label: report.targetLabel,
      reason: report.reason,
      details: report.details,
      status: report.status,
      created_at: report.createdAt,
    });
    if (error) {
      console.log(`VELORA_REPORT_INSERT_ERROR: ${error.message}`);
      throw new Error("We couldn't submit your report right now. Please try again.");
    }
    setReports((prev) => [report, ...prev]);
    console.log(`VELORA_REPORT_SUBMITTED id=${report.id} kind=${report.targetKind} target=${report.targetId} reason=${report.reason}`);
    return report;
  };

  const value = useMemo<ReportsContextValue>(
    () => ({
      submitReport,
      hasReportedTarget: (reporterId, targetKind, targetId) =>
        reports.some((r) => r.reporterId === reporterId && r.targetKind === targetKind && r.targetId === targetId),
      refreshReports: fetchReports,
    }),
    [reports],
  );

  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
};

export const useReports = (): ReportsContextValue => {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error('useReports must be used within a ReportsProvider');
  return ctx;
};
