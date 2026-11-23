import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/student_boarding_service.dart';

class StudentScreen extends StatefulWidget {
  const StudentScreen({super.key});

  @override
  State<StudentScreen> createState() => _StudentScreenState();
}

class _StudentScreenState extends State<StudentScreen> {
  final StudentBoardingService _boardingService = StudentBoardingService();
  final MapController _mapController = MapController();
  final MobileScannerController _scannerController = MobileScannerController();

  static const String studentId = 'student_01';
  static const String studentName = 'Rishikesh';
  static const String rollNumber = '24AIE001';
  final bool _feePaid = true; // default true as per data schema

  BusLocationData _busLocation = BusLocationData.initial();
  StreamSubscription<BusLocationData>? _busLocationSub;

  int _selectedTab = 0; // 0: Scan Bus QR, 1: My ID Pass
  bool _bypassGps = true; // default true for desk testing
  bool _isProcessingScan = false;
  bool _isSatellite = false; // Street vs Satellite toggle
  BoardingResult? _boardingResult;

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
    if (_isProcessingScan) return;

    final List<Barcode> barcodes = capture.barcodes;
    for (final barcode in barcodes) {
      final String? rawVal = barcode.rawValue;
      if (rawVal != null && rawVal.isNotEmpty && rawVal.startsWith('BUS_')) {
        setState(() {
          _isProcessingScan = true;
        });

        final result = await _boardingService.verifyAndBoard(
          rawVal,
          studentId,
          studentName,
          bypassGpsCheck: _bypassGps,
        );

        if (mounted) {
          setState(() {
            _boardingResult = result;
            _isProcessingScan = false;
          });
        }
        break;
      }
    }
  }

  void _resetScanner() {
    setState(() {
      _boardingResult = null;
      _isProcessingScan = false;
    });
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
                    studentName,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  Text(
                    'Transit Pass • Bus BUS_01',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
            // Roll ID Pill
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Text(
                rollNumber,
                style: TextStyle(
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
            // Slim amber banner only if feePaid == false
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
                child: Row(
                  children: const [
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
                    // Top Map Card (height: 260, rounded 16px)
                    Container(
                      height: 260,
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
                                initialCenter: LatLng(
                                    _busLocation.lat, _busLocation.lng),
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
                                      point: LatLng(_busLocation.lat,
                                          _busLocation.lng),
                                      width: 48,
                                      height: 48,
                                      child: _buildBusMarker(),
                                    ),
                                  ],
                                ),
                              ],
                            ),

                            // Floating live speed & status pill (top-left)
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
                                        color: _busLocation.speed > 0
                                            ? const Color(0xFF10B981)
                                            : Colors.amber.shade600,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'BUS_01 • ${_busLocation.speed.toStringAsFixed(0)} km/h',
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

                            // Floating top-right Street / Satellite chip
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

                            // Floating bottom-right Google Maps ↗ button
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
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: const [
                                      Text(
                                        'Google Maps ↗',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Bottom Boarding Card: Clean 2-tab switcher
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
                          // Tab selector
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
                                    onTap: () =>
                                        setState(() => _selectedTab = 0),
                                  ),
                                ),
                                Expanded(
                                  child: _buildTabPill(
                                    title: 'My ID Pass',
                                    icon: Icons.badge_rounded,
                                    isSelected: _selectedTab == 1,
                                    onTap: () =>
                                        setState(() => _selectedTab = 1),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Tab Content
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
        // Camera Preview Frame (height: 240, rounded 16px)
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
                // Corner scan frame overlay
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

        // Compact Bypass 50m GPS debug switch
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
              Row(
                children: const [
                  Icon(Icons.gps_fixed, size: 15, color: Color(0xFF64748B)),
                  SizedBox(width: 6),
                  Text(
                    'Bypass 50m GPS (Desk Testing)',
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
            'Attendance logged to AppSync cloud ledger',
            style: TextStyle(fontSize: 11, color: Color(0xFF047857)),
          ),
          const Divider(height: 20),
          _buildPassRow('Student', '$studentName ($rollNumber)'),
          const SizedBox(height: 6),
          _buildPassRow('Bus Assigned', result.busId ?? 'BUS_01'),
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
        Text(
          value,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }

  Widget _buildMyIdPassTab() {
    const String fallbackQrData = '$studentId|$rollNumber';

    return Column(
      children: [
        // Centered static QrImageView (180x180)
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

        // Student name and ID clearly formatted below
        Text(
          studentName,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'Roll: $rollNumber • B.Tech AI',
          style: const TextStyle(
            fontSize: 12,
            color: Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
          decoration: BoxDecoration(
            color: const Color(0xFFECFDF5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: const Color(0xFFA7F3D0)),
          ),
          child: const Text(
            'FEE STATUS: VERIFIED',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF065F46),
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
