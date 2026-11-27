import { useState, useMemo, useRef, useEffect, type FC, type FormEvent } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { generateSecurePin } from '../utils/crypto';
import { isUserFeeValid } from '../utils/routeUtils';
import { FeeBulkImportModal } from './FeeBulkImportModal';
import {
  Users,
  UserPlus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  Copy,
  Bus as BusIcon,
  Phone,
  School,
  Sparkles,
  Check,
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from 'lucide-react';

type UserProfileType = Schema['UserProfile']['type'];
type BusType = Schema['Bus']['type'];

interface UsersManagerProps {
  users: UserProfileType[];
  buses: BusType[];
  onAddUser: (user: {
    userId?: string;
    loginId: string;
    pin: string;
    fullName: string;
    role: string;
    phone?: string;
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
    feeReceiptId?: string;
    feeValidUntil?: string | null;
  }) => Promise<void>;
  onUpdateUser: (user: {
    userId: string;
    loginId: string;
    pin?: string;
    fullName: string;
    role: string;
    phone?: string;
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
    feeReceiptId?: string;
    feeValidUntil?: string | null;
    unlock?: boolean;
  }) => Promise<void>;
  onBulkUpsertFeeUser: (payload: {
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
  onToggleFeePaid: (userId: string, currentStatus: boolean) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onBulkDeleteUsers: (userIds: string[]) => Promise<void>;
  onSeedSampleData: () => Promise<void>;
}

export const UsersManager: FC<UsersManagerProps> = ({
  users,
  buses,
  onAddUser,
  onUpdateUser,
  onBulkUpsertFeeUser,
  onToggleFeePaid,
  onDeleteUser,
  onBulkDeleteUsers,
  onSeedSampleData,
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'driver' | 'parent'>('all');
  const [busFilter, setBusFilter] = useState<string>('all');
  const [feeFilter, setFeeFilter] = useState<'all' | 'valid' | 'unpaid_or_expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFeeImportOpen, setIsFeeImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfileType | null>(null);

  // Form states
  const [formRole, setFormRole] = useState<'student' | 'driver' | 'parent'>('student');
  const [formFullName, setFormFullName] = useState('');
  const [formLoginId, setFormLoginId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formAssignedBusId, setFormAssignedBusId] = useState('');
  const [formParentOfStudentId, setFormParentOfStudentId] = useState('');
  const [formFeePaid, setFormFeePaid] = useState(true);
  const [formFeeReceiptId, setFormFeeReceiptId] = useState('');
  const [formFeeValidUntil, setFormFeeValidUntil] = useState('');
  const [showPin, setShowPin] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [issuedCredential, setIssuedCredential] = useState<{
    fullName: string;
    loginId: string;
    pin: string;
    role: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      window.clearInterval(id);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3000);
  };

  // Open Add Modal
  const handleOpenAddModal = (defaultRole: 'student' | 'driver' | 'parent' = 'student') => {
    setEditingUser(null);
    setFormRole(defaultRole);
    setFormFullName('');
    setFormPhone('');
    setFormPin('');
    setFormAssignedBusId(buses[0]?.busId || 'BUS_01');
    setFormParentOfStudentId('');
    setFormFeePaid(true);
    setFormFeeReceiptId('');
    setFormFeeValidUntil('');
    setShowPin(false);

    if (defaultRole === 'student') {
      const studentNum = users.filter((u) => u.role === 'student').length + 1;
      setFormLoginId(`student_0${studentNum}`);
    } else if (defaultRole === 'driver') {
      const driverNum = users.filter((u) => u.role === 'driver').length + 1;
      setFormLoginId(`driver_0${driverNum}`);
    } else {
      setFormLoginId('9876543210');
    }

    setIsModalOpen(true);
  };

  // Open Edit Modal (existing PIN is hashed & cannot be read back; blank preserves existing)
  const handleOpenEditModal = (user: UserProfileType) => {
    setEditingUser(user);
    setFormRole((user.role as 'student' | 'driver' | 'parent') || 'student');
    setFormFullName(user.fullName);
    setFormLoginId(user.loginId);
    setFormPhone(user.phone || '');
    setFormPin('');
    setFormAssignedBusId(user.assignedBusId || '');
    setFormParentOfStudentId(user.parentOfStudentId || '');
    setFormFeePaid(user.feePaid ?? true);
    setFormFeeReceiptId(user.feeReceiptId || '');
    setFormFeeValidUntil(user.feeValidUntil ? user.feeValidUntil.slice(0, 10) : '');
    setShowPin(false);
    setIsModalOpen(true);
  };

  const handleRoleChange = (role: 'student' | 'driver' | 'parent') => {
    setFormRole(role);
    if (!editingUser) {
      if (role === 'student') {
        const studentNum = users.filter((u) => u.role === 'student').length + 1;
        setFormLoginId(`student_0${studentNum}`);
      } else if (role === 'driver') {
        const driverNum = users.filter((u) => u.role === 'driver').length + 1;
        setFormLoginId(`driver_0${driverNum}`);
      } else {
        setFormLoginId('9876543210');
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = formFullName.trim();
    const cleanLoginId = formLoginId.trim();
    const cleanPhone = formPhone.replace(/\D/g, '').trim();
    let cleanPin = formPin.trim();

    if (!cleanName || !cleanLoginId) return;

    // Default to first 6 digits of phone when creating a user with blank PIN
    if (!editingUser && !cleanPin && cleanPhone.length >= 6) {
      cleanPin = cleanPhone.slice(0, 6);
    }

    if (!editingUser && !/^\d{4,6}$/.test(cleanPin)) {
      alert('Enter a 4–6 digit PIN or a 6+ digit phone number (first 6 digits used as initial PIN).');
      return;
    }
    if (editingUser && cleanPin.length > 0 && !/^\d{4,6}$/.test(cleanPin)) {
      alert('New PIN must be 4 to 6 numeric digits (or leave blank to keep current PIN).');
      return;
    }

    const duplicate = users.find(
      (u) =>
        u.loginId.toLowerCase() === cleanLoginId.toLowerCase() &&
        u.userId !== editingUser?.userId,
    );
    if (duplicate) {
      alert(`Login ID "${cleanLoginId}" is already assigned to ${duplicate.fullName}.`);
      return;
    }

    const resolvedValidUntil =
      formRole === 'student' && formFeeValidUntil.trim()
        ? new Date(`${formFeeValidUntil.trim()}T23:59:59Z`).toISOString()
        : null;

    try {
      setIsSubmitting(true);
      if (editingUser) {
        await onUpdateUser({
          userId: editingUser.userId,
          loginId: cleanLoginId,
          pin: cleanPin || undefined,
          fullName: cleanName,
          role: formRole,
          phone: cleanPhone || undefined,
          assignedBusId: formAssignedBusId || undefined,
          parentOfStudentId:
            formRole === 'parent' ? formParentOfStudentId.trim() || undefined : undefined,
          feePaid: formRole === 'student' ? formFeePaid : true,
          feeReceiptId: formRole === 'student' ? formFeeReceiptId.trim() || undefined : undefined,
          feeValidUntil: resolvedValidUntil,
        });
        if (cleanPin) {
          setIssuedCredential({
            fullName: cleanName,
            loginId: cleanLoginId,
            pin: cleanPin,
            role: formRole,
          });
        }
        showToast(`User ${cleanName} updated successfully`);
      } else {
        await onAddUser({
          loginId: cleanLoginId,
          pin: cleanPin,
          fullName: cleanName,
          role: formRole,
          phone: cleanPhone || undefined,
          assignedBusId: formAssignedBusId || undefined,
          parentOfStudentId:
            formRole === 'parent' ? formParentOfStudentId.trim() || undefined : undefined,
          feePaid: formRole === 'student' ? formFeePaid : true,
          feeReceiptId: formRole === 'student' ? formFeeReceiptId.trim() || undefined : undefined,
          feeValidUntil: resolvedValidUntil,
        });
        setIssuedCredential({
          fullName: cleanName,
          loginId: cleanLoginId,
          pin: cleanPin,
          role: formRole,
        });
        showToast(`${cleanName} registered as ${formRole}`);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving user:', err);
      alert('Failed to save user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (user: UserProfileType) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${user.fullName} (${user.loginId})? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await onDeleteUser(user.userId);
      showToast(`User ${user.fullName} deleted`);
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user.');
    }
  };

  const handleUnlockUser = async (user: UserProfileType) => {
    try {
      await onUpdateUser({
        userId: user.userId,
        loginId: user.loginId,
        fullName: user.fullName,
        role: user.role,
        assignedBusId: user.assignedBusId ?? undefined,
        parentOfStudentId: user.parentOfStudentId ?? undefined,
        feePaid: user.feePaid ?? true,
        unlock: true,
      });
      showToast(`Unlocked login access for ${user.fullName}`);
    } catch (err) {
      console.error('Failed to unlock user:', err);
      alert('Could not unlock user.');
    }
  };

  const handleCopyLoginId = (user: UserProfileType) => {
    navigator.clipboard.writeText(user.loginId);
    setCopiedId(user.userId);
    showToast(`Copied Login ID "${user.loginId}"`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSeed = async () => {
    try {
      setIsSeeding(true);
      await onSeedSampleData();
      showToast('Sample campus fleet and users seeded successfully!');
    } catch (err) {
      console.error('Error seeding data:', err);
      alert('Failed to seed sample data.');
    } finally {
      setIsSeeding(false);
    }
  };

  // Student list for parent dropdown
  const studentUsers = useMemo(
    () => users.filter((u) => u.role === 'student'),
    [users]
  );

  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = users;
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter);
    }
    if (busFilter !== 'all') {
      result = result.filter((u) => (u.assignedBusId || '') === busFilter);
    }
    if (feeFilter === 'valid') {
      result = result.filter((u) => u.role === 'student' && isUserFeeValid(u));
    } else if (feeFilter === 'unpaid_or_expired') {
      result = result.filter((u) => u.role === 'student' && !isUserFeeValid(u));
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.loginId.toLowerCase().includes(q) ||
          (u.phone && u.phone.toLowerCase().includes(q)) ||
          (u.assignedBusId && u.assignedBusId.toLowerCase().includes(q))
      );
    }
    return result;
  }, [users, roleFilter, busFilter, feeFilter, searchQuery]);

  const toggleSelectedUser = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((u) => selectedIds.includes(u.userId));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredUsers.map((u) => u.userId));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const nextSet = new Set(selectedIds);
      filteredUsers.forEach((u) => nextSet.add(u.userId));
      setSelectedIds(Array.from(nextSet));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.length} selected user records permanently? Unselected records remain untouched.`,
      )
    ) {
      return;
    }
    try {
      await onBulkDeleteUsers(selectedIds);
      showToast(`Deleted ${selectedIds.length} selected user records.`);
      setSelectedIds([]);
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Failed while deleting selected users.');
    }
  };

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === 'student').length,
      driver: users.filter((u) => u.role === 'driver').length,
      parent: users.filter((u) => u.role === 'parent').length,
    }),
    [users]
  );

  return (
    <div className="manager-view">
      {/* Toast notification */}
      {toastMessage && (
        <div className="floating-toast">
          <CheckCircle size={18} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* One-time Issued Credential Notice (never persisted in cleartext) */}
      {issuedCredential && (
        <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4">
          <div className="text-xs text-emerald-200">
            <strong className="text-emerald-300 block mb-0.5">
              One-Time Credentials for {issuedCredential.fullName} ({issuedCredential.role.toUpperCase()})
            </strong>
            Login ID: <code className="bg-slate-900 px-1.5 py-0.5 rounded">{issuedCredential.loginId}</code>{' '}
            | PIN: <code className="bg-slate-900 px-1.5 py-0.5 rounded">{issuedCredential.pin}</code>{' '}
            <span className="text-slate-400">(stored hashed; share now and dismiss)</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-2.5"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Login ID: ${issuedCredential.loginId}\nPIN: ${issuedCredential.pin}\nRole: ${issuedCredential.role}`,
                );
                showToast('One-time credentials copied to clipboard');
              }}
            >
              <Copy size={13} />
              <span>Copy</span>
            </button>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setIssuedCredential(null)}
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Top action strip */}
      <div className="manager-header-strip">
        <div className="manager-title-group">
          <div className="flex items-center gap-2">
            <Users size={22} className="text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-100">
              Passengers &amp; Transit Staff Directory
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {users.length} registered campus profiles in DynamoDB
          </span>
        </div>

        <div className="manager-actions-row">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, Login ID, or bus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-xs"
            onClick={() => setIsFeeImportOpen(true)}
            title="Upload .csv or .xlsx to update fees, extend validity dates, and register new passengers"
          >
            <FileSpreadsheet size={14} className="text-emerald-400" />
            <span>Import Fee CSV / Excel</span>
          </button>

          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-xs"
            onClick={handleSeed}
            disabled={isSeeding}
            title="Seed 1 sample bus, 1 driver, 2 passengers, and 1 parent"
          >
            <Sparkles size={14} className="text-amber-400" />
            <span>{isSeeding ? 'Seeding...' : 'Load Sample Data'}</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => handleOpenAddModal('student')}
          >
            <UserPlus size={18} />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Role, Bus & Fee Filters + Bulk Cleanup Bar */}
      <div className="role-filter-row flex-wrap justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`role-filter-pill ${roleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRoleFilter('all')}
          >
            All Users <span className="pill-count">{counts.all}</span>
          </button>
          <button
            type="button"
            className={`role-filter-pill ${roleFilter === 'student' ? 'active' : ''}`}
            onClick={() => setRoleFilter('student')}
          >
            <School size={13} className="text-blue-400" />
            Passengers <span className="pill-count">{counts.student}</span>
          </button>
          <button
            type="button"
            className={`role-filter-pill ${roleFilter === 'driver' ? 'active' : ''}`}
            onClick={() => setRoleFilter('driver')}
          >
            <BusIcon size={13} className="text-emerald-400" />
            Drivers <span className="pill-count">{counts.driver}</span>
          </button>
          <button
            type="button"
            className={`role-filter-pill ${roleFilter === 'parent' ? 'active' : ''}`}
            onClick={() => setRoleFilter('parent')}
          >
            <Phone size={13} className="text-purple-400" />
            Parents <span className="pill-count">{counts.parent}</span>
          </button>

          <select
            value={busFilter}
            onChange={(e) => setBusFilter(e.target.value)}
            className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
            title="Filter by Assigned Bus"
          >
            <option value="all">All Buses</option>
            {buses.map((b) => (
              <option key={b.busId} value={b.busId}>
                {b.busId}
              </option>
            ))}
          </select>

          <select
            value={feeFilter}
            onChange={(e) =>
              setFeeFilter(e.target.value as 'all' | 'valid' | 'unpaid_or_expired')
            }
            className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
            title="Filter by Fee / Validity Status for Cleanup"
          >
            <option value="all">All Fee Statuses</option>
            <option value="valid">Fee Paid &amp; Valid</option>
            <option value="unpaid_or_expired">Pending / Expired</option>
          </select>
        </div>

        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={handleBulkDelete}
            className="btn-force-end text-xs py-1.5 px-3"
          >
            <Trash2 size={14} />
            <span>Delete Selected ({selectedIds.length})</span>
          </button>
        )}
      </div>

      {/* User Directory Table */}
      {filteredUsers.length > 0 ? (
        <div className="table-responsive">
          <table className="ledger-table users-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    title="Select all visible rows for bulk cleanup"
                  />
                </th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Login ID</th>
                <th>Assigned Bus</th>
                <th>Fee Status / Relation</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isStudent = user.role === 'student';
                const isParent = user.role === 'parent';
                const isDriver = user.role === 'driver';
                const isLocked =
                  !!user.lockedUntil && Date.parse(user.lockedUntil) > nowMs;
                const feeValid = isUserFeeValid(user);

                return (
                  <tr key={user.userId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(user.userId)}
                        onChange={() => toggleSelectedUser(user.userId)}
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          className={`avatar-circle ${
                            isStudent
                              ? 'bg-blue-500/20 text-blue-400'
                              : isDriver
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-purple-500/20 text-purple-400'
                          }`}
                        >
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">
                            {user.fullName}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {isParent && user.parentOfStudentId
                              ? `Parent of: ${user.parentOfStudentId}`
                              : isDriver
                              ? 'Authorized Fleet Pilot'
                              : isStudent
                              ? user.phone
                                ? `Phone: ${user.phone}`
                                : 'Verified Transit Passenger'
                              : 'Campus User'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`role-badge ${
                            isStudent
                              ? 'role-student'
                              : isDriver
                              ? 'role-driver'
                              : 'role-parent'
                          }`}
                        >
                          {isStudent ? 'PASSENGER' : user.role.toUpperCase()}
                        </span>
                        {isLocked && (
                          <button
                            type="button"
                            onClick={() => handleUnlockUser(user)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500/25"
                            title="Account temporarily locked; click to unlock"
                          >
                            <Lock size={11} />
                            <span>Locked (Unlock)</span>
                          </button>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="flex items-center gap-1.5">
                        <code className="text-slate-300 font-mono text-xs bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
                          {user.loginId}
                        </code>
                        <button
                          type="button"
                          className="secret-icon-btn"
                          onClick={() => handleCopyLoginId(user)}
                          title="Copy Login ID"
                        >
                          {copiedId === user.userId ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    </td>

                    <td>
                      {user.assignedBusId ? (
                        <span className="bus-pill">{user.assignedBusId}</span>
                      ) : (
                        <span className="text-xs text-slate-500">Unassigned</span>
                      )}
                    </td>

                    <td>
                      {isStudent ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            className={`fee-status-btn ${
                              feeValid ? 'fee-paid' : 'fee-unpaid'
                            }`}
                            onClick={() => onToggleFeePaid(user.userId, user.feePaid ?? true)}
                            title="Click to toggle fee status in DynamoDB"
                          >
                            {feeValid ? (
                              <>
                                <CheckCircle size={12} />
                                <span>Paid</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={12} />
                                <span>{user.feePaid === false ? 'Unpaid' : 'Expired'}</span>
                              </>
                            )}
                          </button>
                          {(user.feeValidUntil || user.feeReceiptId) && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {user.feeValidUntil ? `Till ${user.feeValidUntil.slice(0, 10)}` : ''}
                              {user.feeReceiptId ? ` • ${user.feeReceiptId}` : ''}
                            </span>
                          )}
                        </div>
                      ) : isParent ? (
                        <span className="text-xs text-purple-300">
                          Child: {user.parentOfStudentId || 'N/A'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Regular Staff</span>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => handleOpenEditModal(user)}
                          title="Edit User / Reset PIN"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          className="table-action-btn delete-btn"
                          onClick={() => handleDelete(user)}
                          title="Delete User"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-manager-state">
          <Users size={44} className="text-slate-600 mb-3" />
          <h4 className="text-lg font-bold text-slate-300">No Users Found</h4>
          <p className="text-sm text-slate-400 max-w-md text-center mt-1">
            {searchQuery
              ? `No user records match "${searchQuery}".`
              : 'Add your first passenger, driver, or parent profile, or seed sample data.'}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={handleSeed}
              disabled={isSeeding}
            >
              <Sparkles size={16} className="text-amber-400" />
              <span>{isSeeding ? 'Seeding...' : 'Load Sample Campus Data'}</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleOpenAddModal('student')}
            >
              <UserPlus size={18} />
              <span>Add New User</span>
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingUser ? `Edit ${editingUser.fullName}` : 'Register New Campus User'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              {/* Role Selector Tabs */}
              <div className="form-group">
                <label>Select User Role</label>
                <div className="modal-role-selector">
                  <button
                    type="button"
                    className={`modal-role-btn ${formRole === 'student' ? 'active' : ''}`}
                    onClick={() => handleRoleChange('student')}
                  >
                    <School size={16} />
                    <span>Passenger</span>
                  </button>
                  <button
                    type="button"
                    className={`modal-role-btn ${formRole === 'driver' ? 'active' : ''}`}
                    onClick={() => handleRoleChange('driver')}
                  >
                    <BusIcon size={16} />
                    <span>Driver</span>
                  </button>
                  <button
                    type="button"
                    className={`modal-role-btn ${formRole === 'parent' ? 'active' : ''}`}
                    onClick={() => handleRoleChange('parent')}
                  >
                    <Phone size={16} />
                    <span>Parent</span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div className="form-group">
                <label>Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Patel"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                />
              </div>

              {/* Login ID */}
              <div className="form-group">
                <label>
                  {formRole === 'student'
                    ? 'Passenger Login ID'
                    : formRole === 'driver'
                    ? 'Driver Login ID'
                    : 'Parent Phone Number (Login ID)'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    formRole === 'student'
                      ? 'e.g. 24AIE001 or student_01'
                      : formRole === 'driver'
                      ? 'e.g. driver_01'
                      : 'e.g. 9876543210'
                  }
                  value={formLoginId}
                  onChange={(e) => setFormLoginId(e.target.value)}
                />
              </div>

              {/* Phone Number (First 6 digits used as default initial PIN if PIN blank) */}
              <div className="form-group">
                <label>Mobile Phone Number (optional — first 6 digits = default PIN)</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>

              {/* PIN with CSPRNG Random button and eye toggle */}
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label>
                    {editingUser
                      ? 'Reset Access PIN (leave blank to keep current)'
                      : 'Access PIN (leave blank to use first 6 digits of Phone)'}
                  </label>
                  <button
                    type="button"
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                    onClick={() => {
                      setFormPin(generateSecurePin());
                      setShowPin(true);
                    }}
                  >
                    <Sparkles size={11} />
                    Random PIN
                  </button>
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={
                      editingUser
                        ? 'Leave blank to keep unchanged'
                        : 'Auto from phone or enter 4–6 digits'
                    }
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full pr-10 font-mono text-center tracking-widest text-base font-bold text-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    className="absolute right-3 text-slate-400 hover:text-slate-200 transition-colors"
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                    title={showPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Assigned Bus */}
              <div className="form-group">
                <label>Assigned Bus Fleet</label>
                <select
                  value={formAssignedBusId}
                  onChange={(e) => setFormAssignedBusId(e.target.value)}
                  className="modal-select"
                >
                  <option value="">-- Select Assigned Bus --</option>
                  {buses.map((b) => (
                    <option key={b.busId} value={b.busId}>
                      {b.busId} — {b.routeName}
                    </option>
                  ))}
                  {buses.length === 0 && <option value="BUS_01">BUS_01 (Default)</option>}
                </select>
              </div>

              {/* Parent of Passenger Dropdown */}
              {formRole === 'parent' && (
                <div className="form-group">
                  <label>Linked Passenger (Child / Ward)</label>
                  <select
                    value={formParentOfStudentId}
                    onChange={(e) => setFormParentOfStudentId(e.target.value)}
                    className="modal-select"
                  >
                    <option value="">-- Select Linked Passenger --</option>
                    {studentUsers.map((s) => (
                      <option key={s.userId} value={s.loginId}>
                        {s.fullName} ({s.loginId})
                      </option>
                    ))}
                    {studentUsers.length === 0 && (
                      <option value="student_01">Aarav Patel (student_01)</option>
                    )}
                  </select>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Enables parent to live-track their ward&apos;s specific assigned bus.
                  </span>
                </div>
              )}

              {/* Fee Paid Toggle + Validity */}
              {formRole === 'student' && (
                <div className="form-group space-y-2.5">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div>
                      <span className="font-semibold text-sm text-slate-100 block">
                        Transit Fee Clearance
                      </span>
                      <span className="text-xs text-slate-400">
                        {formFeePaid
                          ? 'Valid pass — QR scanning will approve boarding'
                          : 'Unpaid — Blocked unless bus-wise grace override is active'}
                      </span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={formFeePaid}
                        onChange={(e) => setFormFeePaid(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs text-slate-300">Valid Until Date (optional)</label>
                      <input
                        type="date"
                        value={formFeeValidUntil}
                        onChange={(e) => setFormFeeValidUntil(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300">Receipt No (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. REC-2026-101"
                        value={formFeeReceiptId}
                        onChange={(e) => setFormFeeReceiptId(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingUser
                    ? 'Update User'
                    : 'Register User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isFeeImportOpen && (
        <FeeBulkImportModal
          users={users}
          buses={buses}
          onUpsertUser={onBulkUpsertFeeUser}
          onClose={() => setIsFeeImportOpen(false)}
          onSuccess={(summary) => showToast(summary)}
        />
      )}
    </div>
  );
};
