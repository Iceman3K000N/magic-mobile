export type ConsultantRequestStatus =
  | "pending_admin_approval"
  | "needs_correction"
  | "active"
  | "suspended"
  | "removed"
  | "rejected";

export type HubConsultantRequest = {
  id: string;
  manager_id: string;
  status: ConsultantRequestStatus;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  payout_method: string | null;
  cash_app_tag: string | null;
  bank_payout_notes: string | null;
  notes: string | null;
  id_document_path: string | null;
  agreement_document_path: string | null;
  w9_document_path: string | null;
  linked_profile_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

export const CONSULTANT_REQUEST_STATUS_LABELS: Record<ConsultantRequestStatus, string> = {
  pending_admin_approval: "Pending Admin Approval",
  needs_correction: "Needs Correction",
  active: "Active",
  suspended: "Suspended",
  removed: "Removed",
  rejected: "Rejected",
};
