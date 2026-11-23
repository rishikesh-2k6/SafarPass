import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bus as BusIcon,
  Users,
  AlertTriangle,
  ShieldCheck,
  Download,
  Search,
  PlusCircle,
  RefreshCw,
  Radio,
  X,
  CheckCircle,
  Navigation,
} from 'lucide-react';
import './App.css';

const client = generateClient<Schema>();

type BusType = Schema['Bus']['type'];
type BusLocationType = Schema['BusLocation']['type'];
type TripType = Schema['Trip']['type'];
type AttendanceLogType = Schema['AttendanceLog']['type'];

const busMarkerIcon = new L.DivIcon({
  className: 'custom-bus-marker',
  html: `<div style="background-color: #10b981; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #0f172a; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.6);"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -22],
});

export default function App() {
  const [buses, setBuses] = useState<BusType[]>([]);
  const [busLocations, setBusLocations] = useState<BusLocationType[]>([]);
  const [trips, setTrips] = useState<TripType[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogType[]>([]);
  const [resolvedSosIds, setResolvedSosIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite'>('street');

  // Quick Bus Registration Modal State
  const [isAddBusModalOpen, setIsAddBusModalOpen] = useState(false);
  const [newBusId, setNewBusId] = useState('');
  const [newRouteName, setNewRouteName] = useState('');
  const [newCapacity, setNewCapacity] = useState('45');
  const [newQrSecret, setNewQrSecret] = useState('SECRET_KEY_BUS_02_2026');
  const [isSubmittingBus, setIsSubmittingBus] = useState(false);
  const [busSubmitSuccess, setBusSubmitSuccess] = useState('');

  // Real-time observeQuery subscriptions
  useEffect(() => {
    const subBus = client.models.Bus.observeQuery().subscribe({
      next: ({ items }) => setBuses([...items]),
      error: (err) => console.error('Bus observeQuery error', err),
    });

    const subBusLoc = client.models.BusLocation.observeQuery().subscribe({
      next: ({ items }) => setBusLocations([...items]),
      error: (err) => console.error('BusLocation observeQuery error', err),
    });

    const subTrip = client.models.Trip.observeQuery().subscribe({
      next: ({ items }) => setTrips([...items]),
      error: (err) => console.error('Trip observeQuery error', err),
    });

    const subAttendance = client.models.AttendanceLog.observeQuery().subscribe({
      next: ({ items }) => setAttendanceLogs([...items]),
      error: (err) => console.error('AttendanceLog observeQuery error', err),
    });

    return () => {
      subBus.unsubscribe();
      subBusLoc.unsubscribe();
      subTrip.unsubscribe();
      subAttendance.unsubscribe();
    };
  }, []);

  // Emergency SOS list
  const activeSosTrips = useMemo(() => {
    return trips.filter(
      (trip) => trip.status === 'sos' && !resolvedSosIds.includes(trip.id)
    );
  }, [trips, resolvedSosIds]);

  const handleResolveSos = async (tripId: string) => {
    try {
      await client.models.Trip.update({
        id: tripId,
        status: 'active',
      });
    } catch (err) {
      console.warn('Could not update trip in DynamoDB:', err);
    }
    setResolvedSosIds((prev) => [...prev, tripId]);
  };

  // KPI Calculations
  const totalActiveBuses = useMemo(() => {
    const activeFromTrips = new Set(
      trips.filter((t) => t.status === 'active' || t.status === 'sos').map((t) => t.busId)
    );
    if (activeFromTrips.size > 0) return activeFromTrips.size;
    return busLocations.length > 0 ? busLocations.length : 1;
  }, [trips, busLocations]);

  const totalStudentsBoardedToday = useMemo(() => {
    if (attendanceLogs.length > 0) return attendanceLogs.length;
    return busLocations.reduce((sum, b) => sum + (b.boardedCount ?? 0), 0);
  }, [attendanceLogs, busLocations]);

  const activeSosCount = activeSosTrips.length;

  const fleetOccupancyPct = useMemo(() => {
    const totalCapacity =
      buses.reduce((acc, b) => acc + (b.capacity ?? 45), 0) ||
      (buses.length > 0 ? buses.length * 45 : 45);
    const totalBoarded = busLocations.reduce(
      (acc, b) => acc + (b.boardedCount ?? 0),
      0
    );
    return Math.min(100, Math.round((totalBoarded / totalCapacity) * 100));
  }, [buses, busLocations]);

  // Display map locations fallback to default if none yet
  const displayLocations = useMemo(() => {
    if (busLocations.length > 0) return busLocations;
    return [
      {
        busId: 'BUS_01',
        tripId: 'TRIP_ACTIVE',
        lat: 16.4632,
        lng: 80.5064,
        speed: 25.0,
        heading: 90.0,
        boardedCount: 0,
      } as BusLocationType,
    ];
  }, [busLocations]);

  // Filtered Attendance Logs for Ledger
  const filteredAttendanceLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return attendanceLogs;
    return attendanceLogs.filter(
      (log) =>
        (log.studentName && log.studentName.toLowerCase().includes(q)) ||
        (log.studentId && log.studentId.toLowerCase().includes(q)) ||
        (log.busId && log.busId.toLowerCase().includes(q)) ||
        (log.tripId && log.tripId.toLowerCase().includes(q))
    );
  }, [attendanceLogs, searchQuery]);

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'Student Name',
      'Student ID',
      'Bus ID',
      'Trip ID',
      'Scanned At',
      'Latitude',
      'Longitude',
    ];
    const rows = filteredAttendanceLogs.map((log) => [
      `"${log.studentName || ''}"`,
      `"${log.studentId || ''}"`,
      `"${log.busId || ''}"`,
      `"${log.tripId || ''}"`,
      `"${log.scannedAt || ''}"`,
      log.scanLat ?? '',
      log.scanLng ?? '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'vahansync_attendance.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Bus Registration Submit
  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBusId || !newRouteName) return;

    setIsSubmittingBus(true);
    try {
      await client.models.Bus.create({
        busId: newBusId.trim(),
        routeName: newRouteName.trim(),
        capacity: parseInt(newCapacity, 10) || 45,
        qrSecret: newQrSecret.trim() || 'SECRET_KEY_BUS_02_2026',
      });

      // Also create initial BusLocation entry so it appears on map
      try {
        await client.models.BusLocation.create({
          busId: newBusId.trim(),
          tripId: `TRIP_${Date.now()}`,
          lat: 16.4632 + (Math.random() - 0.5) * 0.008,
          lng: 80.5064 + (Math.random() - 0.5) * 0.008,
          speed: 0,
          heading: 0,
          boardedCount: 0,
        });
      } catch (locErr) {
        console.warn('Initial location registration note:', locErr);
      }

      setBusSubmitSuccess(`Bus ${newBusId.trim()} successfully registered!`);
      setTimeout(() => {
        setBusSubmitSuccess('');
        setIsAddBusModalOpen(false);
        setNewBusId('');
        setNewRouteName('');
        setNewCapacity('45');
      }, 1200);
    } catch (err) {
      console.error('Failed to create bus:', err);
    } finally {
      setIsSubmittingBus(false);
    }
  };

  return (
    <div className="portal-container">
      {/* Emergency SOS Banner */}
      {activeSosTrips.length > 0 && (
        <div className="sos-banner">
          <div className="sos-banner-left">
            <AlertTriangle className="sos-pulse-icon" size={24} />
            <div>
              <span className="sos-headline">EMERGENCY SOS ACTIVE</span>
              <div className="sos-subline">
                {activeSosTrips.map((trip) => (
                  <span key={trip.id} className="sos-bus-badge">
                    Bus: <strong>{trip.busId}</strong> (Driver: {trip.driverId})
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            className="sos-resolve-btn"
            onClick={() => activeSosTrips.forEach((t) => handleResolveSos(t.id))}
          >
            Resolve / Dismiss Alert
          </button>
        </div>
      )}

      {/* Header */}
      <header className="portal-header">
        <div className="header-brand">
          <div className="brand-icon-box">
            <BusIcon size={26} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="brand-title">VahanSync Fleet Console</h1>
            <p className="brand-subtitle">
              Campus Transit Operations & Live Telemetry
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="live-sync-indicator">
            <Radio size={14} className="text-emerald-400 animate-pulse" />
            <span>AppSync Real-Time Active</span>
          </div>
          <button
            className="btn-primary"
            onClick={() => setIsAddBusModalOpen(true)}
          >
            <PlusCircle size={18} />
            <span>Register Bus</span>
          </button>
        </div>
      </header>

      {/* KPI Summary Cards */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Buses</span>
            <div className="kpi-icon-box bg-emerald-500/10 text-emerald-400">
              <BusIcon size={20} />
            </div>
          </div>
          <div className="kpi-value text-emerald-400">{totalActiveBuses}</div>
          <div className="kpi-sub">Campus Route Coverage</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Boarded Today</span>
            <div className="kpi-icon-box bg-blue-500/10 text-blue-400">
              <Users size={20} />
            </div>
          </div>
          <div className="kpi-value text-blue-400">{totalStudentsBoardedToday}</div>
          <div className="kpi-sub">Verified via QR Telemetry</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active SOS Alerts</span>
            <div
              className={`kpi-icon-box ${
                activeSosCount > 0
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'bg-slate-700/50 text-slate-400'
              }`}
            >
              <AlertTriangle size={20} />
            </div>
          </div>
          <div
            className={`kpi-value ${
              activeSosCount > 0 ? 'text-red-400' : 'text-slate-200'
            }`}
          >
            {activeSosCount}
          </div>
          <div className="kpi-sub">
            {activeSosCount > 0 ? 'Urgent attention required' : 'All fleets normal'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Fleet Occupancy</span>
            <div className="kpi-icon-box bg-purple-500/10 text-purple-400">
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="kpi-value text-purple-400">{fleetOccupancyPct}%</div>
          <div className="kpi-sub">Capacity Utilization</div>
        </div>
      </section>

      {/* Main Grid: Map & Attendance Ledger */}
      <main className="dashboard-grid">
        {/* Live Fleet Map */}
        <section className="dashboard-panel map-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Navigation size={18} className="text-emerald-400" />
              <h2 className="panel-title">Live Fleet Map</h2>
            </div>
            <div className="map-layer-switcher">
              <button
                type="button"
                className={`layer-switch-btn ${mapLayer === 'street' ? 'active' : ''}`}
                onClick={() => setMapLayer('street')}
              >
                Street
              </button>
              <button
                type="button"
                className={`layer-switch-btn ${mapLayer === 'satellite' ? 'active' : ''}`}
                onClick={() => setMapLayer('satellite')}
              >
                Satellite
              </button>
            </div>
          </div>
          <div className="map-container-wrapper">
            <MapContainer
              center={[16.4632, 80.5064]}
              zoom={15}
              scrollWheelZoom={true}
              className="leaflet-map"
            >
              {mapLayer === 'street' ? (
                <TileLayer
                  key="street"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              ) : (
                <TileLayer
                  key="satellite"
                  attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              )}
              {displayLocations.map((bus) => (
                <Marker
                  key={bus.busId}
                  position={[bus.lat || 16.4632, bus.lng || 80.5064]}
                  icon={busMarkerIcon}
                >
                  <Popup className="custom-popup">
                    <div className="popup-card">
                      <div className="popup-header">
                        <span className="popup-bus-id">{bus.busId}</span>
                        <span className="popup-status">LIVE</span>
                      </div>
                      <div className="popup-body">
                        <div>
                          Speed: <strong>{bus.speed ?? 0} km/h</strong>
                        </div>
                        <div>
                          Boarded: <strong>{bus.boardedCount ?? 0} students</strong>
                        </div>
                        <div>
                          Trip: <code>{bus.tripId || 'Active'}</code>
                        </div>
                      </div>
                      <div className="popup-actions">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${bus.lat || 16.4632},${bus.lng || 80.5064}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="google-maps-link"
                        >
                          Open in Google Maps ↗
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </section>

        {/* Live Attendance Ledger */}
        <section className="dashboard-panel ledger-panel">
          <div className="panel-header">
            <div className="panel-title-group">
              <Users size={18} className="text-emerald-400" />
              <h2 className="panel-title">Live Attendance Ledger</h2>
            </div>
            <div className="ledger-controls">
              <div className="search-box">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search student, ID, bus..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
              <button
                className="btn-secondary"
                onClick={handleExportCsv}
                title="Download CSV"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Student ID</th>
                  <th>Bus ID</th>
                  <th>Scanned At</th>
                  <th>GPS Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendanceLogs.length > 0 ? (
                  filteredAttendanceLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="font-semibold text-slate-100">
                        {log.studentName || 'Student'}
                      </td>
                      <td className="text-slate-400 font-mono text-xs">
                        {log.studentId}
                      </td>
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
                          : 'Campus Stop'}
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
        </section>
      </main>

      {/* Quick Bus Registration Modal */}
      {isAddBusModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Register New Fleet Bus</h3>
              <button
                className="modal-close-btn"
                onClick={() => setIsAddBusModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            {busSubmitSuccess ? (
              <div className="modal-success-box">
                <CheckCircle size={32} className="text-emerald-400 mb-2" />
                <p>{busSubmitSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleAddBus} className="modal-form">
                <div className="form-group">
                  <label>Bus ID (Identifier)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BUS_02"
                    value={newBusId}
                    onChange={(e) => setNewBusId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Route Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. South Campus Route 2"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Passenger Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>QR Secret Key (HMAC-SHA256)</label>
                  <input
                    type="text"
                    required
                    value={newQrSecret}
                    onChange={(e) => setNewQrSecret(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsAddBusModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={isSubmittingBus}
                  >
                    {isSubmittingBus ? 'Registering...' : 'Register Bus'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
