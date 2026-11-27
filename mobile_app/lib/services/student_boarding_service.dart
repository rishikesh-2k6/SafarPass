// ignore_for_file: unnecessary_import
import 'dart:async';
import 'dart:convert';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:geolocator/geolocator.dart';
import '../models/user_session.dart';
import 'auth_session_service.dart';

class BusLocationData {
  final String busId;
  final String tripId;
  final double lat;
  final double lng;
  final double speed;
  final double heading;
  final int boardedCount;
  final String destination;
  final String? tripDirection;
  final String? stopsJson;
  final String? routePolylineJson;
  final String? tripStatus;
  final String? sosCategory;
  final String? sosTriggerSource;
  final int sosReporterCount;
  final String? buzzerAlertId;
  final String? buzzerTarget;
  final String? buzzerMessage;
  final DateTime updatedAt;
  final bool hasServerFix;

  const BusLocationData({
    required this.busId,
    required this.tripId,
    required this.lat,
    required this.lng,
    required this.speed,
    required this.heading,
    required this.boardedCount,
    this.destination = '',
    this.tripDirection,
    this.stopsJson,
    this.routePolylineJson,
    this.tripStatus,
    this.sosCategory,
    this.sosTriggerSource,
    this.sosReporterCount = 0,
    this.buzzerAlertId,
    this.buzzerTarget,
    this.buzzerMessage,
    required this.updatedAt,
    this.hasServerFix = false,
  });

  factory BusLocationData.initial({
    String busId = 'BUS_01',
    String destination = '',
    String? stopsJson,
    String? routePolylineJson,
  }) {
    return BusLocationData(
      busId: busId,
      tripId: '',
      lat: 16.4632,
      lng: 80.5064,
      speed: 0.0,
      heading: 0.0,
      boardedCount: 0,
      destination: destination,
      stopsJson: stopsJson,
      routePolylineJson: routePolylineJson,
      updatedAt: DateTime.now(),
      hasServerFix: false,
    );
  }

  factory BusLocationData.fromJson(Map<String, dynamic> json) {
    final String? updatedAtStr = json['updatedAt'] as String?;
    return BusLocationData(
      busId: json['busId'] as String? ?? 'BUS_01',
      tripId: json['tripId'] as String? ?? '',
      lat: (json['lat'] as num?)?.toDouble() ?? 16.4632,
      lng: (json['lng'] as num?)?.toDouble() ?? 80.5064,
      speed: (json['speed'] as num?)?.toDouble() ?? 0.0,
      heading: (json['heading'] as num?)?.toDouble() ?? 0.0,
      boardedCount: (json['boardedCount'] as num?)?.toInt() ?? 0,
      destination: (json['destination'] as String?) ?? '',
      tripDirection: json['tripDirection'] as String?,
      stopsJson: json['stopsJson'] as String?,
      routePolylineJson: json['routePolylineJson'] as String?,
      tripStatus: json['tripStatus'] as String?,
      sosCategory: json['sosCategory'] as String?,
      sosTriggerSource: json['sosTriggerSource'] as String?,
      sosReporterCount: (json['sosReporterCount'] as num?)?.toInt() ?? 0,
      buzzerAlertId: json['buzzerAlertId'] as String?,
      buzzerTarget: json['buzzerTarget'] as String?,
      buzzerMessage: json['buzzerMessage'] as String?,
      updatedAt: updatedAtStr != null
          ? (DateTime.tryParse(updatedAtStr)?.toLocal() ?? DateTime.now())
          : DateTime.now(),
      hasServerFix: true,
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

class WardTripLegStatus {
  final String? tripId;
  final String direction;
  final String status;
  final String? destination;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final bool wardBoarded;
  final DateTime? boardedAt;

  const WardTripLegStatus({
    this.tripId,
    required this.direction,
    this.status = 'not_started',
    this.destination,
    this.startedAt,
    this.endedAt,
    this.wardBoarded = false,
    this.boardedAt,
  });

  factory WardTripLegStatus.fromJson(
    dynamic raw, {
    required String fallbackDirection,
  }) {
    if (raw is! Map) {
      return WardTripLegStatus(direction: fallbackDirection);
    }
    final Map<String, dynamic> map = Map<String, dynamic>.from(raw);
    final String? startStr = map['startedAt'] as String?;
    final String? endStr = map['endedAt'] as String?;
    final String? boardedStr = map['boardedAt'] as String?;
    return WardTripLegStatus(
      tripId: map['tripId'] as String?,
      direction: (map['direction'] as String?) ?? fallbackDirection,
      status: (map['status'] as String?) ?? 'not_started',
      destination: map['destination'] as String?,
      startedAt: startStr != null ? DateTime.tryParse(startStr) : null,
      endedAt: endStr != null ? DateTime.tryParse(endStr) : null,
      wardBoarded: map['wardBoarded'] as bool? ?? false,
      boardedAt: boardedStr != null ? DateTime.tryParse(boardedStr) : null,
    );
  }
}

class ParentWardStatusData {
  final bool success;
  final String? message;
  final String? wardName;
  final String? wardLoginId;
  final String? assignedBusId;
  final bool feePaid;
  final bool boarded;
  final DateTime? boardedAt;
  final String? boardedBusId;
  final String activeTripStatus;
  final String? activeTripDirection;
  final String? activeDriverId;
  final WardTripLegStatus campusTrip;
  final WardTripLegStatus homeTrip;

  const ParentWardStatusData({
    required this.success,
    this.message,
    this.wardName,
    this.wardLoginId,
    this.assignedBusId,
    this.feePaid = true,
    this.boarded = false,
    this.boardedAt,
    this.boardedBusId,
    this.activeTripStatus = 'idle',
    this.activeTripDirection,
    this.activeDriverId,
    this.campusTrip = const WardTripLegStatus(direction: 'to_campus'),
    this.homeTrip = const WardTripLegStatus(direction: 'to_home'),
  });
}

class StudentBoardingService {
  final UserSession session;

  String get targetBusId => session.wardBusId ?? session.assignedBusId;

  late BusLocationData _currentBusLocation;
  BusLocationData get currentBusLocation => _currentBusLocation;

  final StreamController<BusLocationData> _busLocationStreamController =
      StreamController<BusLocationData>.broadcast();
  Stream<BusLocationData> get busLocationStream =>
      _busLocationStreamController.stream;

  StreamSubscription<GraphQLResponse<String>>? _updateSubscription;
  StreamSubscription<GraphQLResponse<String>>? _createSubscription;
  Timer? _pollingTimer;
  bool _isDisposed = false;

  StudentBoardingService({required this.session}) {
    _currentBusLocation = BusLocationData.initial(
      busId: targetBusId,
      destination: session.destination ?? '',
      stopsJson: session.stopsJson,
      routePolylineJson: session.routePolylineJson,
    );
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
    _pollingTimer?.cancel();
    // Poll every 4s alongside WebSocket so cellular drops never freeze live tracking
    _pollingTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => fetchInitialBusLocation(),
    );
  }

  Future<BusLocationData?> refreshLocation() async {
    await fetchInitialBusLocation();
    return _currentBusLocation;
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
          destination
          tripDirection
          stopsJson
          routePolylineJson
          tripStatus
          sosCategory
          sosTriggerSource
          sosReporterCount
          buzzerAlertId
          buzzerTarget
          buzzerMessage
          updatedAt
        }
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: getBusLocationQuery,
        variables: {'busId': targetBusId},
        authorizationMode: APIAuthorizationType.apiKey,
      );
      final response = await Amplify.API.query(request: request).response;

      if (response.data != null && !_isDisposed) {
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
      safePrint('Error fetching bus location: $e');
    }
  }

  void subscribeToBusLocation() {
    _updateSubscription?.cancel();
    _createSubscription?.cancel();

    const String onUpdateSub = r'''
      subscription OnUpdateBusLocation {
        onUpdateBusLocation {
          busId
          tripId
          lat
          lng
          speed
          heading
          boardedCount
          destination
          tripDirection
          stopsJson
          routePolylineJson
          tripStatus
          sosCategory
          sosTriggerSource
          sosReporterCount
          buzzerAlertId
          buzzerTarget
          buzzerMessage
          updatedAt
        }
      }
    ''';

    const String onCreateSub = r'''
      subscription OnCreateBusLocation {
        onCreateBusLocation {
          busId
          tripId
          lat
          lng
          speed
          heading
          boardedCount
          destination
          tripDirection
          stopsJson
          routePolylineJson
          tripStatus
          sosCategory
          sosTriggerSource
          sosReporterCount
          buzzerAlertId
          buzzerTarget
          buzzerMessage
          updatedAt
        }
      }
    ''';

    try {
      final updateOp = Amplify.API.subscribe(
        GraphQLRequest<String>(
          document: onUpdateSub,
          authorizationMode: APIAuthorizationType.apiKey,
        ),
        onEstablished: () =>
            safePrint('Student onUpdateBusLocation subscription active'),
      );

      _updateSubscription = updateOp.listen(
        (event) => _handleSubEvent(event.data, 'onUpdateBusLocation'),
        onError: (err) => safePrint('BusLocation update sub error: $err'),
      );

      final createOp = Amplify.API.subscribe(
        GraphQLRequest<String>(
          document: onCreateSub,
          authorizationMode: APIAuthorizationType.apiKey,
        ),
      );

      _createSubscription = createOp.listen(
        (event) => _handleSubEvent(event.data, 'onCreateBusLocation'),
        onError: (err) => safePrint('BusLocation create sub error: $err'),
      );
    } catch (e) {
      safePrint('Failed to start bus location subscription: $e');
    }
  }

  void _handleSubEvent(String? rawData, String key) {
    if (rawData == null || _isDisposed) return;
    try {
      final Map<String, dynamic> map =
          jsonDecode(rawData) as Map<String, dynamic>;
      final Map<String, dynamic>? loc = map[key] as Map<String, dynamic>?;
      if (loc != null && loc['busId'] == targetBusId) {
        _currentBusLocation = BusLocationData.fromJson(loc);
        _busLocationStreamController.add(_currentBusLocation);
      }
    } catch (e) {
      safePrint('Error decoding $key event: $e');
    }
  }

  /// Server-verified boarding via transit-gateway Lambda.
  Future<BoardingResult> verifyAndBoard(
    String rawQrPayload, {
    bool bypassGpsCheck = false,
  }) async {
    final List<String> parts = rawQrPayload.trim().split('|');
    if (parts.length != 4) {
      return const BoardingResult(
        isSuccess: false,
        message: 'Invalid QR format. Expected busId|tripId|timestamp|signature.',
      );
    }

    if (!session.feePaid) {
      return const BoardingResult(
        isSuccess: false,
        message: 'Boarding Denied: Transit fee pending. Please clear dues.',
      );
    }

    double? studentLat;
    double? studentLng;

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
            timeLimit: Duration(seconds: 6),
          ),
        );
        studentLat = position.latitude;
        studentLng = position.longitude;
      } catch (e) {
        return BoardingResult(
          isSuccess: false,
          message:
              'Location Error: Unable to acquire live GPS fix ($e). Enable GPS or indoor testing.',
        );
      }
    }

    const String verifyMutation = r'''
      mutation VerifyStudentBoarding(
        $sessionToken: String!
        $qrPayload: String!
        $scanLat: Float
        $scanLng: Float
        $bypassGpsCheck: Boolean
      ) {
        verifyStudentBoarding(
          sessionToken: $sessionToken
          qrPayload: $qrPayload
          scanLat: $scanLat
          scanLng: $scanLng
          bypassGpsCheck: $bypassGpsCheck
        )
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: verifyMutation,
        variables: {
          'sessionToken': session.sessionToken,
          'qrPayload': rawQrPayload.trim(),
          'scanLat': ?studentLat,
          'scanLng': ?studentLng,
          'bypassGpsCheck': bypassGpsCheck,
        },
        authorizationMode: APIAuthorizationType.apiKey,
      );

      final response = await Amplify.API.mutate(request: request).response;
      if (response.errors.isNotEmpty) {
        return BoardingResult(
          isSuccess: false,
          message: response.errors.first.message,
        );
      }

      final Map<String, dynamic>? outer = response.data != null
          ? jsonDecode(response.data!) as Map<String, dynamic>?
          : null;
      final Map<String, dynamic>? payload =
          decodeAwsJsonPayload(outer?['verifyStudentBoarding']);

      if (payload == null) {
        return const BoardingResult(
          isSuccess: false,
          message: 'No response from boarding verification server.',
        );
      }

      if (payload['success'] != true) {
        return BoardingResult(
          isSuccess: false,
          message:
              payload['message'] as String? ?? 'Boarding verification failed.',
        );
      }

      final String? boardedAtStr = payload['boardedAt'] as String?;
      return BoardingResult(
        isSuccess: true,
        message: payload['message'] as String? ?? 'Boarding Verified!',
        tripId: payload['tripId'] as String?,
        busId: payload['busId'] as String?,
        studentId: payload['studentId'] as String?,
        studentName: payload['studentName'] as String?,
        boardedAt: boardedAtStr != null
            ? DateTime.tryParse(boardedAtStr) ?? DateTime.now()
            : DateTime.now(),
      );
    } catch (e) {
      safePrint('Error verifying boarding on server: $e');
      return const BoardingResult(
        isSuccess: false,
        message: 'Network error while verifying boarding. Please try again.',
      );
    }
  }

  Future<ParentWardStatusData> fetchParentWardStatus() async {
    const String wardQuery = r'''
      query GetParentWardStatus($sessionToken: String!) {
        getParentWardStatus(sessionToken: $sessionToken)
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: wardQuery,
        variables: {'sessionToken': session.sessionToken},
        authorizationMode: APIAuthorizationType.apiKey,
      );
      final response = await Amplify.API.query(request: request).response;
      if (response.errors.isNotEmpty || response.data == null) {
        return const ParentWardStatusData(
          success: false,
          message: 'Unable to fetch ward transit status.',
        );
      }

      final Map<String, dynamic>? outer =
          jsonDecode(response.data!) as Map<String, dynamic>?;
      final Map<String, dynamic>? payload =
          decodeAwsJsonPayload(outer?['getParentWardStatus']);
      if (payload == null || payload['success'] != true) {
        return ParentWardStatusData(
          success: false,
          message:
              payload?['message'] as String? ?? 'Failed to load ward status.',
        );
      }

      final String? boardedAtStr = payload['boardedAt'] as String?;
      return ParentWardStatusData(
        success: true,
        wardName: payload['wardName'] as String?,
        wardLoginId: payload['wardLoginId'] as String?,
        assignedBusId: payload['assignedBusId'] as String?,
        feePaid: payload['feePaid'] as bool? ?? true,
        boarded: payload['boarded'] as bool? ?? false,
        boardedAt: boardedAtStr != null ? DateTime.tryParse(boardedAtStr) : null,
        boardedBusId: payload['boardedBusId'] as String?,
        activeTripStatus: payload['activeTripStatus'] as String? ?? 'idle',
        activeTripDirection: payload['activeTripDirection'] as String?,
        activeDriverId: payload['activeDriverId'] as String?,
        campusTrip: WardTripLegStatus.fromJson(
          payload['campusTrip'],
          fallbackDirection: 'to_campus',
        ),
        homeTrip: WardTripLegStatus.fromJson(
          payload['homeTrip'],
          fallbackDirection: 'to_home',
        ),
      );
    } catch (e) {
      safePrint('Error fetching parent ward status: $e');
      return const ParentWardStatusData(
        success: false,
        message: 'Network error loading ward status.',
      );
    }
  }

  Future<({bool success, bool escalated, String message})> sendPassengerSos({
    required String category,
  }) async {
    const String sosMutation = r'''
      mutation PassengerSosAction(
        $sessionToken: String!
        $tripId: String
        $category: String!
      ) {
        passengerSosAction(
          sessionToken: $sessionToken
          tripId: $tripId
          category: $category
        )
      }
    ''';

    try {
      final String activeTripId = _currentBusLocation.tripId;
      final request = GraphQLRequest<String>(
        document: sosMutation,
        variables: {
          'sessionToken': session.sessionToken,
          if (activeTripId.isNotEmpty) 'tripId': activeTripId,
          'category': category,
        },
        authorizationMode: APIAuthorizationType.apiKey,
      );
      final response = await Amplify.API.mutate(request: request).response;
      if (response.errors.isNotEmpty || response.data == null) {
        return (
          success: false,
          escalated: false,
          message: response.errors.isNotEmpty
              ? response.errors.first.message
              : 'Failed to submit SOS report.',
        );
      }
      final Map<String, dynamic>? outer =
          jsonDecode(response.data!) as Map<String, dynamic>?;
      final Map<String, dynamic>? payload =
          decodeAwsJsonPayload(outer?['passengerSosAction']);
      return (
        success: payload?['success'] == true,
        escalated: payload?['escalated'] == true,
        message:
            payload?['message'] as String? ?? 'SOS response received from server.',
      );
    } catch (e) {
      safePrint('Error sending passenger SOS: $e');
      return (
        success: false,
        escalated: false,
        message: 'Network error sending SOS report.',
      );
    }
  }

  void dispose() {
    _isDisposed = true;
    _pollingTimer?.cancel();
    _updateSubscription?.cancel();
    _createSubscription?.cancel();
    _busLocationStreamController.close();
  }
}
