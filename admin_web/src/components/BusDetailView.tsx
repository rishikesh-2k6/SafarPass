import { type FC } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { Schema } from '../../amplify/data/resource';
import {
  parseStopsJson,
  parsePolylineJson,
  fallbackStraightPolyline,
  isBusOverrideActive,
  isUserFeeValid,
} from '../utils/routeUtils';
import {
  ArrowLeft,
  Bus as BusIcon,
  ShieldCheck,
  ShieldOff,
  Clock,
  Route,
  Users,
  CheckCircle,
  UserCheck,
  MapPin,
} from 'lucide-react';

type BusType = Schema['Bus']['type'];
type BusLocationType = Schema['BusLocation']['type'];
type TripType = Schema['Trip']['type'];
type UserProfileType = Schema['UserProfile']['type'];
type AttendanceLogType = Schema['AttendanceLog']['type'];

interface BusDetailViewProps {
  bus: BusType;
  location?: BusLocationType;
  trips: TripType[];
  users: UserProfileType[];
  attendanceLogs: AttendanceLogType[];
  onBack: () => void;
  onSetAllowUnpaidUntil: (busId: string, allowUnpaidUntil: string | null) => Promise<void>;
  onManualBoardPassenger: (busId: string, tripId: string, student: UserProfileType) => Promise<void>;
}

const busPinIcon = new L.DivIcon({
  className: 'custom-bus-marker',
  html: `<div style="background:#10b981;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #0f172a;box-shadow:0 4px 12px rgba(16,185,129,0.6);"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function stopMarkerIcon(order: number) {
  return new L.DivIcon({
    className: 'stop-pin-marker',
    html: `<div style="background:#2563eb;color:#fff;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;border:2px solid #fff;">${order}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export const BusDetailView: FC<BusDetailViewProps> = ({
  bus,
  location,
  trips,
  users,
  attendanceLogs,
  onBack,
  onSetAllowUnpaidUntil,
  onManualBoardPassenger,
}) => {
  const busTrips = trips
    .filter((t) => t.busId === bus.busId)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));

  const activeTrip = busTrips.find((t) => t.status === 'active' || t.status === 'sos');
  const busDrivers = users.filter((u) => u.role === 'driver' && u.assignedBusId === bus.busId);
  const busPassengers = users.filter((u) => u.role === 'student' && u.assignedBusId === bus.busId);

  const stops = parseStopsJson(location?.stopsJson || bus.stopsJson);
  const rawPoly = parsePolylineJson(location?.routePolylineJson || bus.routePolylineJson);
  const polyline = rawPoly.length >= 2 ? rawPoly : fallbackStraightPolyline(stops);

  const capacity = bus.capacity ?? 45;
  const boardedCount = location?.boardedCount ?? 0;
  const overrideActive = isBusOverrideActive(bus.allowUnpaidUntil);

  const boardedIdsInActiveTrip = new Set(
    activeTrip
      ? attendanceLogs.filter((l) => l.tripId === activeTrip.id).map((l) => l.studentId)
      : [],
  );

  const mapCenter: [number, number] = location
    ? [location.lat, location.lng]
    : stops[0]
    ? [stops[0].lat, stops[0].lng]
    : [16.4632, 80.5064];

  const enableOverrideForDays = async (days: number) => {
    const target = new Date();
    target.setDate(target.getDate() + (days - 1));
    target.setHours(23, 59, 59, 999);
    await onSetAllowUnpaidUntil(bus.busId, target.toISOString());
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary py-2 px-3 text-xs"
          >
            <ArrowLeft size={15} />
            <span>Back to Fleet</span>
          </button>
          <div className="bus-badge-icon">
            <BusIcon size={20} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-100">
              {bus.busId} — {bus.routeName}
            </h2>
            <p className="text-xs text-slate-400">
              Destination: <strong className="text-emerald-300">{bus.destination || 'Not set'}</strong>{' '}
              • Driver: <strong className="text-slate-200">{busDrivers[0]?.fullName || activeTrip?.driverId || 'Unassigned'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200">
            Occupancy: <span className="text-emerald-400">{boardedCount} / {capacity} seats</span>
          </div>
          <span
            className={`status-pill ${
              activeTrip ? (activeTrip.status === 'sos' ? 'status-pill-sos' : 'status-pill-active') : 'status-pill-idle'
            }`}
          >
            {activeTrip ? (activeTrip.status === 'sos' ? 'SOS ALERT' : 'ACTIVE TRIP') : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Bus-Wise Temporary Unpaid Boarding Override Control */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          {overrideActive ? (
            <ShieldCheck size={20} className="text-amber-400 shrink-0" />
          ) : (
            <ShieldOff size={20} className="text-slate-400 shrink-0" />
          )}
          <div>
            <div className="text-sm font-bold text-slate-100">
              Allow Unpaid Boarding ({bus.busId})
            </div>
            <div className="text-xs text-slate-400">
              {overrideActive
                ? `Temporary grace active until ${new Date(bus.allowUnpaidUntil!).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Unpaid passengers on ${bus.busId} can scan & board.`
                : `Strict fee verification active — unpaid/expired passengers on ${bus.busId} cannot scan QR to board.`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => enableOverrideForDays(1)}
            className="btn-secondary text-xs py-1.5 px-3 border-amber-500/40 text-amber-300"
          >
            Allow Today
          </button>
          <button
            type="button"
            onClick={() => enableOverrideForDays(3)}
            className="btn-secondary text-xs py-1.5 px-3 border-amber-500/40 text-amber-300"
          >
            Allow 3 Days
          </button>
          {overrideActive && (
            <button
              type="button"
              onClick={() => onSetAllowUnpaidUntil(bus.busId, null)}
              className="btn-secondary text-xs py-1.5 px-3 text-red-300 border-red-500/40"
            >
              Disable Grace
            </button>
          )}
        </div>
      </div>

      {/* Map + Stops Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="dashboard-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <MapPin size={17} className="text-emerald-400" />
              <h3 className="panel-title">Single-Bus Route &amp; Live Tracking</h3>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-slate-800 h-80">
            <MapContainer center={mapCenter} zoom={14} scrollWheelZoom={true} className="h-full w-full">
              <TileLayer
                attribution="&copy; OpenStreetMap"
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {polyline.length >= 2 && (
                <Polyline positions={polyline} pathOptions={{ color: '#10b981', weight: 4 }} />
              )}
              {stops.map((stop, idx) => (
                <Marker
                  key={`${stop.order}-${idx}`}
                  position={[stop.lat, stop.lng]}
                  icon={stopMarkerIcon(idx + 1)}
                >
                  <Popup>
                    Stop #{idx + 1}: {stop.name}
                  </Popup>
                </Marker>
              ))}
              {location && (
                <Marker position={[location.lat, location.lng]} icon={busPinIcon}>
                  <Popup>
                    {bus.busId} • {(location.speed ?? 0).toFixed(0)} km/h • Boarded: {boardedCount}/{capacity}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Route size={17} className="text-emerald-400" />
              <h3 className="panel-title">
                Route Stops ({stops.length}){' '}
                {location?.tripDirection === 'to_home' ? '(Reversed: To Home)' : '(To Campus)'}
              </h3>
            </div>
          </div>
          {stops.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {stops.map((s, i) => (
                <div
                  key={`${s.order}-${i}`}
                  className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-slate-100">{s.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500">
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-8 text-center">
              No route stops configured yet. Click Edit on this bus to drop stops on the map.
            </div>
          )}
        </div>
      </div>

      {/* Assigned Passengers Roster + Manual Boarding */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Users size={17} className="text-emerald-400" />
            <h3 className="panel-title">
              Assigned Passengers ({busPassengers.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Admin-only passenger roster • Manual board available when trip is active
          </span>
        </div>

        <div className="table-responsive">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Passenger Name</th>
                <th>Login ID</th>
                <th>Phone</th>
                <th>Fee Status</th>
                <th>Valid Until</th>
                <th style={{ textAlign: 'right' }}>Active Trip Boarding</th>
              </tr>
            </thead>
            <tbody>
              {busPassengers.length > 0 ? (
                busPassengers.map((p) => {
                  const feeOk = isUserFeeValid(p);
                  const alreadyBoarded = boardedIdsInActiveTrip.has(p.loginId);
                  return (
                    <tr key={p.userId}>
                      <td className="font-semibold text-slate-100">{p.fullName}</td>
                      <td className="font-mono text-xs text-slate-300">{p.loginId}</td>
                      <td className="text-xs text-slate-400">{p.phone || '—'}</td>
                      <td>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            feeOk
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : overrideActive
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {feeOk ? 'Paid' : overrideActive ? 'Grace Approved' : 'Pending / Expired'}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-slate-400">
                        {p.feeValidUntil ? p.feeValidUntil.slice(0, 10) : 'No expiry'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!activeTrip ? (
                          <span className="text-xs text-slate-500">No active trip</span>
                        ) : alreadyBoarded ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                            <CheckCircle size={13} /> Boarded
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onManualBoardPassenger(bus.busId, activeTrip.id, p)}
                            className="btn-secondary text-[11px] py-1 px-2.5"
                          >
                            <UserCheck size={12} className="text-emerald-400" />
                            <span>Mark Boarded</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-xs text-slate-400">
                    No passengers assigned to {bus.busId}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bus Trip History */}
      <div className="dashboard-panel">
        <div className="panel-header">
          <div className="panel-title-group">
            <Clock size={17} className="text-emerald-400" />
            <h3 className="panel-title">Historical Trips &amp; Distance Covered ({busTrips.length})</h3>
          </div>
        </div>
        <div className="table-responsive">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Driver</th>
                <th>Start Time</th>
                <th>Stop Time</th>
                <th>Distance Covered</th>
                <th>Boarded</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {busTrips.length > 0 ? (
                busTrips.slice(0, 25).map((t) => {
                  const count = attendanceLogs.filter((l) => l.tripId === t.id).length;
                  return (
                    <tr key={t.id}>
                      <td className="font-semibold text-slate-200">
                        {t.tripDirection === 'to_home' ? 'To Home' : 'To Campus'}
                      </td>
                      <td className="text-xs text-slate-300">{t.driverId}</td>
                      <td className="text-xs text-slate-300">
                        {t.startedAt ? new Date(t.startedAt).toLocaleString() : '—'}
                      </td>
                      <td className="text-xs text-slate-300">
                        {t.endedAt ? new Date(t.endedAt).toLocaleString() : 'Active'}
                      </td>
                      <td className="font-mono text-xs text-emerald-300 font-bold">
                        {(t.distanceKm ?? 0).toFixed(2)} km
                      </td>
                      <td className="text-xs text-slate-200">{count}</td>
                      <td>
                        <span className="bus-pill">{t.status.toUpperCase()}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-xs text-slate-400">
                    No trip records for {bus.busId} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
