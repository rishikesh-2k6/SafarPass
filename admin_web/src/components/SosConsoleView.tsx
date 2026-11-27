import { useState, type FC } from 'react';
import type { Schema } from '../../amplify/data/resource';
import {
  parseSosReporters,
  formatSosCategoryLabel,
} from '../utils/routeUtils';
import {
  AlertTriangle,
  Volume2,
  CheckCircle,
  MapPin,
  Users,
  ShieldAlert,
} from 'lucide-react';

type TripType = Schema['Trip']['type'];
type BusLocationType = Schema['BusLocation']['type'];
type BusType = Schema['Bus']['type'];

interface SosConsoleViewProps {
  buses: BusType[];
  trips: TripType[];
  busLocations: BusLocationType[];
  onTriggerBuzzer: (busId: string, tripId: string | undefined, message: string) => Promise<void>;
  onResolveSos: (tripId: string, busId: string) => Promise<void>;
}

export const SosConsoleView: FC<SosConsoleViewProps> = ({
  buses,
  trips,
  busLocations,
  onTriggerBuzzer,
  onResolveSos,
}) => {
  const [selectedBusId, setSelectedBusId] = useState<string>(buses[0]?.busId || 'BUS_01');
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const activeSosTrips = trips.filter((t) => t.status === 'sos');
  const historicalSosTrips = trips
    .filter(
      (t) =>
        t.status !== 'sos' &&
        (Boolean(t.sosCategory) || Boolean(t.sosReporterIdsJson)),
    )
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  const handleBroadcastBuzzer = async (targetBusId: string, tripId?: string) => {
    setIsSending(true);
    try {
      const msg =
        customMessage.trim() ||
        `EMERGENCY ALERT FROM DISPATCH (${targetBusId}): Follow safety instructions immediately.`;
      await onTriggerBuzzer(targetBusId, tripId, msg);
      setCustomMessage('');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Disaster-Style Emergency Buzzer Broadcast Box */}
      <section className="p-5 rounded-2xl bg-slate-900 border border-red-500/30 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
            <Volume2 size={22} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-100">
              Emergency Buzzer Alert Broadcast (Driver &amp; Passengers)
            </h2>
            <p className="text-xs text-slate-400">
              Triggers an instant disaster-style emergency siren &amp; alert banner on both the
              Driver and boarded/assigned Passenger apps for the selected bus (Parents excluded).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedBusId}
            onChange={(e) => setSelectedBusId(e.target.value)}
            className="modal-select"
          >
            {buses.map((b) => (
              <option key={b.busId} value={b.busId}>
                {b.busId} — {b.routeName}
              </option>
            ))}
            {buses.length === 0 && <option value="BUS_01">BUS_01</option>}
          </select>
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Optional emergency alert message..."
            className="md:col-span-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
          />
          <button
            type="button"
            disabled={isSending}
            onClick={() => {
              const activeForBus = trips.find(
                (t) =>
                  t.busId === selectedBusId &&
                  (t.status === 'active' || t.status === 'sos'),
              );
              handleBroadcastBuzzer(selectedBusId, activeForBus?.id);
            }}
            className="btn-force-end justify-center py-2.5"
          >
            <Volume2 size={16} />
            <span>{isSending ? 'Broadcasting...' : 'Sound Alert Buzzer'}</span>
          </button>
        </div>
      </section>

      {/* Active SOS Incidents */}
      <section className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <ShieldAlert size={19} className="text-red-400" />
            <h2 className="panel-title">Active SOS Emergencies ({activeSosTrips.length})</h2>
          </div>
        </div>

        {activeSosTrips.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSosTrips.map((trip) => {
              const loc = busLocations.find((l) => l.busId === trip.busId);
              const reporters = parseSosReporters(trip.sosReporterIdsJson);
              const boardedCount = loc?.boardedCount ?? 0;
              return (
                <div
                  key={trip.id}
                  className="p-4 rounded-xl bg-red-950/30 border border-red-500/50 space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-red-400 animate-pulse" />
                      <span className="font-extrabold text-slate-100">{trip.busId}</span>
                      <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 text-[11px] font-bold">
                        {formatSosCategoryLabel(trip.sosCategory)}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-amber-300">
                      Source:{' '}
                      {trip.sosTriggerSource === 'passengers_majority'
                        ? '>50% Passengers'
                        : 'Driver'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    <div>
                      Driver: <strong>{trip.driverId}</strong> • Boarded:{' '}
                      <strong>{boardedCount} passengers</strong>
                    </div>
                    {loc && (
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-emerald-400" />
                        <span className="font-mono">
                          {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                        </span>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 underline"
                        >
                          Open Map ↗
                        </a>
                      </div>
                    )}
                    {reporters.length > 0 && (
                      <div className="flex items-center gap-1.5 text-amber-200">
                        <Users size={13} />
                        <span>
                          Passenger SOS reports ({reporters.length}):{' '}
                          {reporters.map((r) => r.fullName).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSending}
                      onClick={() =>
                        handleBroadcastBuzzer(
                          trip.busId,
                          trip.id,
                        )
                      }
                      className="btn-secondary text-xs py-1.5 px-3 border-amber-500/40 text-amber-300"
                    >
                      <Volume2 size={14} />
                      <span>Alert Buzzer (Driver &amp; Passengers)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onResolveSos(trip.id, trip.busId)}
                      className="btn-primary text-xs py-1.5 px-3"
                    >
                      <CheckCircle size={14} />
                      <span>Resolve SOS</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No active SOS alerts. All campus transit buses operating normally.
          </div>
        )}
      </section>

      {/* Historical SOS Log */}
      <section className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <AlertTriangle size={17} className="text-slate-400" />
            <h3 className="panel-title">Recent SOS &amp; Alert History ({historicalSosTrips.length})</h3>
          </div>
        </div>
        <div className="table-responsive">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Bus ID</th>
                <th>Category</th>
                <th>Trigger Source</th>
                <th>Passenger Reports</th>
                <th>Started At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {historicalSosTrips.length > 0 ? (
                historicalSosTrips.slice(0, 20).map((t) => {
                  const reps = parseSosReporters(t.sosReporterIdsJson);
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className="bus-pill">{t.busId}</span>
                      </td>
                      <td className="font-semibold text-slate-200">
                        {formatSosCategoryLabel(t.sosCategory)}
                      </td>
                      <td className="text-xs text-slate-300">
                        {t.sosTriggerSource === 'passengers_majority'
                          ? '>50% Passengers'
                          : t.sosTriggerSource || 'Driver'}
                      </td>
                      <td className="text-xs text-slate-300">{reps.length}</td>
                      <td className="text-xs text-slate-400">
                        {t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}
                      </td>
                      <td className="text-xs font-semibold text-slate-300">
                        {t.status.toUpperCase()}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-xs text-slate-400">
                    No past SOS incidents logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
