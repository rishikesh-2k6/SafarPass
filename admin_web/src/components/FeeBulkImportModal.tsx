import { useState, type FC, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import type { Schema } from '../../amplify/data/resource';
import { hashPin, generateSecurePin, sanitizeCsvCell } from '../utils/crypto';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Download,
} from 'lucide-react';

type UserProfileType = Schema['UserProfile']['type'];
type BusType = Schema['Bus']['type'];

interface FeeBulkImportModalProps {
  users: UserProfileType[];
  buses: BusType[];
  onUpsertUser: (payload: {
    existingUserId?: string;
    loginId: string;
    fullName: string;
    phone?: string;
    assignedBusId?: string;
    feePaid: boolean;
    feeReceiptId?: string;
    feeValidUntil?: string | null;
    pinHash?: string;
  }) => Promise<void>;
  onClose: () => void;
  onSuccess: (summary: string) => void;
}

interface ParsedFeeRow {
  loginId: string;
  fullName: string;
  phone: string;
  assignedBusId: string;
  feePaid: boolean;
  feeValidUntil: string | null;
  feeReceiptId: string;
  explicitPin: string;
  action: 'update' | 'create' | 'invalid';
  existingUser?: UserProfileType;
  resolvedPin?: string;
  error?: string;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseFeeBoolean(raw: unknown): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['unpaid', 'pending', 'false', '0', 'no', 'due'].includes(s)) return false;
  return true;
}

function parseValidUntilIso(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    const dt = XLSX.SSF.parse_date_code(raw);
    if (dt) {
      const iso = new Date(Date.UTC(dt.y, dt.m - 1, dt.d, 23, 59, 59)).toISOString();
      return iso;
    }
  }
  const str = String(raw).trim();
  if (!str) return null;
  const parsed = Date.parse(str.length === 10 ? `${str}T23:59:59Z` : str);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export const FeeBulkImportModal: FC<FeeBulkImportModalProps> = ({
  users,
  buses,
  onUpsertUser,
  onClose,
  onSuccess,
}) => {
  const [rows, setRows] = useState<ParsedFeeRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<
    Array<{ loginId: string; fullName: string; pin: string; busId: string }>
  >([]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCreatedCredentials([]);

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: '',
    });

    const defaultBusId = buses[0]?.busId || 'BUS_01';

    const parsed: ParsedFeeRow[] = rawJson.map((rawObj) => {
      const byNorm = new Map<string, unknown>();
      Object.entries(rawObj).forEach(([k, v]) => {
        byNorm.set(normalizeHeader(k), v);
      });

      const loginId = String(
        byNorm.get('loginid') ??
          byNorm.get('id') ??
          byNorm.get('rollno') ??
          byNorm.get('passengerid') ??
          byNorm.get('studentid') ??
          '',
      ).trim();

      const fullName = String(
        byNorm.get('fullname') ?? byNorm.get('name') ?? byNorm.get('passengername') ?? '',
      ).trim();

      const phone = String(
        byNorm.get('phone') ?? byNorm.get('phonenumber') ?? byNorm.get('mobile') ?? '',
      )
        .replace(/\D/g, '')
        .trim();

      const assignedBusId = String(
        byNorm.get('assignedbus') ?? byNorm.get('busid') ?? byNorm.get('bus') ?? defaultBusId,
      )
        .trim()
        .toUpperCase();

      const feePaid = parseFeeBoolean(
        byNorm.get('feestatus') ?? byNorm.get('feepaid') ?? byNorm.get('status') ?? 'PAID',
      );

      const feeValidUntil = parseValidUntilIso(
        byNorm.get('validuntil') ?? byNorm.get('feevaliduntil') ?? byNorm.get('expiry'),
      );

      const feeReceiptId = String(
        byNorm.get('receiptno') ?? byNorm.get('receipt') ?? byNorm.get('feereceiptid') ?? '',
      ).trim();

      const explicitPin = String(byNorm.get('pin') ?? byNorm.get('password') ?? '')
        .replace(/\D/g, '')
        .slice(0, 6);

      if (!loginId) {
        return {
          loginId: '(missing)',
          fullName,
          phone,
          assignedBusId,
          feePaid,
          feeValidUntil,
          feeReceiptId,
          explicitPin,
          action: 'invalid',
          error: 'Missing Login ID',
        };
      }

      const existing = users.find(
        (u) => u.loginId.toLowerCase() === loginId.toLowerCase(),
      );

      if (existing) {
        return {
          loginId: existing.loginId,
          fullName: fullName || existing.fullName,
          phone: phone || existing.phone || '',
          assignedBusId: assignedBusId || existing.assignedBusId || defaultBusId,
          feePaid,
          feeValidUntil,
          feeReceiptId,
          explicitPin,
          action: 'update',
          existingUser: existing,
        };
      }

      if (!fullName) {
        return {
          loginId,
          fullName: '',
          phone,
          assignedBusId,
          feePaid,
          feeValidUntil,
          feeReceiptId,
          explicitPin,
          action: 'invalid',
          error: 'New passenger requires Full Name',
        };
      }

      // First 6 digits of Phone Number as initial PIN when no PIN is explicitly provided
      const phonePin = phone.length >= 6 ? phone.slice(0, 6) : '';
      const resolvedPin =
        /^\d{4,6}$/.test(explicitPin)
          ? explicitPin
          : /^\d{6}$/.test(phonePin)
          ? phonePin
          : generateSecurePin();

      return {
        loginId,
        fullName,
        phone,
        assignedBusId: assignedBusId || defaultBusId,
        feePaid,
        feeValidUntil,
        feeReceiptId,
        explicitPin,
        resolvedPin,
        action: 'create',
      };
    });

    setRows(parsed);
  };

  const validRows = rows.filter((r) => r.action !== 'invalid');
  const updateCount = rows.filter((r) => r.action === 'update').length;
  const createCount = rows.filter((r) => r.action === 'create').length;
  const invalidCount = rows.filter((r) => r.action === 'invalid').length;

  const handleApplyImport = async () => {
    if (validRows.length === 0) return;
    setIsApplying(true);
    const issued: Array<{
      loginId: string;
      fullName: string;
      pin: string;
      busId: string;
    }> = [];

    try {
      for (const row of validRows) {
        if (row.action === 'update' && row.existingUser) {
          await onUpsertUser({
            existingUserId: row.existingUser.userId,
            loginId: row.existingUser.loginId,
            fullName: row.fullName,
            phone: row.phone || undefined,
            assignedBusId: row.assignedBusId || undefined,
            feePaid: row.feePaid,
            feeReceiptId: row.feeReceiptId || undefined,
            feeValidUntil: row.feeValidUntil,
          });
        } else if (row.action === 'create' && row.resolvedPin) {
          const pinHash = await hashPin(row.resolvedPin);
          await onUpsertUser({
            loginId: row.loginId,
            fullName: row.fullName,
            phone: row.phone || undefined,
            assignedBusId: row.assignedBusId,
            feePaid: row.feePaid,
            feeReceiptId: row.feeReceiptId || undefined,
            feeValidUntil: row.feeValidUntil,
            pinHash,
          });
          issued.push({
            loginId: row.loginId,
            fullName: row.fullName,
            pin: row.resolvedPin,
            busId: row.assignedBusId,
          });
        }
      }

      if (issued.length > 0) {
        setCreatedCredentials(issued);
      }
      onSuccess(
        `Fee import applied: ${updateCount} updated, ${createCount} new passengers added.`,
      );
      if (issued.length === 0) {
        onClose();
      }
    } catch (err) {
      console.error('Fee import failed:', err);
      alert('Failed while applying fee updates. Check console for details.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleDownloadNewCreds = () => {
    const csvLines = [
      ['Login ID', 'Full Name', 'Initial PIN', 'Assigned Bus'].map(sanitizeCsvCell).join(','),
      ...createdCredentials.map((c) =>
        [
          sanitizeCsvCell(c.loginId),
          sanitizeCsvCell(c.fullName),
          sanitizeCsvCell(c.pin),
          sanitizeCsvCell(c.busId),
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VahanSync_New_Passengers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '760px' }}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-emerald-400" />
            <h3 className="modal-title">Automated Fee Import (CSV &amp; Excel)</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Format Requirements Note + Sample Table */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2.5">
            <div className="text-xs font-semibold text-emerald-300">
              File Format Note: Upload a <code>.csv</code> or <code>.xlsx</code> file containing the
              columns shown below. Existing passengers keep their accounts while updating Fee Status
              &amp; Valid Until; new passengers are added using the first 6 digits of their Phone as
              their initial PIN.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-300">
                    <th className="p-2 border border-slate-800">Login ID</th>
                    <th className="p-2 border border-slate-800">Full Name</th>
                    <th className="p-2 border border-slate-800">Phone</th>
                    <th className="p-2 border border-slate-800">Assigned Bus</th>
                    <th className="p-2 border border-slate-800">Fee Status</th>
                    <th className="p-2 border border-slate-800">Valid Until</th>
                    <th className="p-2 border border-slate-800">Receipt No</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300 font-mono">
                  <tr>
                    <td className="p-2 border border-slate-800">AIE24141</td>
                    <td className="p-2 border border-slate-800">Jaya</td>
                    <td className="p-2 border border-slate-800">9876543210</td>
                    <td className="p-2 border border-slate-800">BUS_01</td>
                    <td className="p-2 border border-slate-800 text-emerald-400">PAID</td>
                    <td className="p-2 border border-slate-800">2027-05-31</td>
                    <td className="p-2 border border-slate-800">REC-104</td>
                  </tr>
                  <tr>
                    <td className="p-2 border border-slate-800">student_02</td>
                    <td className="p-2 border border-slate-800">Sneha Reddy</td>
                    <td className="p-2 border border-slate-800">9123456789</td>
                    <td className="p-2 border border-slate-800">BUS_01</td>
                    <td className="p-2 border border-slate-800 text-amber-400">UNPAID</td>
                    <td className="p-2 border border-slate-800"></td>
                    <td className="p-2 border border-slate-800"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* File Input */}
          <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-700 rounded-xl bg-slate-950/60 hover:border-emerald-500/60 cursor-pointer transition-colors">
            <Upload size={24} className="text-emerald-400 mb-2" />
            <span className="text-sm font-semibold text-slate-200">
              {fileName ? `Selected: ${fileName}` : 'Choose .CSV or .XLSX Fee File'}
            </span>
            <span className="text-[11px] text-slate-400 mt-1">
              Non-destructive sync: unlisted existing passengers remain unchanged
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Dry-Run Summary */}
          {rows.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                  {updateCount} Existing Updates
                </span>
                <span className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                  {createCount} New Passengers
                </span>
                {invalidCount > 0 && (
                  <span className="px-2.5 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/30 font-semibold">
                    {invalidCount} Skipped
                  </span>
                )}
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-400 sticky top-0">
                    <tr>
                      <th className="p-2">Action</th>
                      <th className="p-2">Login ID</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Bus</th>
                      <th className="p-2">Fee</th>
                      <th className="p-2">Valid Until</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.slice(0, 60).map((r, i) => (
                      <tr key={`${r.loginId}-${i}`} className="bg-slate-950/60">
                        <td className="p-2 font-semibold">
                          {r.action === 'update' ? (
                            <span className="text-blue-400">UPDATE</span>
                          ) : r.action === 'create' ? (
                            <span className="text-emerald-400">NEW (PIN: {r.resolvedPin})</span>
                          ) : (
                            <span className="text-red-400">{r.error || 'SKIP'}</span>
                          )}
                        </td>
                        <td className="p-2 font-mono">{r.loginId}</td>
                        <td className="p-2">{r.fullName || '—'}</td>
                        <td className="p-2">{r.assignedBusId}</td>
                        <td className="p-2">{r.feePaid ? 'Paid' : 'Unpaid'}</td>
                        <td className="p-2 font-mono text-[11px]">
                          {r.feeValidUntil ? r.feeValidUntil.slice(0, 10) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {createdCredentials.length > 0 && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <span>
                  Created <strong>{createdCredentials.length}</strong> new passengers with initial
                  PINs (first 6 digits of phone). Download their initial credentials now.
                </span>
              </div>
              <button
                type="button"
                onClick={handleDownloadNewCreds}
                className="btn-primary text-xs py-1.5 px-3 shrink-0"
              >
                <Download size={14} />
                <span>Download PINs CSV</span>
              </button>
            </div>
          )}

          {invalidCount > 0 && rows.length > 0 && (
            <div className="text-xs text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Skipped rows had missing Login ID or missing Full Name for new records.</span>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              onClick={handleApplyImport}
              disabled={isApplying || validRows.length === 0 || createdCredentials.length > 0}
              className="btn-primary"
            >
              {isApplying
                ? 'Syncing to DynamoDB...'
                : `Apply Fee Update (${validRows.length} rows)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
