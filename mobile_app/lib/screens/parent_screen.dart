// ignore_for_file: unnecessary_import
import 'dart:async';
import 'dart:convert';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/student_boarding_service.dart';

class ParentScreen extends StatefulWidget {
  const ParentScreen({super.key});

  @override
  State<ParentScreen> createState() => _ParentScreenState();
}

class _ParentScreenState extends State<ParentScreen> {
  final StudentBoardingService _boardingService = StudentBoardingService();
  final MapController _mapController = MapController();

  static const String studentId = 'student_01';
  static const String studentName = 'Rishikesh';
  static const String rollNumber = '24AIE001';
  static const String assignedBusId = 'BUS_01';

  BusLocationData _busLocation = BusLocationData.initial(busId: assignedBusId);
  StreamSubscription<BusLocationData>? _busLocationSub;
  StreamSubscription<GraphQLResponse<String>>? _attendanceSubscription;

  String _boardingBannerStatus = 'Waiting to Board';
  bool _isBoarded = false;
  bool _isSatellite = false; // Street vs Satellite toggle
  String? _boardedTimestamp;

  @override
  void initState() {
    super.initState();
    _busLocation = _boardingService.currentBusLocation;
    _busLocationSub = _boardingService.busLocationStream.listen((loc) {
      if (mounted) {
        setState(() {
          _busLocation = loc;
        });
        _mapController.move(
            LatLng(loc.lat, loc.lng), _mapController.camera.zoom);
      }
    });

    _subscribeToAttendanceLogs();
  }

  void _subscribeToAttendanceLogs() {
    const String onCreateAttendanceLogSubscription = r'''
      subscription OnCreateAttendanceLog {
        onCreateAttendanceLog {
          id
          tripId
          busId
          studentId
          studentName
          scanLat
          scanLng
          scannedAt
        }
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: onCreateAttendanceLogSubscription,
      );
      final Stream<GraphQLResponse<String>> operation = Amplify.API.subscribe(
        request,
        onEstablished: () => safePrint('Parent attendance subscription active'),
      );

      _attendanceSubscription = operation.listen(
        (event) {
          if (event.data != null) {
            try {
              final Map<String, dynamic> map =
                  jsonDecode(event.data!) as Map<String, dynamic>;
              final Map<String, dynamic>? log =
                  map['onCreateAttendanceLog'] as Map<String, dynamic>?;

              if (log != null && log['studentId'] == studentId) {
                final String? scannedAtStr = log['scannedAt'] as String?;
                final DateTime dt = scannedAtStr != null
                    ? (DateTime.tryParse(scannedAtStr)?.toLocal() ??
                        DateTime.now())
                    : DateTime.now();

                final String formattedTime = _formatTime(dt);

                if (mounted) {
                  setState(() {
                    _isBoarded = true;
                    _boardedTimestamp = formattedTime;
                    _boardingBannerStatus =
                        'Boarded $assignedBusId at $formattedTime';
                  });
                }
              }
            } catch (e) {
              safePrint('Error decoding parent attendance log event: $e');
            }
          }
        },
        onError: (err) =>
            safePrint('Parent attendance subscription error: $err'),
      );
    } catch (e) {
      safePrint('Failed to initialize parent attendance subscription: $e');
    }
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
    _busLocationSub?.cancel();
    _attendanceSubscription?.cancel();
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
          children: const [
            Text(
              'Parent Live View',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
            ),
            Text(
              'Live Transit & Attendance Tracking',
              style: TextStyle(fontSize: 11, color: Color(0xFF64748B)),
            ),
          ],
        ),
        actions: [
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
              // Top Status Card
              _buildTopStatusCard(),
              const SizedBox(height: 14),

              // Expanded Live Map Card
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
          // Status Icon badge
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

          // Status & Student info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _boardingBannerStatus,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: isBoarded
                            ? const Color(0xFF065F46)
                            : const Color(0xFFB45309),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        assignedBusId,
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
                      ? 'Ward: $studentName ($rollNumber) • Boarded at ${_boardedTimestamp ?? "recently"}'
                      : 'Ward: $studentName ($rollNumber) • Driver: driver_01',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF64748B),
                  ),
                ),
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

            // Top-right Street / Satellite toggle chip
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

            // Recenter Floating Button (above footer)
            Positioned(
              bottom: 86,
              right: 12,
              child: FloatingActionButton.small(
                heroTag: 'parent_recenter',
                backgroundColor: Colors.white,
                foregroundColor: const Color(0xFF0F172A),
                elevation: 3,
                onPressed: () {
                  _mapController.move(
                    LatLng(_busLocation.lat, _busLocation.lng),
                    16.0,
                  );
                },
                child: const Icon(Icons.my_location_rounded, size: 18),
              ),
            ),

            // Bottom Live Bus Speed / Telemetry Footer Bar with Open in Google Maps Button
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
                    // Speed & Telemetry indicator
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
                                  color: _busLocation.speed > 0
                                      ? const Color(0xFF10B981)
                                      : Colors.amber.shade600,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                '${_busLocation.speed.toStringAsFixed(1)} km/h • Boarded: ${_busLocation.boardedCount}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF0F172A),
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

                    // Prominent Open in Google Maps Button
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
