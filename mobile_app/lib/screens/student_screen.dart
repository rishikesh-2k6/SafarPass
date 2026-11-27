import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_session.dart';
import '../services/student_boarding_service.dart';

class StudentScreen extends StatefulWidget {
  final UserSession session;

  const StudentScreen({super.key, required this.session});

  @override
  State<StudentScreen> createState() => _StudentScreenState();
}

class _StudentScreenState extends State<StudentScreen> {
  late final StudentBoardingService _boardingService;
  final MapController _mapController = MapController();
  final MobileScannerController _scannerController = MobileScannerController();

  late BusLocationData _busLocation;
  StreamSubscription<BusLocationData>? _busLocationSub;

  int _selectedTab = 0; // 0: Scan Bus QR, 1: My ID Pass
  bool _bypassGps = false; // Enforce 50m GPS proximity by default in production
  bool _isProcessingScan = false;
  bool _isSatellite = false;
  bool _isMapReady = false;
  bool _followBus = true;
  BoardingResult? _boardingResult;

  String get _studentId => widget.session.loginId;
  String get _studentName => widget.session.fullName;
  String get _assignedBusId => widget.session.assignedBusId;
  bool get _feePaid => widget.session.feePaid;

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

  Future<void> _handleBarcodeDetected(BarcodeCapture capture) async {
    if (_isProcessingScan || _selectedTab != 0) return;

    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      final String? rawVal = barcode.rawValue;
      if (rawVal != null && rawVal.isNotEmpty && rawVal.contains('|')) {
        setState(() {
          _isProcessingScan = true;
        });

        final result = await _boardingService.verifyAndBoard(
          rawVal,
          bypassGpsCheck: _bypassGps,
        );

        if (mounted) {
          if (result.isSuccess) {
            await _scannerController.stop();
          }
          setState(() {
            _boardingResult = result;
            _isProcessingScan = false;
          });
        }
        break;
      }
    }
  }

  Future<void> _resetScanner() async {
    setState(() {
      _boardingResult = null;
      _isProcessingScan = false;
    });
    try {
      await _scannerController.start();
    } catch (_) {}
  }

  @override
  void dispose() {
    _busLocationSub?.cancel();
    _boardingService.dispose();
    _scannerController.dispose();
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String activeDest = _busLocation.destination.isNotEmpty
        ? _busLocation.destination
        : (widget.session.destination ?? '');

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        title: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _studentName,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  Text(
                    activeDest.isNotEmpty
                        ? 'Bus $_assignedBusId → $activeDest'
                        : 'Transit Pass • Bus $_assignedBusId',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: Text(
                _studentId,
                style: const TextStyle(
                  fontSize: 12,
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
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
        child: Column(
          children: [
            if (!_feePaid)
              Container(
                width: double.infinity,
                padding:
                    const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
                decoration: const BoxDecoration(
                  color: Color(0xFFFEF3C7),
                  border: Border(
                    bottom: BorderSide(color: Color(0xFFFDE68A)),
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.warning_amber_rounded,
                        size: 16, color: Color(0xFFB45309)),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Transport fee pending. Please clear dues with the accounts office.',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF92400E),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Live Bus Map Card
                    Container(
                      height: 270,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                        boxShadow: [
                          BoxShadow(
                            color:
                                const Color(0xFF0F172A).withValues(alpha: 0.04),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
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
                                initialCenter:
                                    LatLng(_busLocation.lat, _busLocation.lng),
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
                                      point: LatLng(
                                          _busLocation.lat, _busLocation.lng),
                                      width: 48,
                                      height: 48,
                                      child: _buildBusMarker(),
                                    ),
                                  ],
                                ),
                              ],
                            ),

                            // Speed & status pill (top-left)
                            Positioned(
                              top: 10,
                              left: 10,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.95),
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(
                                      color:
                                          Colors.black.withValues(alpha: 0.08),
                                      blurRadius: 6,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
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
                                    Text(
                                      '$_assignedBusId • ${_busLocation.speed.toStringAsFixed(0)} km/h',
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

                            // Destination badge (bottom-left)
                            if (activeDest.isNotEmpty)
                              Positioned(
                                bottom: 10,
                                left: 10,
                                right: 140,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 6),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.95),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(
                                        color: const Color(0xFFE2E8F0)),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black
                                            .withValues(alpha: 0.08),
                                        blurRadius: 6,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.location_on_rounded,
                                          size: 14, color: Color(0xFF10B981)),
                                      const SizedBox(width: 4),
                                      Flexible(
                                        child: Text(
                                          'To: $activeDest',
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.bold,
                                            color: Color(0xFF0F172A),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                            // Street / Satellite chip (top-right)
                            Positioned(
                              top: 10,
                              right: 10,
                              child: InkWell(
                                onTap: () {
                                  setState(() {
                                    _isSatellite = !_isSatellite;
                                  });
                                },
                                borderRadius: BorderRadius.circular(16),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 5),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.95),
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(
                                        color: const Color(0xFFE2E8F0)),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black
                                            .withValues(alpha: 0.06),
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

                            // Locate / Recenter on Bus Floating Button (side of map)
                            Positioned(
                              bottom: 52,
                              right: 10,
                              child: FloatingActionButton.small(
                                heroTag: 'student_locate_bus',
                                tooltip: 'Locate Bus',
                                backgroundColor: _followBus
                                    ? const Color(0xFF10B981)
                                    : Colors.white,
                                foregroundColor: _followBus
                                    ? Colors.white
                                    : const Color(0xFF0F172A),
                                elevation: 4,
                                onPressed: _locateBus,
                                child: const Icon(
                                    Icons.my_location_rounded,
                                    size: 18),
                              ),
                            ),

                            // Google Maps button (bottom-right)
                            Positioned(
                              bottom: 10,
                              right: 10,
                              child: InkWell(
                                onTap: _openInGoogleMaps,
                                borderRadius: BorderRadius.circular(20),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12, vertical: 7),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F172A),
                                    borderRadius: BorderRadius.circular(20),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black
                                            .withValues(alpha: 0.2),
                                        blurRadius: 6,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: const Text(
                                    'Google Maps ↗',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Bottom Boarding Card
                    Container(
                      padding: const EdgeInsets.all(18.0),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                        boxShadow: [
                          BoxShadow(
                            color:
                                const Color(0xFF0F172A).withValues(alpha: 0.04),
                            blurRadius: 14,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: _buildTabPill(
                                    title: 'Scan Bus QR',
                                    icon: Icons.qr_code_scanner_rounded,
                                    isSelected: _selectedTab == 0,
                                    onTap: () {
                                      setState(() => _selectedTab = 0);
                                      if (_boardingResult?.isSuccess != true) {
                                        _scannerController.start();
                                      }
                                    },
                                  ),
                                ),
                                Expanded(
                                  child: _buildTabPill(
                                    title: 'My ID Pass',
                                    icon: Icons.badge_rounded,
                                    isSelected: _selectedTab == 1,
                                    onTap: () {
                                      setState(() => _selectedTab = 1);
                                      _scannerController.stop();
                                    },
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _selectedTab == 0
                              ? _buildScanQrTab()
                              : _buildMyIdPassTab(),
                        ],
                      ),
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
        size: 26,
      ),
    );
  }

  Widget _buildTabPill({
    required String title,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(9),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: isSelected
                  ? const Color(0xFF0F172A)
                  : const Color(0xFF64748B),
            ),
            const SizedBox(width: 6),
            Text(
              title,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected
                    ? const Color(0xFF0F172A)
                    : const Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildScanQrTab() {
    if (_boardingResult != null && _boardingResult!.isSuccess) {
      return _buildVerifiedPassCard(_boardingResult!);
    }

    return Column(
      children: [
        Container(
          height: 240,
          width: double.infinity,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(
                  controller: _scannerController,
                  onDetect: _handleBarcodeDetected,
                ),
                Center(
                  child: Container(
                    width: 160,
                    height: 160,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: const Color(0xFF10B981),
                        width: 2.5,
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
                if (_isProcessingScan)
                  Container(
                    color: Colors.black54,
                    child: const Center(
                      child:
                          CircularProgressIndicator(color: Color(0xFF10B981)),
                    ),
                  ),
                Positioned(
                  bottom: 8,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Text(
                        'Align rotating bus QR within frame',
                        style: TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.gps_fixed, size: 15, color: Color(0xFF64748B)),
                  SizedBox(width: 6),
                  Text(
                    'Bypass 50m GPS (Indoor Test)',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF334155),
                    ),
                  ),
                ],
              ),
              Transform.scale(
                scale: 0.75,
                child: Switch(
                  value: _bypassGps,
                  activeTrackColor: const Color(0xFF10B981),
                  onChanged: (val) {
                    setState(() {
                      _bypassGps = val;
                    });
                  },
                ),
              ),
            ],
          ),
        ),

        if (_boardingResult != null && !_boardingResult!.isSuccess)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFFECACA)),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline_rounded,
                    color: Color(0xFFDC2626), size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _boardingResult!.message,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF991B1B),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close,
                      size: 14, color: Color(0xFFDC2626)),
                  onPressed: _resetScanner,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildVerifiedPassCard(BoardingResult result) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFECFDF5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFA7F3D0)),
      ),
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: const BoxDecoration(
              color: Color(0xFF10B981),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: 30,
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'BOARDING VERIFIED',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: Color(0xFF065F46),
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 2),
          const Text(
            'Attendance logged via server verification',
            style: TextStyle(fontSize: 11, color: Color(0xFF047857)),
          ),
          const Divider(height: 20),
          _buildPassRow('Student', '$_studentName ($_studentId)'),
          const SizedBox(height: 6),
          _buildPassRow('Bus Assigned', result.busId ?? _assignedBusId),
          const SizedBox(height: 6),
          _buildPassRow('Trip ID', result.tripId ?? 'Active'),
          const SizedBox(height: 6),
          _buildPassRow(
            'Scanned At',
            result.boardedAt?.toLocal().toString().substring(11, 19) ?? 'Now',
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 42,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF10B981)),
                foregroundColor: const Color(0xFF065F46),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: _resetScanner,
              child: const Text(
                'Scan Another Pass',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPassRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
        ),
        Flexible(
          child: Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Color(0xFF0F172A),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMyIdPassTab() {
    final String fallbackQrData = '$_studentId|$_assignedBusId';

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: QrImageView(
            data: fallbackQrData,
            version: QrVersions.auto,
            size: 180.0,
          ),
        ),
        const SizedBox(height: 14),
        Text(
          _studentName,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'ID: $_studentId • Bus $_assignedBusId',
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: _feePaid
                ? const Color(0xFFECFDF5)
                : const Color(0xFFFEF2F2),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: _feePaid
                  ? const Color(0xFFA7F3D0)
                  : const Color(0xFFFECACA),
            ),
          ),
          child: Text(
            _feePaid ? 'FEE STATUS: VERIFIED' : 'FEE STATUS: PENDING',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: _feePaid
                  ? const Color(0xFF065F46)
                  : const Color(0xFF991B1B),
              letterSpacing: 0.5,
            ),
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Offline Fallback Pass: Display to driver if bus scanner is offline',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            color: Color(0xFF94A3B8),
          ),
        ),
      ],
    );
  }
}
