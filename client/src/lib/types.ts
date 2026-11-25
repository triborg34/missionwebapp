export type Role = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type MissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AssetType = 'SIGNATURE' | 'STAMP';

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  jobTitle: string;
  phone: string | null;
  employeeCode: string;
  departmentId: number | null;
  departmentName: string | null;
  managerId: number | null;
}

export interface Permissions {
  canEdit: boolean;
  canCancel: boolean;
  canDecide: boolean;
  canDownloadPdf: boolean;
}

export interface HistoryEntry {
  id: number;
  action: string;
  reason: string | null;
  createdAt: string;
  manager: { id: number; fullName: string; jobTitle: string };
  snapshotHash: string;
}

export interface Mission {
  id: number;
  missionNumber: string;
  status: MissionStatus;
  employee: { id: number; fullName: string; employeeCode: string; jobTitle: string };
  department: string;
  departmentId: number | null;
  destination: string;
  purpose: string;
  missionDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  description: string | null;
  rejectionReason: string | null;
  createdAt: string;
  permissions: Permissions;
  history?: HistoryEntry[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  employeeCode: string;
  departmentId: number | null;
  departmentName: string | null;
  jobTitle: string;
  phone: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  managerId: number | null;
  managerName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Department {
  id: number;
  name: string;
}

export interface AssetInfo {
  uploadedAt: string;
  sizeBytes: number;
  mimeType: string;
}
