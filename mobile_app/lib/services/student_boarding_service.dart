// ignore_for_file: unnecessary_import
import 'dart:async';
import 'dart:convert';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:crypto/crypto.dart';
import 'package:geolocator/geolocator.dart';

class BusLocationData {
  final String busId;
  final String tripId;
  final double lat;
  final double lng;
  final double speed;
  final double heading;
  final int boardedCount;
  final DateTime updatedAt;

  const BusLocationData({
    required this.busId,
    required this.tripId,
    required this.lat,
    required this.lng,
    required this.speed,
    required this.heading,
    required this.boardedCount,
    required this.updatedAt,
  });

  factory BusLocationData.initial({String busId = 'BUS_01'}) {
    return BusLocationData(
      busId: busId,
      tripId: '',
      lat: 16.4632,
      lng: 80.5064,
      speed: 0.0,
      heading: 0.0,
      boardedCount: 0,
      updatedAt: DateTime.now(),
    );
  }

  factory BusLocationData.fromJson(Map<String, dynamic> json) {
    return BusLocationData(
      busId: json['busId'] as String? ?? 'BUS_01',
      tripId: json['tripId'] as String? ?? '',
      lat: (json['lat'] as num?)?.toDouble() ?? 16.4632,
      lng: (json['lng'] as num?)?.toDouble() ?? 80.5064,
      speed: (json['speed'] as num?)?.toDouble() ?? 0.0,
      heading: (json['heading'] as num?)?.toDouble() ?? 0.0,
      boardedCount: json['boardedCount'] as int? ?? 0,
      updatedAt: DateTime.now(),
    );
  }
}

class BoardingResult {
  final bool isSuccess;
  final String message;
  final String? tripId;
  final String? busId;
  final String? studentId;
  final String? studentName;
  final DateTime? boardedAt;

  const BoardingResult({
    required this.isSuccess,
    required this.message,
    this.tripId,
    this.busId,
    this.studentId,
    this.studentName,
    this.boardedAt,
  });
}

class StudentBoardingService {
  static const String targetBusId = 'BUS_01';
  static const String qrSecret = 'SECRET_KEY_BUS_01_2026';

  BusLocationData _currentBusLocation = BusLocationData.initial();
  BusLocationData get currentBusLocation => _currentBusLocation;

  final Set<String> _boardedTrips = <String>{};

  final StreamController<BusLocationData> _busLocationStreamController =
      StreamController<BusLocationData>.broadcast();
  Stream<BusLocationData> get busLocationStream =>
      _busLocationStreamController.stream;

  StreamSubscription<GraphQLResponse<String>>? _locationSubscription;

  StudentBoardingService() {
    initLiveLocation();
  }

  /// Explicit Runtime Permission Helper for Geolocator
  static Future<void> ensureLocationPermission() async {
    final bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw 'Turn on Phone GPS / Location Services to verify bus proximity.';
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw 'Location permission was denied. Please allow location access to board.';
      }
    }

    if (permission == LocationPermission.deniedForever) {
      throw 'Location permission is permanently denied. Please enable it in device app settings.';
    }
  }

  Future<void> initLiveLocation() async {
    await fetchInitialBusLocation();
    subscribeToBusLocation();
  }

  Future<void> fetchInitialBusLocation() async {
    const String getBusLocationQuery = r'''
      query GetBusLocation($busId: ID!) {
        getBusLocation(busId: $busId) {
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
      final request = GraphQLRequest<String>(
        document: getBusLocationQuery,
        variables: {'busId': targetBusId},
      );
      final response = await Amplify.API.query(request: request).response;

      if (response.data != null) {
        final Map<String, dynamic> data =
            jsonDecode(response.data!) as Map<String, dynamic>;
        final Map<String, dynamic>? loc =
            data['getBusLocation'] as Map<String, dynamic>?;
        if (loc != null) {
          _currentBusLocation = BusLocationData.fromJson(loc);
          _busLocationStreamController.add(_currentBusLocation);
        }
      }
    } catch (e) {
      safePrint('Error fetching initial bus location: $e');
    }
  }

  void subscribeToBusLocation() {
    _locationSubscription?.cancel();

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
      final request = GraphQLRequest<String>(
        document: onUpdateBusLocationSubscription,
      );
      final Stream<GraphQLResponse<String>> operation = Amplify.API.subscribe(
        request,
        onEstablished: () => safePrint('Student onUpdateBusLocation subscription active'),
      );

      _locationSubscription = operation.listen(
        (event) {
          if (event.data != null) {
            try {
              final Map<String, dynamic> map =
                  jsonDecode(event.data!) as Map<String, dynamic>;
              final Map<String, dynamic>? loc =
                  map['onUpdateBusLocation'] as Map<String, dynamic>?;
              if (loc != null && loc['busId'] == targetBusId) {
                _currentBusLocation = BusLocationData.fromJson(loc);
                _busLocationStreamController.add(_currentBusLocation);
              }
            } catch (e) {
              safePrint('Error decoding bus location subscription event: $e');
            }
          }
        },
        onError: (err) => safePrint('BusLocation subscription error: $err'),
      );
    } catch (e) {
      safePrint('Failed to start bus location subscription: $e');
    }
  }

  Future<BoardingResult> verifyAndBoard(
    String rawQrPayload,
    String studentId,
    String studentName, {
    bool bypassGpsCheck = false,
  }) async {
    final List<String> parts = rawQrPayload.trim().split('|');
    if (parts.length != 4) {
      return const BoardingResult(
        isSuccess: false,
        message: 'Invalid QR format. Expected busId|tripId|timestamp|signature.',
      );
    }

    final String qrBusId = parts[0];
    final String qrTripId = parts[1];
    final String qrTimestampStr = parts[2];
    final String qrSignature = parts[3];

    // Check 1: Verify HMAC-SHA256 signature against 'SECRET_KEY_BUS_01_2026'
    final String rawData = '$qrBusId|$qrTripId|$qrTimestampStr';
    final hmac = Hmac(sha256, utf8.encode(qrSecret));
    final String expectedSignature =
        hmac.convert(utf8.encode(rawData)).toString();

    if (qrSignature != expectedSignature) {
      return const BoardingResult(
        isSuccess: false,
        message:
            'Anti-Proxy Check Failed: Invalid QR Signature. QR code is counterfeit or tampered.',
      );
    }

    // Check 2: Verify now - timestamp <= 30 seconds
    final int? qrTimestamp = int.tryParse(qrTimestampStr);
    if (qrTimestamp == null) {
      return const BoardingResult(
        isSuccess: false,
        message: 'Anti-Proxy Check Failed: Malformed QR timestamp.',
      );
    }

    final int currentEpoch = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final int ageSeconds = currentEpoch - qrTimestamp;

    if (ageSeconds > 30) {
      return BoardingResult(
        isSuccess: false,
        message:
            'Anti-Proxy Check Failed: QR Code Expired (${ageSeconds}s old > 30s limit). Screenshots/forwarded codes are invalid.',
      );
    }

    // Check 3: Geolocator distance check <= 50 meters
    double studentLat = _currentBusLocation.lat;
    double studentLng = _currentBusLocation.lng;

    if (!bypassGpsCheck) {
      try {
        await ensureLocationPermission();
      } catch (e) {
        return BoardingResult(
          isSuccess: false,
          message: 'Location Error: $e',
        );
      }

      try {
        final Position position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 4),
          ),
        );
        studentLat = position.latitude;
        studentLng = position.longitude;
      } catch (e) {
        safePrint('Error obtaining student location: $e');
      }

      final double distanceInMeters = Geolocator.distanceBetween(
        studentLat,
        studentLng,
        _currentBusLocation.lat,
        _currentBusLocation.lng,
      );

      if (distanceInMeters > 50.0) {
        return BoardingResult(
          isSuccess: false,
          message:
              'Anti-Proxy Check Failed: Proximity violation. You are ${distanceInMeters.toStringAsFixed(1)}m from the bus (> 50m radius).',
        );
      }
    }

    // Check 4: Prevent duplicate boarding for the same tripId
    final String tripKey = '$studentId:$qrTripId';
    if (_boardedTrips.contains(tripKey)) {
      return BoardingResult(
        isSuccess: false,
        message: 'Duplicate Boarding: Already boarded for Trip $qrTripId.',
      );
    }

    // Mark boarded locally
    _boardedTrips.add(tripKey);
    final DateTime boardedAt = DateTime.now();

    // Execute createAttendanceLog mutation
    const String createAttendanceLogMutation = r'''
      mutation CreateAttendanceLog($input: CreateAttendanceLogInput!) {
        createAttendanceLog(input: $input) {
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
      final logRequest = GraphQLRequest<String>(
        document: createAttendanceLogMutation,
        variables: {
          'input': {
            'tripId': qrTripId,
            'busId': qrBusId,
            'studentId': studentId,
            'studentName': studentName,
            'scanLat': studentLat,
            'scanLng': studentLng,
            'scannedAt': boardedAt.toUtc().toIso8601String(),
          }
        },
      );
      await Amplify.API.mutate(request: logRequest).response;
    } catch (e) {
      safePrint('Error creating attendance log: $e');
    }

    // Increment BusLocation.boardedCount via updateBusLocation
    const String updateBusLocationMutation = r'''
      mutation UpdateBusLocation($input: UpdateBusLocationInput!) {
        updateBusLocation(input: $input) {
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

    final int nextCount = _currentBusLocation.boardedCount + 1;
    try {
      final updateLocRequest = GraphQLRequest<String>(
        document: updateBusLocationMutation,
        variables: {
          'input': {
            'busId': qrBusId,
            'boardedCount': nextCount,
          }
        },
      );
      await Amplify.API.mutate(request: updateLocRequest).response;
      _currentBusLocation = BusLocationData(
        busId: _currentBusLocation.busId,
        tripId: _currentBusLocation.tripId,
        lat: _currentBusLocation.lat,
        lng: _currentBusLocation.lng,
        speed: _currentBusLocation.speed,
        heading: _currentBusLocation.heading,
        boardedCount: nextCount,
        updatedAt: DateTime.now(),
      );
      _busLocationStreamController.add(_currentBusLocation);
    } catch (e) {
      safePrint('Error updating boarded count: $e');
    }

    return BoardingResult(
      isSuccess: true,
      message: 'Boarding Verified! Attendance logged successfully.',
      tripId: qrTripId,
      busId: qrBusId,
      studentId: studentId,
      studentName: studentName,
      boardedAt: boardedAt,
    );
  }

  void dispose() {
    _locationSubscription?.cancel();
    _busLocationStreamController.close();
  }
}
