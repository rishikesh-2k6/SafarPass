import { useState, useMemo, type FC } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { toLocalDateKey } from '../utils/routeUtils';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  Search,
  Download,
  RefreshCw,
  Clock,
  Route,
} from 'lucide-react';

type TripType = Schema['Trip']['type'];
type AttendanceLogType = Schema['AttendanceLog']['type'];

interface OperationsCalendarPanelProps {
  trips: TripType[];
  attendanceLogs: AttendanceLogType[];
  selectedBusFilter: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExportCsv: () => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const OperationsCalendarPanel: FC<OperationsCalendarPanelProps> = ({
  trips,
  attendanceLogs,
  selectedBusFilter,
  searchQuery,
  onSearchChange,
  onExportCsv,
}) => {
  const [viewMode, setViewMode] = useState<'calendar' | 'live'>('calendar');
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => toLocalDateKey());

  const filteredTripsAll = useMemo(() => {
    if (selectedBusFilter === 'all') return trips;
    return trips.filter((t) => t.busId === selectedBusFilter);
  }, [trips, selectedBusFilter]);

  const tripDatesSet = useMemo(() => {
    const s = new Set<string>();
    filteredTripsAll.forEach((t) => {
      const k = toLocalDateKey(t.startedAt ?? t.endedAt);
      if (k) s.add(k);
    });
    return s;
  }, [filteredTripsAll]);

  const calendarDays = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateKey: string | null }> = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ day: null, dateKey: null });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateKey: key });
    }
    return cells;
  }, [monthCursor]);

  const tripsOnDate = useMemo(
    () =>
      filteredTripsAll
        .filter((t) => toLocalDateKey(t.startedAt ?? t.endedAt) === selectedDateKey)
        .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '')),
    [filteredTripsAll, selectedDateKey],
  );

  const logsOnDate = useMemo(() => {
    const tripIds = new Set(tripsOnDate.map((t) => t.id));
    return attendanceLogs.filter((l) => {
      if (selectedBusFilter !== 'all' && l.busId !== selectedBusFilter) return false;
      return tripIds.has(l.tripId) || toLocalDateKey(l.scannedAt) === selectedDateKey;
    });
  }, [attendanceLogs, tripsOnDate, selectedBusFilter, selectedDateKey]);

  const filteredLiveLogs = useMemo(() => {
    const scoped =
      selectedBusFilter === 'all'
        ? attendanceLogs
        : attendanceLogs.filter((l) => l.busId === selectedBusFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (log) =>
        (log.studentName && log.studentName.toLowerCase().includes(q)) ||
        (log.studentId && log.studentId.toLowerCase().includes(q)) ||
        (log.busId && log.busId.toLowerCase().includes(q)),
    );
  }, [attendanceLogs, selectedBusFilter, searchQuery]);

  const shiftMonth = (delta: number) => {
    setMonthCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  };

  return (
    <section className="dashboard-panel ledger-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          {viewMode === 'calendar' ? (
            <Calendar size={18} className="text-emerald-400" />
          ) : (
            <Users size={18} className="text-emerald-400" />
          )}
          <h2 className="panel-title">
            {viewMode === 'calendar' ? 'Trip Calendar & Summary' : 'Live Attendance Ledger'}
          </h2>
        </div>

        <div className="map-layer-switcher">
          <button
            type="button"
            className={`layer-switch-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`layer-switch-btn ${viewMode === 'live' ? 'active' : ''}`}
            onClick={() => setViewMode('live')}
          >
            Live Attendance
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <div className="space-y-4">
          {/* Movable Month Header */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                title="Previous Month"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-sm font-bold text-slate-100">
                {MONTH_NAMES[monthCursor.getMonth()]} {monthCursor.getFullYear()}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white"
                title="Next Month"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 mb-1.5">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, idx) => {
                if (!cell.day || !cell.dateKey) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }
                const isSelected = cell.dateKey === selectedDateKey;
                const hasTrip = tripDatesSet.has(cell.dateKey);
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(cell.dateKey!)}
                    className={`h-8 rounded-lg text-xs font-semibold relative flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 font-extrabold'
                        : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{cell.day}</span>
                    {hasTrip && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                          isSelected ? 'bg-slate-950' : 'bg-emerald-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Summary */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-200">
                Summary for {selectedDateKey}
                {selectedBusFilter !== 'all' ? ` • ${selectedBusFilter}` : ''}
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                  {tripsOnDate.length} {tripsOnDate.length === 1 ? 'Trip' : 'Trips'}
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bold">
                  {logsOnDate.length} Passengers Served
                </span>
              </div>
            </div>

            {tripsOnDate.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {tripsOnDate.map((t, idx) => {
                  const startLabel = t.startedAt
                    ? new Date(t.startedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                  const endLabel = t.endedAt
                    ? new Date(t.endedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : t.status === 'active' || t.status === 'sos'
                    ? 'Active'
                    : '—';
                  const tripPassengerCount = logsOnDate.filter(
                    (l) => l.tripId === t.id,
                  ).length;

                  return (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100">
                          {t.busId} • Trip {idx + 1} (
                          {t.tripDirection === 'to_home' ? 'To Home' : 'To Campus'})
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400">
                          {tripPassengerCount} boarded
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {startLabel} – {endLabel}
                        </span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <Route size={12} className="text-emerald-400" />
                          {(t.distanceKm ?? 0).toFixed(2)} km
                        </span>
                        <span>Driver: {t.driverId}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-5 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                No bus trips or passenger boarding records on {selectedDateKey}.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="ledger-controls">
            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search passenger, ID, bus..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="search-input"
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={onExportCsv}
              title="Download CSV"
            >
              <Download size={16} />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Passenger Name</th>
                  <th>Login ID</th>
                  <th>Bus ID</th>
                  <th>Scanned At</th>
                  <th>GPS Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {filteredLiveLogs.length > 0 ? (
                  filteredLiveLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="font-semibold text-slate-100">
                        <span>{log.studentName || 'Passenger'}</span>
                        {log.unpaidOverride && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            Grace
                          </span>
                        )}
                      </td>
                      <td className="text-slate-400 font-mono text-xs">{log.studentId}</td>
                      <td>
                        <span className="bus-pill">{log.busId}</span>
                      </td>
                      <td className="text-slate-300 text-xs">
                        {log.scannedAt
                          ? new Date(log.scannedAt).toLocaleTimeString()
                          : 'Just now'}
                      </td>
                      <td className="text-slate-400 font-mono text-xs">
                        {log.scanLat != null && log.scanLng != null
                          ? `${log.scanLat.toFixed(4)}, ${log.scanLng.toFixed(4)}`
                          : 'Manual / Stop'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-row">
                      <div className="empty-state">
                        <RefreshCw size={24} className="text-slate-500 animate-spin" />
                        <span>Awaiting scan entries or no matching records found</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
