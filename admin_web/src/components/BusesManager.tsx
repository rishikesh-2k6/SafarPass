import { useState, useMemo, type FC, type FormEvent } from 'react';
import type { Schema } from '../../amplify/data/resource';
import {
  Bus as BusIcon,
  PlusCircle,
  Search,
  Key,
  RotateCw,
  Edit2,
  Trash2,
  CheckCircle,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
} from 'lucide-react';

type BusType = Schema['Bus']['type'];
type TripType = Schema['Trip']['type'];
type BusLocationType = Schema['BusLocation']['type'];

interface BusesManagerProps {
  buses: BusType[];
  trips: TripType[];
  busLocations: BusLocationType[];
  onAddBus: (bus: {
    busId: string;
    routeName: string;
    capacity: number;
    qrSecret: string;
  }) => Promise<void>;
  onUpdateBus: (bus: {
    busId: string;
    routeName: string;
    capacity: number;
  }) => Promise<void>;
  onRotateSecret: (busId: string) => Promise<string>;
  onDeleteBus: (busId: string) => Promise<void>;
}

export const BusesManager: FC<BusesManagerProps> = ({
  buses,
  trips,
  busLocations,
  onAddBus,
  onUpdateBus,
  onRotateSecret,
  onDeleteBus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusType | null>(null);

  // Form states
  const [formBusId, setFormBusId] = useState('');
  const [formRouteName, setFormRouteName] = useState('');
  const [formCapacity, setFormCapacity] = useState('45');
  const [formQrSecret, setFormQrSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const generateRandomSecret = (busId: string) => {
    const id = busId.trim() || 'BUS_XX';
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SECRET_KEY_${id}_${rand}_2026`;
  };

  const handleOpenAddModal = () => {
    setEditingBus(null);
    const nextBusNum = buses.length + 1;
    const defaultId = `BUS_0${nextBusNum}`;
    setFormBusId(defaultId);
    setFormRouteName('');
    setFormCapacity('45');
    setFormQrSecret(generateRandomSecret(defaultId));
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (bus: BusType) => {
    setEditingBus(bus);
    setFormBusId(bus.busId);
    setFormRouteName(bus.routeName);
    setFormCapacity(String(bus.capacity ?? 45));
    setFormQrSecret(bus.qrSecret);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formBusId || !formRouteName) return;

    try {
      setIsSubmitting(true);
      if (editingBus) {
        await onUpdateBus({
          busId: formBusId,
          routeName: formRouteName,
          capacity: parseInt(formCapacity, 10) || 45,
        });
        showToast(`Bus ${formBusId} updated successfully`);
      } else {
        await onAddBus({
          busId: formBusId.toUpperCase().trim(),
          routeName: formRouteName.trim(),
          capacity: parseInt(formCapacity, 10) || 45,
          qrSecret: formQrSecret.trim() || generateRandomSecret(formBusId),
        });
        showToast(`Bus ${formBusId} registered successfully`);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving bus:', err);
      alert('Failed to save bus record. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRotate = async (busId: string) => {
    if (
      !window.confirm(
        `Rotate QR Secret for ${busId}?\nThis will immediately invalidate all previously scanned or screenshotted QR passes for this bus.`
      )
    ) {
      return;
    }
    try {
      const newSecret = await onRotateSecret(busId);
      showToast(`Rotated QR secret for ${busId}: ${newSecret.substring(0, 16)}...`);
    } catch (err) {
      console.error('Failed to rotate secret:', err);
      alert('Failed to rotate secret.');
    }
  };

  const handleDelete = async (busId: string) => {
    if (
      !window.confirm(
        `Are you sure you want to PERMANENTLY delete ${busId}? All route metadata will be removed.`
      )
    ) {
      return;
    }
    try {
      await onDeleteBus(busId);
      showToast(`Bus ${busId} deleted.`);
    } catch (err) {
      console.error('Failed to delete bus:', err);
      alert('Failed to delete bus record.');
    }
  };

  const handleCopySecret = (busId: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedId(busId);
    showToast(`Copied QR Secret for ${busId} to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleRevealSecret = (busId: string) => {
    setRevealedSecrets((prev) => ({
      ...prev,
      [busId]: !prev[busId],
    }));
  };

  const filteredBuses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return buses;
    return buses.filter(
      (b) =>
        b.busId.toLowerCase().includes(q) ||
        b.routeName.toLowerCase().includes(q)
    );
  }, [buses, searchQuery]);

  // Check active trip per bus
  const activeTripsMap = useMemo(() => {
    const map = new Map<string, TripType>();
    trips
      .filter((t) => t.status === 'active' || t.status === 'sos')
      .forEach((t) => map.set(t.busId, t));
    return map;
  }, [trips]);

  return (
    <div className="manager-view">
      {/* Toast notification */}
      {toastMessage && (
        <div className="floating-toast">
          <CheckCircle size={18} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top action strip */}
      <div className="manager-header-strip">
        <div className="manager-title-group">
          <div className="flex items-center gap-2">
            <BusIcon size={22} className="text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-100">
              Campus Fleet Directory
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            {buses.length} registered {buses.length === 1 ? 'bus' : 'buses'} in DynamoDB
          </span>
        </div>

        <div className="manager-actions-row">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search by Bus ID or Route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={handleOpenAddModal}
          >
            <PlusCircle size={18} />
            <span>Register New Bus</span>
          </button>
        </div>
      </div>

      {/* Buses Grid */}
      {filteredBuses.length > 0 ? (
        <div className="buses-grid">
          {filteredBuses.map((bus) => {
            const activeTrip = activeTripsMap.get(bus.busId);
            const liveLoc = busLocations.find((l) => l.busId === bus.busId);
            const isRevealed = !!revealedSecrets[bus.busId];

            return (
              <div
                key={bus.busId}
                className={`bus-management-card ${
                  activeTrip ? 'border-emerald-500/40' : 'border-slate-800'
                }`}
              >
                {/* Header */}
                <div className="bus-card-top">
                  <div className="flex items-center gap-3">
                    <div className="bus-badge-icon">
                      <BusIcon size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-lg text-slate-100">
                        {bus.busId}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {bus.routeName}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`status-pill ${
                      activeTrip ? 'status-pill-active' : 'status-pill-idle'
                    }`}
                  >
                    {activeTrip
                      ? activeTrip.status === 'sos'
                        ? 'SOS ALERT'
                        : 'ACTIVE TRIP'
                      : 'IDLE'}
                  </span>
                </div>

                {/* Stats */}
                <div className="bus-card-stats">
                  <div className="stat-box">
                    <span className="stat-label">Max Capacity</span>
                    <span className="stat-val text-slate-200">
                      {bus.capacity ?? 45} seats
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Live Boarded</span>
                    <span className="stat-val text-emerald-400">
                      {liveLoc?.boardedCount ?? 0} students
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Driver ID</span>
                    <span className="stat-val text-slate-300">
                      {activeTrip ? activeTrip.driverId : 'Unassigned'}
                    </span>
                  </div>
                </div>

                {/* QR Secret Key Box */}
                <div className="secret-key-box">
                  <div className="secret-header">
                    <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                      <Key size={12} className="text-amber-400" />
                      Dynamic QR Secret Key
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="secret-icon-btn"
                        onClick={() => toggleRevealSecret(bus.busId)}
                        title={isRevealed ? 'Hide Secret' : 'Reveal Secret'}
                      >
                        {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        className="secret-icon-btn"
                        onClick={() => handleCopySecret(bus.busId, bus.qrSecret)}
                        title="Copy Secret"
                      >
                        {copiedId === bus.busId ? (
                          <Check size={13} className="text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="secret-val font-mono">
                    {isRevealed ? (
                      <span className="text-amber-300 break-all select-all">
                        {bus.qrSecret}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {bus.qrSecret.substring(0, 10)}••••••••••••••••
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="bus-card-actions">
                  <button
                    type="button"
                    className="bus-action-btn btn-edit"
                    onClick={() => handleOpenEditModal(bus)}
                    title="Edit Route or Capacity"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className="bus-action-btn btn-rotate"
                    onClick={() => handleRotate(bus.busId)}
                    title="Generate New QR Secret (Invalidates old student QR codes)"
                  >
                    <RotateCw size={14} />
                    <span>Rotate Secret</span>
                  </button>
                  <button
                    type="button"
                    className="bus-action-btn btn-delete"
                    onClick={() => handleDelete(bus.busId)}
                    title="Delete Bus Record"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-manager-state">
          <BusIcon size={44} className="text-slate-600 mb-3" />
          <h4 className="text-lg font-bold text-slate-300">No Buses Found</h4>
          <p className="text-sm text-slate-400 max-w-md text-center mt-1">
            {searchQuery
              ? `No registered buses matching "${searchQuery}".`
              : 'Register your first campus fleet bus to enable live route tracking and boarding.'}
          </p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={handleOpenAddModal}
          >
            <PlusCircle size={18} />
            <span>Register First Bus</span>
          </button>
        </div>
      )}

      {/* Add / Edit Bus Modal */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">
                {editingBus ? `Edit Bus ${editingBus.busId}` : 'Register New Fleet Bus'}
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
              <div className="form-group">
                <label>Bus ID (Primary Key)</label>
                <input
                  type="text"
                  required
                  disabled={!!editingBus}
                  placeholder="e.g. BUS_01"
                  value={formBusId}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setFormBusId(val);
                    if (!editingBus) {
                      setFormQrSecret(generateRandomSecret(val));
                    }
                  }}
                  className={editingBus ? 'opacity-60 cursor-not-allowed' : ''}
                />
                {!editingBus && (
                  <span className="text-[11px] text-slate-400 mt-1">
                    Unique identifier used on student passes and driver credentials.
                  </span>
                )}
              </div>

              <div className="form-group">
                <label>Assigned Route Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. North City & Tech Park Express"
                  value={formRouteName}
                  onChange={(e) => setFormRouteName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Passenger Seating Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  required
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                />
              </div>

              {!editingBus && (
                <div className="form-group">
                  <div className="flex items-center justify-between">
                    <label>HMAC-SHA256 QR Secret Key</label>
                    <button
                      type="button"
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                      onClick={() => setFormQrSecret(generateRandomSecret(formBusId))}
                    >
                      <RotateCw size={11} />
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formQrSecret}
                    onChange={(e) => setFormQrSecret(e.target.value)}
                    className="font-mono text-xs text-amber-300"
                  />
                  <span className="text-[11px] text-slate-400 mt-1">
                    Secret key shared with student passes for cryptographic tamper-proofing.
                  </span>
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
                    : editingBus
                    ? 'Update Bus'
                    : 'Register Bus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
