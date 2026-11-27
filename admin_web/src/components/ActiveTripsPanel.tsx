import type { FC } from 'react';
import type { Schema } from '../../amplify/data/resource';
import { Radio, Square, Navigation, Clock, User, MapPin } from 'lucide-react';

type TripType = Schema['Trip']['type'];
type BusLocationType = Schema['BusLocation']['type'];
type BusType = Schema['Bus']['type'];

interface ActiveTripsPanelProps {
  trips: TripType[];
  busLocations: BusLocationType[];
  buses: BusType[];
  onForceEndTrip: (tripId: string, busId: string) => Promise<void>;
  onUpdateDestination: (
    tripId: string,
    busId: string,
    destination: string,
  ) => Promise<void>;
}

export const ActiveTripsPanel: FC<ActiveTripsPanelProps> = ({
  trips,
  busLocations,
  buses,
  onForceEndTrip,
  onUpdateDestination,
}) => {
  const activeTrips = trips.filter(
    (t) => t.status === 'active' || t.status === 'sos',
  );

  if (activeTrips.length === 0) {
    return (
      <div className="active-trips-banner-empty">
        <div className="empty-indicator">
          <span className="idle-dot" />
          <span>
            No active bus trips currently broadcasting. Drivers start trips via the
            VahanSync Mobile App.
          </span>
        </div>
      </div>
    );
  }

  return (
    <section className="active-trips-section">
      <div className="section-header-compact">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-emerald-400 animate-pulse" />
          <h3 className="section-title-compact">
            Active Trips on Road ({activeTrips.length})
          </h3>
        </div>
        <span className="text-xs text-slate-400">
          Real-time GPS telemetry broadcasting to campus
        </span>
      </div>

      <div className="active-trips-grid">
        {activeTrips.map((trip) => {
          const matchingBus = buses.find((b) => b.busId === trip.busId);
          const location = busLocations.find((l) => l.busId === trip.busId);
          const isSos = trip.status === 'sos';
          const currentDestination =
            trip.destination ||
            location?.destination ||
            matchingBus?.destination ||
            'Not set';

          return (
            <div
              key={trip.id}
              className={`active-trip-card ${isSos ? 'card-sos-border' : ''}`}
            >
              <div className="trip-card-header">
                <div className="trip-bus-tag">
                  <span className="font-bold text-slate-100">{trip.busId}</span>
                  <span
                    className={`status-pill ${
                      isSos ? 'status-pill-sos' : 'status-pill-active'
                    }`}
                  >
                    {isSos ? 'SOS ALERT' : 'ON ROAD'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-secondary text-[11px] py-1 px-2"
                    title="Set or change destination for this trip"
                    onClick={() => {
                      const next = window.prompt(
                        `Enter destination for ${trip.busId}:`,
                        currentDestination === 'Not set' ? '' : currentDestination,
                      );
                      if (next !== null && next.trim().length > 0) {
                        onUpdateDestination(trip.id, trip.busId, next.trim());
                      }
                    }}
                  >
                    <MapPin size={12} className="text-emerald-400" />
                    <span>Set Dest</span>
                  </button>
                  <button
                    type="button"
                    className="btn-force-end"
                    title="Force stop this trip from admin console"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Are you sure you want to force end the active trip for ${trip.busId}?`,
                        )
                      ) {
                        onForceEndTrip(trip.id, trip.busId);
                      }
                    }}
                  >
                    <Square size={13} fill="currentColor" />
                    <span>Force End Trip</span>
                  </button>
                </div>
              </div>

              <div className="trip-card-route text-slate-300">
                {matchingBus?.routeName || 'Campus Transit Route'}
              </div>

              <div className="trip-card-meta">
                <div className="meta-item">
                  <MapPin size={13} className="text-emerald-400" />
                  <span>
                    Dest:{' '}
                    <strong className="text-emerald-300">
                      {currentDestination}
                    </strong>
                  </span>
                </div>
                <div className="meta-item">
                  <User size={13} className="text-slate-400" />
                  <span>
                    Driver:{' '}
                    <strong className="text-slate-200">{trip.driverId}</strong>
                  </span>
                </div>
                <div className="meta-item">
                  <Clock size={13} className="text-slate-400" />
                  <span>
                    Started:{' '}
                    {trip.startedAt
                      ? new Date(trip.startedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Recently'}
                  </span>
                </div>
                {location && (
                  <div className="meta-item">
                    <Navigation size={13} className="text-emerald-400" />
                    <span>
                      Speed:{' '}
                      <strong className="text-emerald-400">
                        {(location.speed ?? 0).toFixed(1)} km/h
                      </strong>{' '}
                      • {location.boardedCount ?? 0} on board
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
