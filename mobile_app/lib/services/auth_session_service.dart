import 'dart:convert';
import 'package:amplify_flutter/amplify_flutter.dart';
import '../models/user_session.dart';

class AuthLoginResult {
  final bool success;
  final String message;
  final UserSession? session;

  const AuthLoginResult({
    required this.success,
    required this.message,
    this.session,
  });
}

Map<String, dynamic>? decodeAwsJsonPayload(dynamic raw) {
  if (raw == null) return null;
  if (raw is Map<String, dynamic>) return raw;
  if (raw is String) {
    final dynamic first = jsonDecode(raw);
    if (first is String) {
      final dynamic second = jsonDecode(first);
      if (second is Map<String, dynamic>) return second;
    } else if (first is Map<String, dynamic>) {
      return first;
    }
  }
  return null;
}

class AuthSessionService {
  static Future<AuthLoginResult> login({
    required String loginId,
    required String pin,
    required String role,
  }) async {
    const String mobileLoginMutation = r'''
      mutation MobileLogin($loginId: String!, $pin: String!, $role: String!) {
        mobileLogin(loginId: $loginId, pin: $pin, role: $role)
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: mobileLoginMutation,
        variables: {
          'loginId': loginId.trim(),
          'pin': pin.trim(),
          'role': role.trim().toLowerCase(),
        },
        authorizationMode: APIAuthorizationType.apiKey,
      );

      final response = await Amplify.API.mutate(request: request).response;
      if (response.errors.isNotEmpty) {
        return AuthLoginResult(
          success: false,
          message: response.errors.first.message,
        );
      }

      if (response.data == null) {
        return const AuthLoginResult(
          success: false,
          message: 'No response from authentication service.',
        );
      }

      final Map<String, dynamic>? outer =
          jsonDecode(response.data!) as Map<String, dynamic>?;
      final Map<String, dynamic>? payload =
          decodeAwsJsonPayload(outer?['mobileLogin']);

      if (payload == null) {
        return const AuthLoginResult(
          success: false,
          message: 'Malformed authentication response.',
        );
      }

      if (payload['success'] != true) {
        return AuthLoginResult(
          success: false,
          message: payload['message'] as String? ?? 'Authentication failed.',
        );
      }

      final session = UserSession.fromLoginResponse(payload);
      if (session.sessionToken.isEmpty) {
        return const AuthLoginResult(
          success: false,
          message: 'Server did not return a valid session token.',
        );
      }

      return AuthLoginResult(
        success: true,
        message: payload['message'] as String? ?? 'Authenticated.',
        session: session,
      );
    } catch (e) {
      safePrint('Mobile login error: $e');
      return AuthLoginResult(
        success: false,
        message: 'Network error while signing in. Check internet connection.',
      );
    }
  }

  static Future<({bool success, String message})> changePin({
    required String sessionToken,
    required String currentPin,
    required String newPin,
  }) async {
    const String changePinMutation = r'''
      mutation ChangeMobilePin(
        $sessionToken: String!
        $currentPin: String!
        $newPin: String!
      ) {
        changeMobilePin(
          sessionToken: $sessionToken
          currentPin: $currentPin
          newPin: $newPin
        )
      }
    ''';

    try {
      final request = GraphQLRequest<String>(
        document: changePinMutation,
        variables: {
          'sessionToken': sessionToken,
          'currentPin': currentPin.trim(),
          'newPin': newPin.trim(),
        },
        authorizationMode: APIAuthorizationType.apiKey,
      );
      final response = await Amplify.API.mutate(request: request).response;
      if (response.errors.isNotEmpty) {
        return (success: false, message: response.errors.first.message);
      }
      if (response.data == null) {
        return (success: false, message: 'No response from server.');
      }
      final Map<String, dynamic>? outer =
          jsonDecode(response.data!) as Map<String, dynamic>?;
      final Map<String, dynamic>? payload =
          decodeAwsJsonPayload(outer?['changeMobilePin']);
      return (
        success: payload?['success'] == true,
        message: payload?['message'] as String? ?? 'Could not change PIN.',
      );
    } catch (e) {
      safePrint('Change PIN error: $e');
      return (
        success: false,
        message: 'Network error while updating PIN. Please try again.',
      );
    }
  }
}
