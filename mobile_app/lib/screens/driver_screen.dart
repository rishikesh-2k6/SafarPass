import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../models/user_session.dart';
import '../services/driver_telemetry_service.dart';

class DriverScreen extends StatefulWidget {
  final UserSession session;

  const DriverScreen({super.key, required this.session});

  @override
  State<DriverScreen> createState() => _DriverScreenState();
}

class _DriverScreenState extends State<DriverScreen> {
  late final DriverTelemetryService _telemetryService;
  final FlutterTts _flutterTts = FlutterTts();

  bool _isTripActive = false;
  bool _isLoading = false;
  bool _simulateMovement = false;
  String _currentQrPayload = '';
  int _boardedCount = 0;
  int _previousBoardedCount = 0;

  StreamSubscription<String>? _qrSub;
  StreamSubscription<int>? _boardedSub;
  StreamSubscription<bool>? _tripStateSub;

  @override
  void initState() {
    super.initState();
    _telemetryService = DriverTelemetryService(session: widget.session);
    _initWakelockAndTts();
    _setupListeners();
  }

  Future<void> _initWakelockAndTts() async {
    try {
      await WakelockPlus.enable();
    } catch (e) {
      debugPrint('Error enabling wakelock: $e');
    }

    try {
      await _flutterTts.setLanguage('en-US');
      await _flutterTts.setSpeechRate(0.5);
      await _flutterTts.setVolume(1.0);
      await _flutterTts.setPitch(1.0);
    } catch (e) {
      debugPrint('Error setting up TTS: $e');
    }
  }

  void _setupListeners() {
    _qrSub = _telemetryService.qrStream.listen((payload) {
      if (mounted) {
        setState(() {
          _currentQrPayload = payload;
        });
      }
    });

    _boardedSub = _telemetryService.boardedCountStream.listen((count) {
      if (mounted) {
        if (count > _previousBoardedCount) {
          _speakBoarded(count);
        }
        setState(() {
          _previousBoardedCount = count;
          _boardedCount = count;
        });
      }
    });

    _tripStateSub = _telemetryService.tripStateStream.listen((isActive) {
      if (mounted) {
        final bool wasActive = _isTripActive;
        setState(() {
          _isTripActive = isActive;
          if (!isActive) {
            _currentQrPayload = '';
          }
        });
        if (wasActive && !isActive) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              backgroundColor: Color(0xFF0F172A),
              content: Text('Trip concluded by fleet dispatch.'),
            ),
          );
        }
      }
    });
  }

  Future<void> _speakBoarded(int count) async {
    try {
      await _flutterTts.speak('Boarded $count');
    } catch (e) {
      debugPrint('TTS speak error: $e');
    }
  }

  Future<void> _handleStartTrip() async {
    setState(() {
      _isLoading = true;
    });

    try {
      _telemetryService.simulateMovement = _simulateMovement;
      await _telemetryService.startTrip();
      if (mounted) {
        setState(() {
          _isTripActive = true;
          _currentQrPayload = _telemetryService.currentQrPayload;
          _boardedCount = _telemetryService.boardedCount;
          _previousBoardedCount = _boardedCount;
        });
      }
    } catch (e) {
      if (mounted) {
        _showLocationSettingsFallback(e.toString());
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showLocationSettingsFallback(String errorMsg) {
    final bool isLocationError = errorMsg.toLowerCase().contains('location') ||
        errorMsg.toLowerCase().contains('permission') ||
        errorMsg.toLowerCase().contains('gps');

    if (isLocationError) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.location_off_rounded, color: Colors.amber, size: 28),
              SizedBox(width: 8),
              Text('Location Required'),
            ],
          ),
          content: Text(
            '$errorMsg\n\nPlease grant location permissions and enable device GPS to broadcast live telemetry.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                Navigator.pop(ctx);
                await Geolocator.openAppSettings();
                await Geolocator.openLocationSettings();
              },
              child: const Text('Open Settings'),
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: const Color(0xFFEF4444),
          content: Text('Failed to start trip: $errorMsg'),
        ),
      );
    }
  }

  Future<void> _handleEndTrip() async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('End Trip?'),
        content: const Text(
          'Are you sure you want to conclude the current bus trip? This will stop GPS telemetry and QR generation.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFEF4444),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('End Trip'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() {
      _isLoading = true;
    });

    try {
      await _telemetryService.endTrip();
      if (mounted) {
        setState(() {
          _isTripActive = false;
          _currentQrPayload = '';
          _boardedCount = 0;
          _previousBoardedCount = 0;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFF10B981),
            content: Text('Trip completed successfully.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error ending trip: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleLogout() async {
    if (_isTripActive) {
      final bool? confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Active Trip Running'),
          content: const Text(
            'Logging out will end the active trip and stop GPS broadcasting. Continue?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Stay'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444),
                foregroundColor: Colors.white,
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('End Trip & Logout'),
            ),
          ],
        ),
      );
      if (confirm != true) return;
      await _telemetryService.endTrip();
    }
    if (mounted) {
      Navigator.pop(context);
    }
  }

  Future<void> _handleTriggerSos() async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.amber, size: 28),
            SizedBox(width: 8),
            Text('Confirm Emergency SOS',
                style: TextStyle(color: Color(0xFFD97706))),
          ],
        ),
        content: const Text(
          'This will flag the trip as an emergency SOS in transit telemetry and notify dispatchers immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD97706),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('TRIGGER SOS'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      await _telemetryService.triggerSos();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            backgroundColor: Color(0xFFB45309),
            duration: Duration(seconds: 4),
            content: Text('EMERGENCY SOS SENT! Dispatchers notified.'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to trigger SOS: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _qrSub?.cancel();
    _boardedSub?.cancel();
    _tripStateSub?.cancel();
    _telemetryService.dispose();
    _flutterTts.stop();
    try {
      WakelockPlus.disable();
    } catch (_) {}
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String busId = widget.session.assignedBusId;
    final String driverLabel =
        '${widget.session.loginId} • ${widget.session.fullName}';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: const Color(0xFF10B981).withValues(alpha: 0.4),
                ),
              ),
              child: Text(
                busId,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF065F46),
                  letterSpacing: 0.5,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Driver Console',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  Text(
                    driverLabel,
                    overflow: TextOverflow.ellipsis,
                    style:
                        const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Logout',
            icon: const Icon(Icons.logout_rounded,
                color: Color(0xFF64748B), size: 20),
            onPressed: _handleLogout,
          ),
        ],
      ),
      body: SafeArea(
        child: _isLoading
            ? const Center(
                child: CircularProgressIndicator(color: Color(0xFF10B981)),
              )
            : _isTripActive
                ? _buildActiveTripState()
                : _buildIdleState(),
      ),
    );
  }

  Widget _buildIdleState() {
    final String busId = widget.session.assignedBusId;
    final String routeName = widget.session.routeName;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFE2E8F0)),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF0F172A).withValues(alpha: 0.04),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: const Color(0xFFECFDF5),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: const Color(0xFF10B981).withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'Live GPS Ready',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF065F46),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    routeName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Bus: $busId • ${widget.session.busCapacity} Seats',
                    style: const TextStyle(
                      fontSize: 12,
                      color: Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 32),
                  Container(
                    width: 190,
                    height: 190,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [Color(0xFF10B981), Color(0xFF059669)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color:
                              const Color(0xFF10B981).withValues(alpha: 0.38),
                          blurRadius: 26,
                          spreadRadius: 4,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: _handleStartTrip,
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.directions_bus_rounded,
                              size: 64,
                              color: Colors.white,
                            ),
                            SizedBox(height: 10),
                            Text(
                              'START TRIP',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  Text(
                    'Tap to broadcast live telemetry & activate attendance',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActiveTripState() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Top Status Strip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: ValueListenableBuilder<String>(
                    valueListenable: _telemetryService.gpsStatus,
                    builder: (context, statusText, _) {
                      final bool isSim = _simulateMovement;
                      final bool isLiveOk = statusText.contains('Live GPS');

                      return Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: isSim
                                  ? Colors.blue.shade600
                                  : (isLiveOk
                                      ? const Color(0xFF10B981)
                                      : Colors.amber.shade700),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              isSim ? 'Simulated Route' : statusText,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: isSim
                                    ? Colors.blue.shade800
                                    : (isLiveOk
                                        ? const Color(0xFF065F46)
                                        : Colors.amber.shade900),
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Simulate',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Transform.scale(
                      scale: 0.75,
                      child: Switch(
                        value: _simulateMovement,
                        activeTrackColor: const Color(0xFF10B981),
                        onChanged: (val) {
                          setState(() {
                            _simulateMovement = val;
                            _telemetryService.simulateMovement = val;
                          });
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Hero QR Card
          Container(
            padding: const EdgeInsets.all(22.0),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFFE2E8F0)),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.04),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Student Pass QR',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFECFDF5),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.autorenew_rounded,
                              size: 13, color: Color(0xFF10B981)),
                          SizedBox(width: 4),
                          Text(
                            'Auto-refreshing 15s',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF065F46),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: _currentQrPayload.isNotEmpty
                      ? QrImageView(
                          data: _currentQrPayload,
                          version: QrVersions.auto,
                          size: 200.0,
                        )
                      : const SizedBox(
                          width: 200,
                          height: 200,
                          child: Center(
                            child: CircularProgressIndicator(
                              color: Color(0xFF10B981),
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Auto-refreshing boarding pass (HMAC-SHA256)',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F172A),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'PASSENGERS BOARDED',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF94A3B8),
                              letterSpacing: 0.8,
                            ),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Live AppSync Sync • Voice TTS',
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF10B981),
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '$_boardedCount',
                          style: const TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),

          // Bottom Action Row
          Row(
            children: [
              Expanded(
                flex: 1,
                child: SizedBox(
                  height: 54,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(
                          color: Color(0xFFD97706), width: 1.5),
                      backgroundColor: const Color(0xFFFFFBEB),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: const Icon(
                      Icons.warning_amber_rounded,
                      color: Color(0xFFD97706),
                      size: 20,
                    ),
                    label: const Text(
                      'SOS ALERT',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFB45309),
                      ),
                    ),
                    onPressed: _handleTriggerSos,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: SizedBox(
                  height: 54,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEF4444),
                      foregroundColor: Colors.white,
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    icon: const Icon(Icons.stop_circle_rounded, size: 22),
                    label: const Text(
                      'END TRIP',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                    onPressed: _handleEndTrip,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
