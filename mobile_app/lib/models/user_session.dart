class UserSession {
  final String sessionToken;
  final String userId;
  final String loginId;
  final String fullName;
  final String role;
  final String assignedBusId;
  final String? parentOfStudentId;
  final bool feePaid;
  final String? feeValidUntil;
  final String? feeReceiptId;
  final String? phone;
  final bool busOverrideActive;
  final String routeName;
  final String? destination;
  final String? stopsJson;
  final String? routePolylineJson;
  final int busCapacity;
  final String? qrSecret;

  // Linked ward details for parent accounts
  final String? wardLoginId;
  final String? wardName;
  final String? wardBusId;
  final bool wardFeePaid;

  const UserSession({
    required this.sessionToken,
    required this.userId,
    required this.loginId,
    required this.fullName,
    required this.role,
    required this.assignedBusId,
    this.parentOfStudentId,
    required this.feePaid,
    this.feeValidUntil,
    this.feeReceiptId,
    this.phone,
    this.busOverrideActive = false,
    required this.routeName,
    this.destination,
    this.stopsJson,
    this.routePolylineJson,
    required this.busCapacity,
    this.qrSecret,
    this.wardLoginId,
    this.wardName,
    this.wardBusId,
    this.wardFeePaid = true,
  });

  factory UserSession.fromLoginResponse(Map<String, dynamic> data) {
    final user = (data['user'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final bus = data['bus'] as Map<String, dynamic>?;
    final ward = data['ward'] as Map<String, dynamic>?;

    final String assignedBus =
        (user['assignedBusId'] as String?) ?? (bus?['busId'] as String?) ?? 'BUS_01';

    return UserSession(
      sessionToken: data['sessionToken'] as String? ?? '',
      userId: user['userId'] as String? ?? '',
      loginId: user['loginId'] as String? ?? '',
      fullName: user['fullName'] as String? ?? 'User',
      role: user['role'] as String? ?? 'student',
      assignedBusId: assignedBus,
      parentOfStudentId: user['parentOfStudentId'] as String?,
      feePaid: user['feePaid'] as bool? ?? true,
      feeValidUntil: user['feeValidUntil'] as String?,
      feeReceiptId: user['feeReceiptId'] as String?,
      phone: user['phone'] as String?,
      busOverrideActive: user['busOverrideActive'] as bool? ?? false,
      routeName: (bus?['routeName'] as String?) ?? 'Campus Transit Route',
      destination: bus?['destination'] as String?,
      stopsJson: bus?['stopsJson'] as String?,
      routePolylineJson: bus?['routePolylineJson'] as String?,
      busCapacity: (bus?['capacity'] as num?)?.toInt() ?? 45,
      qrSecret: bus?['qrSecret'] as String?,
      wardLoginId: ward?['loginId'] as String? ?? user['parentOfStudentId'] as String?,
      wardName: ward?['fullName'] as String?,
      wardBusId: ward?['assignedBusId'] as String? ?? assignedBus,
      wardFeePaid: ward?['feePaid'] as bool? ?? true,
    );
  }
}
