import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_session.dart';
import '../services/student_boarding_service.dart';

class ParentScreen extends StatefulWidget {
  final UserSession session;

  const ParentScreen({super.key, required this.session});

  @override
  State<ParentScreen> createState() => _ParentScreenState();
}

class _ParentScreenState extends State<ParentScreen> {
  late final StudentBoardingService _boardingService;
  final MapController _mapController = MapController();

  late BusLocationData _busLocation;
  StreamSubscription<BusLocationData>? _busLocationSub;
  Timer? _wardPollTimer;

  String _boardingBannerStatus = 'Checking status...';
  bool _isBoarded = false;
  bool _isSos = false;
  bool _isSatellite = false;
  bool _isMapReady = false;
  bool _followBus = true;
  String? _boardedTimestamp;
  String? _activeDriverId;

  String get _wardName =>
      widget.session.wardName ?? widget.session.wardLoginId ?? 'Student';
  String get _wardLoginId =>
      widget.session.wardLoginId ?? widget.session.parentOfStudentId ?? '';
  String get _assignedBusId =>
      widget.session.wardBusId ?? widget.session.assignedBusId;

  @override
  void initState() {
    super.initState();
    _boardingService = StudentBoardingService(session: widget.session);
    _busLocation = _boardingService.currentBusLocation;

    _busLocationSub = _boardingService.busLocationStream.listen((loc) {
      if (mounted) {
        setState(() {
          _busLocation = loc;
        });
        if (_isMapReady && _followBus) {
          _mapController.move(
            LatLng(loc.lat, loc.lng),
            _mapController.camera.zoom,
          );
        }
      }
    });

    _refreshWardStatus();
    _wardPollTimer = Timer.periodic(
      const Duration(seconds: 8),
      (_) => _refreshWardStatus(),
    );
  }

  Future<void> _locateBus() async {
    setState(() {
      _followBus = true;
    });
    final latest = await _boardingService.refreshLocation();
    if (!mounted) return;
    final target = latest ?? _busLocation;
    if (_isMapReady) {
      _mapController.move(LatLng(target.lat, target.lng), 16.0);
    }
  }

  Future<void> _refreshWardStatus() async {
    final status = await _boardingService.fetchParentWardStatus();
    if (!mounted || !status.success) return;

    final bool boarded = status.boarded;
    final String busLabel = status.boardedBusId ?? _assignedBusId;
    final String? formattedTime =
        status.boardedAt != null ? _formatTime(status.boardedAt!.toLocal()) : null;

    setState(() {
      _isBoarded = boarded;
      _boardedTimestamp = formattedTime;
      _activeDriverId = status.activeDriverId;
      _isSos = status.activeTripStatus == 'sos';
      _boardingBannerStatus = boarded
          ? 'Boarded $busLabel at ${formattedTime ?? "today"}'
          : (status.activeTripStatus == 'active'
              ? 'Bus En Route • Waiting to Board'
              : 'Waiting to Board');
    });
  }

  String _formatTime(DateTime dt) {
    final int hour =
        dt.hour > 12 ? dt.hour - 12 : (dt.hour == 0 ? 12 : dt.hour);
    final String period = dt.hour >= 12 ? 'PM' : 'AM';
    final String minute = dt.minute.toString().padLeft(2, '0');
    final String second = dt.second.toString().padLeft(2, '0');
    return '$hour:$minute:$second $period';
  }

  Future<void> _openInGoogleMaps() async {
    final Uri uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${_busLocation.lat},${_busLocation.lng}&travelmode=walking',
    );
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open Google Maps: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _wardPollTimer?.cancel();
    _busLocationSub?.cancel();
    _boardingService.dispose();
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Parent Live View',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            Text(
              'Welcome, ${widget.session.fullName}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh status',
            icon: const Icon(
              Icons.refresh_rounded,
              color: Color(0xFF64748B),
              size: 20,
            ),
            onPressed: () {
              _refreshWardStatus();
              _boardingService.refreshLocation();
            },
          ),
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(
              Icons.logout_rounded,
              color: Color(0xFF64748B),
              size: 20,
            ),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_isSos) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFEF4444)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          color: Color(0xFFDC2626), size: 20),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'EMERGENCY SOS flagged on assigned bus. Campus dispatch notified.',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF991B1B),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
              _buildTopStatusCard(),
              const SizedBox(height: 14),
              Expanded(
                child: _buildExpandedMapCard(),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopStatusCard() {
    final bool isBoarded = _isBoarded;
    final String activeDest = _busLocation.destination.isNotEmpty
        ? _busLocation.destination
        : (widget.session.destination ?? '');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isBoarded ? const Color(0xFFA7F3D0) : const Color(0xFFFDE68A),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: isBoarded
                  ? const Color(0xFF10B981)
                  : const Color(0xFFF59E0B),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isBoarded
                  ? Icons.verified_user_rounded
                  : Icons.access_time_rounded,
              color: Colors.white,
              size: 24,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        _boardingBannerStatus,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: isBoarded
                              ? const Color(0xFF065F46)
                              : const Color(0xFFB45309),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _assignedBusId,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  isBoarded
                      ? 'Ward: $_wardName ($_wardLoginId) • Boarded at ${_boardedTimestamp ?? "recently"}'
                      : 'Ward: $_wardName ($_wardLoginId) • Driver: ${_activeDriverId ?? "Standby"}',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
                if (activeDest.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    'Destination: $activeDest',
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF059669),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildExpandedMapCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                initialCenter: LatLng(_busLocation.lat, _busLocation.lng),
                initialZoom: 15.0,
                onMapReady: () {
                  _isMapReady = true;
                  _mapController.move(
                    LatLng(_busLocation.lat, _busLocation.lng),
                    15.5,
                  );
                },
                onPositionChanged: (_, bool hasGesture) {
                  if (hasGesture && _followBus) {
                    setState(() {
                      _followBus = false;
                    });
                  }
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: _isSatellite
                      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.vahansync.app',
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: LatLng(_busLocation.lat, _busLocation.lng),
                      width: 50,
                      height: 50,
                      child: _buildBusMarker(),
                    ),
                  ],
                ),
              ],
            ),
            Positioned(
              top: 12,
              right: 12,
              child: InkWell(
                onTap: () {
                  setState(() {
                    _isSatellite = !_isSatellite;
                  });
                },
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.95),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.08),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _isSatellite
                            ? Icons.map_rounded
                            : Icons.satellite_alt_rounded,
                        size: 14,
                        color: const Color(0xFF0F172A),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _isSatellite ? 'Street' : 'Satellite',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 86,
              right: 12,
              child: FloatingActionButton.small(
                heroTag: 'parent_recenter',
                tooltip: 'Locate Bus',
                backgroundColor:
                    _followBus ? const Color(0xFF10B981) : Colors.white,
                foregroundColor:
                    _followBus ? Colors.white : const Color(0xFF0F172A),
                elevation: 3,
                onPressed: _locateBus,
                child: const Icon(Icons.my_location_rounded, size: 18),
              ),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.96),
                  border: const Border(
                    top: BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 8,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: _busLocation.hasServerFix
                                      ? const Color(0xFF10B981)
                                      : Colors.amber.shade600,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  '${_busLocation.speed.toStringAsFixed(1)} km/h • Boarded: ${_busLocation.boardedCount}',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: Color(0xFF0F172A),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'GPS: ${_busLocation.lat.toStringAsFixed(4)}, ${_busLocation.lng.toStringAsFixed(4)}',
                            style: const TextStyle(
                              fontSize: 10,
                              fontFamily: 'monospace',
                              color: Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ),
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF0F172A),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(
                        Icons.navigation_rounded,
                        color: Color(0xFF10B981),
                        size: 16,
                      ),
                      label: const Text(
                        'Google Maps ↗',
                        style: TextStyle(
                            fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                      onPressed: _openInGoogleMaps,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBusMarker() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF10B981),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF10B981).withValues(alpha: 0.4),
            blurRadius: 8,
            spreadRadius: 2,
          ),
        ],
      ),
      child: const Icon(
        Icons.directions_bus_rounded,
        color: Colors.white,
        size: 28,
      ),
    );
  }
}
