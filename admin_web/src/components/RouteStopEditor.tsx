import { useState, useEffect, type FC } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Search,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MapPin,
  Route,
  Loader2,
} from 'lucide-react';
import {
  type RouteStop,
  type PlaceSuggestion,
  searchNominatimPlaces,
  reverseGeocodeStop,
  fetchOsrmRoadPolyline,
  fallbackStraightPolyline,
} from '../utils/routeUtils';

interface RouteStopEditorProps {
  stops: RouteStop[];
  polyline: Array<[number, number]>;
  onChange: (stops: RouteStop[], polyline: Array<[number, number]>) => void;
}

function makeNumberedStopIcon(order: number, isStart: boolean, isEnd: boolean) {
  const bg = isStart ? '#059669' : isEnd ? '#dc2626' : '#2563eb';
  return new L.DivIcon({
    className: 'stop-pin-marker',
    html: `<div style="background:${bg};color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.45);">${order}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const MapClickHandler: FC<{ onDropPin: (lat: number, lng: number) => void }> = ({
  onDropPin,
}) => {
  useMapEvents({
    click(e) {
      onDropPin(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const MapRecenterHelper: FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [center, map]);
  return null;
};

export const RouteStopEditor: FC<RouteStopEditorProps> = ({
  stops,
  polyline,
  onChange,
}) => {
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(
    stops[0] ? [stops[0].lat, stops[0].lng] : null,
  );

  const reindexAndSync = async (
    nextStops: RouteStop[],
    autoRoute: boolean,
  ) => {
    const normalized = nextStops.map((s, idx) => ({ ...s, order: idx + 1 }));
    if (normalized.length < 2) {
      onChange(normalized, fallbackStraightPolyline(normalized));
      return;
    }
    if (!autoRoute) {
      onChange(normalized, fallbackStraightPolyline(normalized));
      return;
    }
    setIsRouting(true);
    try {
      const roadLine = await fetchOsrmRoadPolyline(normalized);
      onChange(normalized, roadLine);
    } finally {
      setIsRouting(false);
    }
  };

  const handleSearch = async () => {
    if (searchText.trim().length < 2) return;
    setIsSearching(true);
    try {
      const found = await searchNominatimPlaces(searchText);
      setSuggestions(found);
    } catch {
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddStop = async (name: string, lat: number, lng: number) => {
    const next: RouteStop[] = [
      ...stops,
      { order: stops.length + 1, name, lat, lng },
    ];
    setFocusPoint([lat, lng]);
    setSuggestions([]);
    setSearchText('');
    await reindexAndSync(next, next.length >= 2);
  };

  const handleMapDropPin = async (lat: number, lng: number) => {
    const fallbackName = `Stop ${stops.length + 1} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    const optimisticStops: RouteStop[] = [
      ...stops,
      { order: stops.length + 1, name: fallbackName, lat, lng },
    ];
    setFocusPoint([lat, lng]);
    await reindexAndSync(optimisticStops, optimisticStops.length >= 2);

    const resolvedName = await reverseGeocodeStop(lat, lng);
    if (resolvedName) {
      const updated = optimisticStops.map((s, idx) =>
        idx === optimisticStops.length - 1 ? { ...s, name: resolvedName } : s,
      );
      onChange(
        updated,
        polyline.length >= 2 ? polyline : fallbackStraightPolyline(updated),
      );
    }
  };

  const handleMoveStop = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    const copy = [...stops];
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item);
    await reindexAndSync(copy, copy.length >= 2);
  };

  const handleRemoveStop = async (index: number) => {
    const copy = stops.filter((_, idx) => idx !== index);
    await reindexAndSync(copy, copy.length >= 2);
  };

  const handleRenameStop = (index: number, name: string) => {
    const copy = stops.map((s, idx) => (idx === index ? { ...s, name } : s));
    onChange(copy, polyline);
  };

  const displayLine =
    polyline.length >= 2 ? polyline : fallbackStraightPolyline(stops);
  const initialCenter: [number, number] = stops[0]
    ? [stops[0].lat, stops[0].lng]
    : [16.4632, 80.5064];

  return (
    <div className="space-y-3 p-3 rounded-xl bg-slate-900/70 border border-slate-800">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Route size={15} className="text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">
            Ordered Route Stops ({stops.length}) — Auto-reverses for Return Trips
          </span>
        </div>
        {stops.length >= 2 && (
          <button
            type="button"
            disabled={isRouting}
            onClick={() => reindexAndSync(stops, true)}
            className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-1"
          >
            {isRouting ? <Loader2 size={12} className="animate-spin" /> : <Route size={12} />}
            <span>{isRouting ? 'Plotting...' : 'Auto-Plot Road Route'}</span>
          </button>
        )}
      </div>

      {/* Location Search Box */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              placeholder="Search place or stop name to add..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching}
            className="btn-secondary text-xs py-1.5 px-3 shrink-0"
          >
            {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>Search Stop</span>
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-1.5 rounded-lg bg-slate-950 border border-slate-700 divide-y divide-slate-800 max-h-40 overflow-y-auto z-20">
            {suggestions.map((s, idx) => (
              <button
                key={`${s.lat}-${s.lng}-${idx}`}
                type="button"
                onClick={() => handleAddStop(s.shortName, s.lat, s.lng)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800/80 flex items-center justify-between gap-2"
              >
                <span className="text-slate-200 truncate">{s.displayName}</span>
                <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
                  + Add Stop
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Pin-Drop Map */}
      <div className="rounded-lg overflow-hidden border border-slate-700 h-56 relative">
        <MapContainer
          center={initialCenter}
          zoom={13}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onDropPin={handleMapDropPin} />
          <MapRecenterHelper center={focusPoint} />

          {displayLine.length >= 2 && (
            <Polyline
              positions={displayLine}
              pathOptions={{ color: '#10b981', weight: 4, opacity: 0.85 }}
            />
          )}

          {stops.map((stop, idx) => (
            <Marker
              key={`${stop.order}-${stop.lat}-${stop.lng}`}
              position={[stop.lat, stop.lng]}
              icon={makeNumberedStopIcon(
                idx + 1,
                idx === 0,
                idx === stops.length - 1 && stops.length > 1,
              )}
            >
              <Popup>
                <div className="text-xs font-semibold">
                  #{idx + 1}: {stop.name}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <div className="absolute bottom-2 left-2 z-[400] bg-slate-950/90 text-slate-200 text-[10px] px-2.5 py-1 rounded-md border border-slate-700 pointer-events-none">
          Click anywhere on map to drop a stop pin
        </div>
      </div>

      {/* Ordered Stop List */}
      {stops.length > 0 ? (
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {stops.map((stop, idx) => (
            <div
              key={`${stop.order}-${idx}`}
              className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5"
            >
              <span
                className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                  idx === 0
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : idx === stops.length - 1
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                }`}
              >
                {idx + 1}
              </span>
              <input
                type="text"
                value={stop.name}
                onChange={(e) => handleRenameStop(idx, e.target.value)}
                className="flex-1 bg-transparent text-xs text-slate-100 border-none focus:outline-none"
              />
              <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
                {stop.lat.toFixed(3)}, {stop.lng.toFixed(3)}
              </span>
              <button
                type="button"
                onClick={() => handleMoveStop(idx, -1)}
                disabled={idx === 0}
                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30"
                title="Move Up"
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => handleMoveStop(idx, 1)}
                disabled={idx === stops.length - 1}
                className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30"
                title="Move Down"
              >
                <ArrowDown size={12} />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveStop(idx)}
                className="p-1 text-red-400 hover:text-red-300"
                title="Remove Stop"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 py-1">
          <MapPin size={13} className="text-slate-500" />
          <span>No stops added yet. Search a stop above or click on the map to add Source → Destination.</span>
        </div>
      )}
    </div>
  );
};
