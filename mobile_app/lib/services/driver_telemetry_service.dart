// ignore_for_file: unnecessary_import
import 'dart:async';
import 'dart:convert';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../models/user_session.dart';
import 'auth_session_service.dart';

class DriverTelemetryService {
  final UserSession session;

  String get busId => session.assignedBusId;
  String get driverId => session.loginId;
  String get _qrSecret => session.qrSecret ?? '';

  DriverTelemetryService({required this.session});

  static const List<Map<String, double>> simulatedCampusCoordinates = [
    {'lat': 16.4632, 'lng': 80.5064, 'speed': 20.0, 'heading': 45.0},
    {'lat': 16.4645, 'lng': 80.5080, 'speed': 25.0, 'heading': 60.0},
    {'lat': 16.4660, 'lng': 80.5095, 'speed': 30.0, 'heading': 90.0},
    {'lat': 16.4682, 'lng': 80.5105, 'speed': 28.0, 'heading': 120.0},
    {'lat': 16.4700, 'lng': 80.5090, 'speed': 22.0, 'heading': 180.0},
    {'lat': 16.4685, 'lng': 80.5060, 'speed': 26.0, 'heading': 240.0},
    {'lat': 16.4665, 'lng': 80.5045, 'speed': 24.0, 'heading': 270.0},
    {'lat': 16.4640, 'lng': 80.5052, 'speed': 18.0, 'heading': 330.0},
  ];

  String? activeTripId;
  bool isTripActive = false;
  String currentQrPayload = '';
  int boardedCount = 0;

  double currentLat = 16.4632;
  double currentLng = 80.5064;
  double currentSpeed = 0.0;
  double currentHeading = 0.0;

  final ValueNotifier<String> gpsStatus =
      ValueNotifier<String>('Acquiring GPS signal...');

  bool _simulateMovement = false;
  bool get simulateMovement => _simulateMovement;
  set simulateMovement(bool value) {
    _simulateMovement = value;
    if (!isTripActive) return;

    if (value) {
      _positionSubscription?.cancel();
      _positionSubscription = null;
      gpsStatus.value = 'Simulated Campus Loop';
      _startSimulatedTimer();
    } else {
      _simulatedTimer?.cancel();
      _simulatedTimer = null;
      _enableLiveGpsSafe();
    }
  }

  int _simulatedIndex = 0;
  Timer? _simulatedTimer;
  Timer? _qrTimer;
  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<GraphQLResponse<String>>? _subscription;
  DateTime? _lastGpsMutationTime;
  bool _isDisposed = false;

  final StreamController<String> _qrStreamController =
      StreamController<String>.broadcast();
  final StreamController<int> _boardedCountStreamController =
      StreamController<int>.broadcast();
  final StreamController<bool> _tripStateStreamController =
      StreamController<bool>.broadcast();

  Stream<String> get qrStream => _qrStreamController.stream;
  Stream<int> get boardedCountStream => _boardedCountStreamController.stream;
  Stream<bool> get tripStateStream => _tripStateStreamController.stream;

  void Function(int count)? onBoardedCountChanged;
  void Function(String qrPayload)? onQrPayloadChanged;
  void Function(bool isActive)? onTripStateChanged;

  /// Explicit Runtime Permission Helper for Geolocator
  static Future<void> ensureLocationPermission() async {
    final bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw 'Turn on Phone GPS / Location Services to enable live bus tracking.';
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw 'Location permission was denied. Please allow location access to continue.';
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw 'Location permission is permanently denied. Please enable it in device app settings.';
    }
  }

  Future<void> _enableLiveGpsSafe() async {
    try {
      await ensureLocationPermission();
      if (!_isDisposed && isTripActive && !_simulateMovement) {
        _startGpsStream();
      }
    } catch (e) {
      if (!_isDisposed) {
        gpsStatus.value = 'GPS Unavailable: $e';
      }
    }
  }

  Future<Map<String, dynamic>?> _invokeDriverTripAction({
    required String action,
    String? tripId,
    double? lat,
    double? lng,
    double? speed,
    double? heading,
  }) async {
    const String mutation = r'''
      mutation DriverTripAction(
        $sessionToken: String!
        $action: String!
        $tripId: String
        $lat: Float
        $lng: Float
        $speed: Float
        $heading: Float
      ) {
        driverTripAction(
          sessionToken: $sessionToken
          action: $action
          tripId: $tripId
          lat: $lat
          lng: $lng
          speed: $speed
          heading: $heading
        )
      }
    ''';

    final request = GraphQLRequest<String>(
      document: mutation,
      variables: {
        'sessionToken': session.sessionToken,
        'action': action,
        'tripId': ?tripId,
        'lat': ?lat,
        'lng': ?lng,
        'speed': ?speed,
        'heading': ?heading,
      },
      authorizationMode: APIAuthorizationType.apiKey,
    );

    final response = await Amplify.API.mutate(request: request).response;
    if (response.errors.isNotEmpty) {
      throw response.errors.first.message;
    }
    if (response.data == null) return null;

    final Map<String, dynamic>? outer =
        jsonDecode(response.data!) as Map<String, dynamic>?;
    return decodeAwsJsonPayload(outer?['driverTripAction']);
  }

  Future<void> startTrip() async {
    if (_qrSecret.isEmpty) {
      throw 'Missing Bus QR signing secret for $busId. Contact fleet admin.';
    }

    if (!_simulateMovement) {
      await ensureLocationPermission();
    }

    final Map<String, dynamic>? result = await _invokeDriverTripAction(
      action: 'start',
      lat: currentLat,
      lng: currentLng,
    );

    if (result == null || result['success'] != true) {
      throw result?['message'] as String? ?? 'Failed to initialize trip on server.';
    }

    activeTripId = result['tripId'] as String?;
    if (activeTripId == null || activeTripId!.isEmpty) {
      throw 'Server did not return an active tripId.';
    }

    isTripActive = true;
    boardedCount = (result['boardedCount'] as num?)?.toInt() ?? 0;
    if (!_isDisposed) {
      _boardedCountStreamController.add(boardedCount);
      _tripStateStreamController.add(true);
    }
    onTripStateChanged?.call(true);

    _generateRotatingQr();
    _qrTimer?.cancel();
    _qrTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _generateRotatingQr();
    });

    if (_simulateMovement) {
      gpsStatus.value = 'Simulated Campus Loop';
      _startSimulatedTimer();
    } else {
      _startGpsStream();
    }

    _subscribeToBusLocationUpdates();
  }

  void _startGpsStream() {
    _positionSubscription?.cancel();
    _positionSubscription = null;
    gpsStatus.value = 'Acquiring GPS signal...';

    LocationSettings locationSettings;
    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 3),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'VahanSync Active Trip',
          notificationText: 'Broadcasting live bus GPS telemetry',
          enableWakeLock: true,
        ),
      );
    } else {
      locationSettings = const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
      );
    }

    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen(
      (Position pos) {
        currentLat = pos.latitude;
        currentLng = pos.longitude;
        currentSpeed = (pos.speed * 3.6).clamp(0.0, 120.0);
        currentHeading = pos.heading;
        if (!_isDisposed) {
          gpsStatus.value = 'Live GPS (±${pos.accuracy.toStringAsFixed(0)}m)';
        }

        final DateTime now = DateTime.now();
        if (_lastGpsMutationTime == null ||
            now.difference(_lastGpsMutationTime!).inMilliseconds >= 3000) {
          _lastGpsMutationTime = now;
          _sendBusLocationMutation(
            currentLat,
            currentLng,
            currentSpeed,
            currentHeading,
          );
        }
      },
      onError: (err) {
        if (!_isDisposed) {
          gpsStatus.value = 'GPS Error: $err';
        }
        safePrint('getPositionStream error: $err');
      },
    );
  }

  void _startSimulatedTimer() {
    _simulatedTimer?.cancel();
    _simulatedTimer = Timer.periodic(const Duration(seconds: 4), (_) async {
      final coord = simulatedCampusCoordinates[
          _simulatedIndex % simulatedCampusCoordinates.length];
      _simulatedIndex++;
      currentLat = coord['lat']!;
      currentLng = coord['lng']!;
      currentSpeed = coord['speed']!;
      currentHeading = coord['heading']!;
      if (!_isDisposed) {
        gpsStatus.value = 'Simulated Campus Loop';
      }
      await _sendBusLocationMutation(
        currentLat,
        currentLng,
        currentSpeed,
        currentHeading,
      );
    });
  }

  Future<void> _sendBusLocationMutation(
    double lat,
    double lng,
    double speed,
    double heading,
  ) async {
    if (!isTripActive || activeTripId == null) return;

    try {
      final Map<String, dynamic>? result = await _invokeDriverTripAction(
        action: 'location',
        tripId: activeTripId,
        lat: lat,
        lng: lng,
        speed: speed,
        heading: heading,
      );

      if (result == null) return;

      // Sync if Admin forcibly ended this trip from the Web Console
      if (result['tripStatus'] == 'completed') {
        _stopLocalTimers();
        isTripActive = false;
        activeTripId = null;
        currentQrPayload = '';
        if (!_isDisposed) {
          gpsStatus.value = 'Ended by Dispatch';
          _tripStateStreamController.add(false);
        }
        onTripStateChanged?.call(false);
        return;
      }

      final int? serverCount = (result['boardedCount'] as num?)?.toInt();
      if (serverCount != null && serverCount != boardedCount) {
        boardedCount = serverCount;
        if (!_isDisposed) {
          _boardedCountStreamController.add(boardedCount);
        }
        onBoardedCountChanged?.call(boardedCount);
      }
    } catch (e) {
      safePrint('Error executing telemetry location update: $e');
    }
  }

  String _generateRotatingQr() {
    if (activeTripId == null || _qrSecret.isEmpty) return '';
    final int epochSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final String rawData = '$busId|$activeTripId|$epochSeconds';
    final hmac = Hmac(sha256, utf8.encode(_qrSecret));
    final Digest digest = hmac.convert(utf8.encode(rawData));
    final String payload = '$rawData|$digest';

    currentQrPayload = payload;
    if (!_isDisposed) {
      _qrStreamController.add(payload);
    }
    onQrPayloadChanged?.call(payload);
    return payload;
  }

  void _subscribeToBusLocationUpdates() {
    _subscription?.cancel();

    const String onUpdateBusLocationSubscription = r'''
      subscription OnUpdateBusLocation {
        onUpdateBusLocation {
          busId
          tripId
          lat
          lng
          speed
          heading
          boardedCount
        }
      }
    ''';

    try {
      final subRequest = GraphQLRequest<String>(
        document: onUpdateBusLocationSubscription,
        authorizationMode: APIAuthorizationType.apiKey,
      );
      final Stream<GraphQLResponse<String>> operation = Amplify.API.subscribe(
        subRequest,
        onEstablished: () => safePrint('BusLocation subscription established'),
      );

      _subscription = operation.listen(
        (event) {
          if (event.data != null) {
            try {
              final Map<String, dynamic> map =
                  jsonDecode(event.data!) as Map<String, dynamic>;
              final Map<String, dynamic>? loc =
                  map['onUpdateBusLocation'] as Map<String, dynamic>?;
              if (loc != null && loc['busId'] == busId) {
                final int? newCount = (loc['boardedCount'] as num?)?.toInt();
                if (newCount != null && newCount != boardedCount) {
                  boardedCount = newCount;
                  if (!_isDisposed) {
                    _boardedCountStreamController.add(boardedCount);
                  }
                  onBoardedCountChanged?.call(boardedCount);
                }
              }
            } catch (e) {
              safePrint('Error decoding subscription payload: $e');
            }
          }
        },
        onError: (err) => safePrint('Subscription error: $err'),
      );
    } catch (e) {
      safePrint('Error initiating subscription: $e');
    }
  }

  Future<void> triggerSos() async {
    if (activeTripId == null) return;
    final Map<String, dynamic>? res = await _invokeDriverTripAction(
      action: 'sos',
      tripId: activeTripId,
    );
    if (res != null && res['success'] != true) {
      throw res['message'] as String? ?? 'Failed to trigger SOS.';
    }
  }

  void _stopLocalTimers() {
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _simulatedTimer?.cancel();
    _simulatedTimer = null;
    _qrTimer?.cancel();
    _qrTimer = null;
    _subscription?.cancel();
    _subscription = null;
  }

  Future<void> endTrip() async {
    _stopLocalTimers();
    if (!_isDisposed) {
      gpsStatus.value = 'Trip Concluded';
    }

    if (activeTripId != null) {
      try {
        await _invokeDriverTripAction(
          action: 'end',
          tripId: activeTripId,
        );
      } catch (e) {
        safePrint('Error completing trip: $e');
      }
      activeTripId = null;
    }

    isTripActive = false;
    currentQrPayload = '';
    if (!_isDisposed) {
      _tripStateStreamController.add(false);
    }
    onTripStateChanged?.call(false);
  }

  void dispose() {
    _isDisposed = true;
    _stopLocalTimers();
    gpsStatus.dispose();
    _qrStreamController.close();
    _boardedCountStreamController.close();
    _tripStateStreamController.close();
  }
}
