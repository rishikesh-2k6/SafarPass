import { useState, useMemo, useRef, useEffect, type FC, type FormEvent } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { generateSecurePin } from '../utils/crypto';
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
  ShieldCheck,
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
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
  }) => Promise<void>;
  onUpdateUser: (user: {
    userId: string;
    loginId: string;
    pin?: string;
    fullName: string;
    role: string;
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
    unlock?: boolean;
  }) => Promise<void>;
  onToggleFeePaid: (userId: string, currentStatus: boolean) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onSeedSampleData: () => Promise<void>;
}

export const UsersManager: FC<UsersManagerProps> = ({
  users,
  buses,
  onAddUser,
  onUpdateUser,
  onToggleFeePaid,
  onDeleteUser,
  onSeedSampleData,
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'driver' | 'parent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfileType | null>(null);

  // Form states
  const [formRole, setFormRole] = useState<'student' | 'driver' | 'parent'>('student');
  const [formFullName, setFormFullName] = useState('');
  const [formLoginId, setFormLoginId] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formAssignedBusId, setFormAssignedBusId] = useState('');
  const [formParentOfStudentId, setFormParentOfStudentId] = useState('');
  const [formFeePaid, setFormFeePaid] = useState(true);

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
    setFormPin(generateSecurePin());
    setFormAssignedBusId(buses[0]?.busId || 'BUS_01');
    setFormParentOfStudentId('');
    setFormFeePaid(true);

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
    setFormPin('');
    setFormAssignedBusId(user.assignedBusId || '');
    setFormParentOfStudentId(user.parentOfStudentId || '');
    setFormFeePaid(user.feePaid ?? true);
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
    const cleanPin = formPin.trim();

    if (!cleanName || !cleanLoginId) return;

    if (!editingUser && !/^\d{4,6}$/.test(cleanPin)) {
      alert('PIN must be 4 to 6 numeric digits.');
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

    try {
      setIsSubmitting(true);
      if (editingUser) {
        await onUpdateUser({
          userId: editingUser.userId,
          loginId: cleanLoginId,
          pin: cleanPin || undefined,
          fullName: cleanName,
          role: formRole,
          assignedBusId: formAssignedBusId || undefined,
          parentOfStudentId:
            formRole === 'parent' ? formParentOfStudentId.trim() || undefined : undefined,
          feePaid: formRole === 'student' ? formFeePaid : true,
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
          assignedBusId: formAssignedBusId || undefined,
          parentOfStudentId:
            formRole === 'parent' ? formParentOfStudentId.trim() || undefined : undefined,
          feePaid: formRole === 'student' ? formFeePaid : true,
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
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.loginId.toLowerCase().includes(q) ||
          (u.assignedBusId && u.assignedBusId.toLowerCase().includes(q))
      );
    }
    return result;
  }, [users, roleFilter, searchQuery]);

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
              Students & Transit Staff Directory
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
              placeholder="Search by name, roll/ID, or bus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <button
            type="button"
            className="btn-secondary flex items-center gap-2 text-xs"
            onClick={handleSeed}
            disabled={isSeeding}
            title="Seed 1 sample bus, 1 driver, 2 students, and 1 parent"
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

      {/* Role filter pills */}
      <div className="role-filter-row">
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
          Students <span className="pill-count">{counts.student}</span>
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
      </div>

      {/* User Directory Table */}
      {filteredUsers.length > 0 ? (
        <div className="table-responsive">
          <table className="ledger-table users-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Role</th>
                <th>Login ID / Roll No</th>
                <th>PIN Security</th>
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

                return (
                  <tr key={user.userId}>
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
                              ? 'Verified Campus Scholar'
                              : 'Campus User'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`role-badge ${
                          isStudent
                            ? 'role-student'
                            : isDriver
                            ? 'role-driver'
                            : 'role-parent'
                        }`}
                      >
                        {user.role.toUpperCase()}
                      </span>
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
                      <div className="flex items-center gap-1.5">
                        {isLocked ? (
                          <button
                            type="button"
                            onClick={() => handleUnlockUser(user)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded hover:bg-red-500/25"
                            title="Account temporarily locked; click to unlock"
                          >
                            <Lock size={11} />
                            <span>Locked (Unlock)</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            <ShieldCheck size={11} />
                            <span>SHA-256 Protected</span>
                          </span>
                        )}
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
                        <button
                          type="button"
                          className={`fee-status-btn ${
                            user.feePaid ? 'fee-paid' : 'fee-unpaid'
                          }`}
                          onClick={() => onToggleFeePaid(user.userId, user.feePaid ?? true)}
                          title="Click to toggle fee status in DynamoDB"
                        >
                          {user.feePaid ? (
                            <>
                              <CheckCircle size={12} />
                              <span>Paid</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={12} />
                              <span>Unpaid</span>
                            </>
                          )}
                        </button>
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
              : 'Add your first student, driver, or parent profile, or seed sample data.'}
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
                    <span>Student</span>
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
                    ? 'Student Roll Number / Login ID'
                    : formRole === 'driver'
                    ? 'Driver ID / Badge Number'
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

              {/* PIN with CSPRNG Random button */}
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label>
                    {editingUser
                      ? 'Reset Access PIN (leave blank to keep current)'
                      : 'Access PIN (4–6 numeric digits)'}
                  </label>
                  <button
                    type="button"
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                    onClick={() => setFormPin(generateSecurePin())}
                  >
                    <Sparkles size={11} />
                    Random PIN
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required={!editingUser}
                  placeholder={editingUser ? 'Leave blank to keep unchanged' : 'e.g. 4829'}
                  value={formPin}
                  onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ''))}
                  className="font-mono text-center tracking-widest text-base font-bold text-emerald-400"
                />
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

              {/* Parent of Student Dropdown */}
              {formRole === 'parent' && (
                <div className="form-group">
                  <label>Linked Student (Child)</label>
                  <select
                    value={formParentOfStudentId}
                    onChange={(e) => setFormParentOfStudentId(e.target.value)}
                    className="modal-select"
                  >
                    <option value="">-- Select Child / Student --</option>
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
                    Enables parent to live-track their child&apos;s specific assigned bus.
                  </span>
                </div>
              )}

              {/* Fee Paid Toggle */}
              {formRole === 'student' && (
                <div className="form-group">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div>
                      <span className="font-semibold text-sm text-slate-100 block">
                        Transit Fee Clearance
                      </span>
                      <span className="text-xs text-slate-400">
                        {formFeePaid
                          ? 'Valid pass — QR scanning will approve boarding'
                          : 'Unpaid — Scanner will reject boarding with fee due notice'}
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
    </div>
  );
};
