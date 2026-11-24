import { useState, useEffect, useMemo } from 'react';
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
  RefreshCw,
  Radio,
  CheckCircle,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { ActiveTripsPanel } from './components/ActiveTripsPanel';
import { BusesManager } from './components/BusesManager';
import { UsersManager } from './components/UsersManager';
import './App.css';

const client = generateClient<Schema>();

type BusType = Schema['Bus']['type'];
type BusLocationType = Schema['BusLocation']['type'];
type TripType = Schema['Trip']['type'];
type AttendanceLogType = Schema['AttendanceLog']['type'];
type UserProfileType = Schema['UserProfile']['type'];

const busMarkerIcon = new L.DivIcon({
  className: 'custom-bus-marker',
  html: `<div style="background-color: #10b981; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid #0f172a; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.6);"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg></div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -22],
});

export default function App() {
  const [activeTab, setActiveTab] = useState<'operations' | 'buses' | 'users'>('operations');

  // Real-time DynamoDB entities
  const [buses, setBuses] = useState<BusType[]>([]);
  const [busLocations, setBusLocations] = useState<BusLocationType[]>([]);
  const [trips, setTrips] = useState<TripType[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLogType[]>([]);
  const [users, setUsers] = useState<UserProfileType[]>([]);

  const [resolvedSosIds, setResolvedSosIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite'>('street');
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setGlobalToast(msg);
    setTimeout(() => setGlobalToast(null), 3500);
  };

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

    const subUsers = client.models.UserProfile.observeQuery().subscribe({
      next: ({ items }) => setUsers([...items]),
      error: (err) => console.error('UserProfile observeQuery error', err),
    });

    return () => {
      subBus.unsubscribe();
      subBusLoc.unsubscribe();
      subTrip.unsubscribe();
      subAttendance.unsubscribe();
      subUsers.unsubscribe();
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
      showToast('SOS Alert marked as resolved');
    } catch (err) {
      console.warn('Could not update trip in DynamoDB:', err);
    }
    setResolvedSosIds((prev) => [...prev, tripId]);
  };

  // Force End Trip Action
  const handleForceEndTrip = async (tripId: string, busId: string) => {
    try {
      await client.models.Trip.update({
        id: tripId,
        status: 'completed',
      });
      showToast(`Trip for ${busId} has been forcibly ended.`);
    } catch (err) {
      console.error('Failed to end trip:', err);
      alert('Failed to end trip in DynamoDB.');
    }
  };

  // Bus Management CRUD Actions
  const handleAddBus = async (busData: {
    busId: string;
    routeName: string;
    capacity: number;
    qrSecret: string;
  }) => {
    await client.models.Bus.create({
      busId: busData.busId,
      routeName: busData.routeName,
      capacity: busData.capacity,
      qrSecret: busData.qrSecret,
    });
  };

  const handleUpdateBus = async (busData: {
    busId: string;
    routeName: string;
    capacity: number;
  }) => {
    await client.models.Bus.update({
      busId: busData.busId,
      routeName: busData.routeName,
      capacity: busData.capacity,
    });
  };

  const handleRotateSecret = async (busId: string): Promise<string> => {
    const rand = Math.random().toString(36).substring(2, 9).toUpperCase();
    const newSecret = `SECRET_KEY_${busId}_${rand}_${Date.now()}`;
    await client.models.Bus.update({
      busId,
      qrSecret: newSecret,
    });
    return newSecret;
  };

  const handleDeleteBus = async (busId: string) => {
    await client.models.Bus.delete({ busId });
  };

  // User Management CRUD Actions
  const handleAddUser = async (userData: {
    loginId: string;
    pin: string;
    fullName: string;
    role: string;
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
  }) => {
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await client.models.UserProfile.create({
      userId,
      loginId: userData.loginId,
      pin: userData.pin,
      fullName: userData.fullName,
      role: userData.role,
      assignedBusId: userData.assignedBusId,
      parentOfStudentId: userData.parentOfStudentId,
      feePaid: userData.feePaid ?? true,
    });
  };

  const handleUpdateUser = async (userData: {
    userId: string;
    loginId: string;
    pin: string;
    fullName: string;
    role: string;
    assignedBusId?: string;
    parentOfStudentId?: string;
    feePaid?: boolean;
  }) => {
    await client.models.UserProfile.update({
      userId: userData.userId,
      loginId: userData.loginId,
      pin: userData.pin,
      fullName: userData.fullName,
      role: userData.role,
      assignedBusId: userData.assignedBusId,
      parentOfStudentId: userData.parentOfStudentId,
      feePaid: userData.feePaid ?? true,
    });
  };

  const handleToggleFeePaid = async (userId: string, currentStatus: boolean) => {
    try {
      await client.models.UserProfile.update({
        userId,
        feePaid: !currentStatus,
      });
      showToast(`Transit fee status updated to ${!currentStatus ? 'Paid' : 'Unpaid'}`);
    } catch (err) {
      console.error('Failed to toggle fee status:', err);
      alert('Could not update fee status.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    await client.models.UserProfile.delete({ userId });
  };

  // Seed Sample Campus Data
  const handleSeedSampleData = async () => {
    // 1. Ensure BUS_01 exists
    const hasBus01 = buses.some((b) => b.busId === 'BUS_01');
    if (!hasBus01) {
      await client.models.Bus.create({
        busId: 'BUS_01',
        routeName: 'Central Campus Express',
        capacity: 45,
        qrSecret: 'SECRET_KEY_BUS_01_2026',
      });
    }

    // 2. Sample Users: 1 Driver, 2 Students, 1 Parent
    const sampleUsers = [
      {
        loginId: 'driver_01',
        pin: '1234',
        fullName: 'Rajesh Sharma',
        role: 'driver',
        assignedBusId: 'BUS_01',
        feePaid: true,
      },
      {
        loginId: 'student_01',
        pin: '1234',
        fullName: 'Aarav Patel',
        role: 'student',
        assignedBusId: 'BUS_01',
        feePaid: true,
      },
      {
        loginId: 'student_02',
        pin: '1234',
        fullName: 'Sneha Reddy',
        role: 'student',
        assignedBusId: 'BUS_01',
        feePaid: false,
      },
      {
        loginId: '9876543210',
        pin: '1234',
        fullName: 'Vikram Patel',
        role: 'parent',
        assignedBusId: 'BUS_01',
        parentOfStudentId: 'student_01',
        feePaid: true,
      },
    ];

    for (const u of sampleUsers) {
      const exists = users.some((existing) => existing.loginId === u.loginId);
      if (!exists) {
        await client.models.UserProfile.create({
          userId: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ...u,
        });
      }
    }
  };

  // KPI Calculations
  const totalActiveBuses = useMemo(() => {
    const activeFromTrips = new Set(
      trips
        .filter((t) => t.status === 'active' || t.status === 'sos')
        .map((t) => t.busId)
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
    const totalCap = buses.reduce((acc, b) => acc + (b.capacity || 45), 0) || 45;
    const pct = Math.round((totalStudentsBoardedToday / totalCap) * 100);
    return Math.min(pct, 100);
  }, [buses, totalStudentsBoardedToday]);

  // Fallback demo map location if no GPS received yet
  const displayLocations = useMemo(() => {
    if (busLocations.length > 0) return busLocations;
    return [
      {
        busId: 'BUS_01',
        tripId: 'TRIP_DEMO_CAMPUS',
        lat: 16.4632,
        lng: 80.5064,
        speed: 28,
        heading: 90,
        boardedCount: totalStudentsBoardedToday || 12,
      } as BusLocationType,
    ];
  }, [busLocations, totalStudentsBoardedToday]);

  // Filtered attendance records
  const filteredAttendanceLogs = useMemo(() => {
    if (!searchQuery.trim()) return attendanceLogs;
    const q = searchQuery.toLowerCase();
    return attendanceLogs.filter(
      (log) =>
        (log.studentName && log.studentName.toLowerCase().includes(q)) ||
        (log.studentId && log.studentId.toLowerCase().includes(q)) ||
        (log.busId && log.busId.toLowerCase().includes(q))
    );
  }, [attendanceLogs, searchQuery]);

  // Export CSV Handler
  const handleExportCsv = () => {
    if (attendanceLogs.length === 0) {
      alert('No attendance data available to export.');
      return;
    }
    const headers = ['Log ID', 'Trip ID', 'Bus ID', 'Student ID', 'Student Name', 'Scanned At', 'Latitude', 'Longitude'];
    const rows = attendanceLogs.map((log) => [
      log.id,
      log.tripId,
      log.busId,
      log.studentId,
      `"${log.studentName || ''}"`,
      log.scannedAt || '',
      log.scanLat ?? '',
      log.scanLng ?? '',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `VahanSync_Attendance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="portal-container">
      {/* Global Toast */}
      {globalToast && (
        <div className="floating-toast">
          <CheckCircle size={18} className="text-emerald-400" />
          <span>{globalToast}</span>
        </div>
      )}

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

      {/* Portal Header */}
      <header className="portal-header">
        <div className="header-brand">
          <div className="brand-icon-box">
            <BusIcon size={26} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="brand-title">VahanSync Fleet Console</h1>
            <p className="brand-subtitle">
              Campus Transit Operations, Fleet & User Governance
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="live-sync-indicator">
            <Radio size={14} className="text-emerald-400 animate-pulse" />
            <span>AppSync Real-Time Active</span>
          </div>

          {users.length === 0 && (
            <button
              type="button"
              className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3"
              onClick={handleSeedSampleData}
              title="Preload sample bus, driver, and student records"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span>Seed Demo Data</span>
            </button>
          )}
        </div>
      </header>

      {/* Top Navigation Tabs */}
      <nav className="portal-tabs">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'operations' ? 'active' : ''}`}
          onClick={() => setActiveTab('operations')}
        >
          <Radio size={16} className={activeTab === 'operations' ? 'text-emerald-400' : ''} />
          <span>Live Operations</span>
          {activeSosCount > 0 && (
            <span className="tab-alert-badge">{activeSosCount} SOS</span>
          )}
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'buses' ? 'active' : ''}`}
          onClick={() => setActiveTab('buses')}
        >
          <BusIcon size={16} className={activeTab === 'buses' ? 'text-emerald-400' : ''} />
          <span>Manage Buses</span>
          <span className="tab-count-badge">{buses.length}</span>
        </button>

        <button
          type="button"
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} className={activeTab === 'users' ? 'text-emerald-400' : ''} />
          <span>Students & Staff</span>
          <span className="tab-count-badge">{users.length}</span>
        </button>
      </nav>

      {/* VIEW 1: Live Operations */}
      {activeTab === 'operations' && (
        <div className="tab-content-view">
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

          {/* Active Trips on Road with Force End Trip Button */}
          <ActiveTripsPanel
            trips={trips}
            busLocations={busLocations}
            buses={buses}
            onForceEndTrip={handleForceEndTrip}
          />

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
                    type="button"
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
        </div>
      )}

      {/* VIEW 2: Manage Buses */}
      {activeTab === 'buses' && (
        <BusesManager
          buses={buses}
          trips={trips}
          busLocations={busLocations}
          onAddBus={handleAddBus}
          onUpdateBus={handleUpdateBus}
          onRotateSecret={handleRotateSecret}
          onDeleteBus={handleDeleteBus}
        />
      )}

      {/* VIEW 3: Students & Staff */}
      {activeTab === 'users' && (
        <UsersManager
          users={users}
          buses={buses}
          onAddUser={handleAddUser}
          onUpdateUser={handleUpdateUser}
          onToggleFeePaid={handleToggleFeePaid}
          onDeleteUser={handleDeleteUser}
          onSeedSampleData={handleSeedSampleData}
        />
      )}
    </div>
  );
}
