import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';
import 'package:mobile_app/models/user_session.dart';
import 'package:mobile_app/services/auth_session_service.dart';

void main() {
  testWidgets('VahanSync login role switch & validation test',
      (WidgetTester tester) async {
    await tester.pumpWidget(const VahanSyncApp());
    expect(find.text('VahanSync'), findsOneWidget);
    expect(find.text('Driver Mode'), findsOneWidget);
    expect(find.text('Passenger Mode'), findsOneWidget);
    expect(find.text('Parent Mode'), findsOneWidget);
    expect(find.text('Driver ID'), findsOneWidget);

    // Switch to Passenger Mode
    await tester.tap(find.text('Passenger Mode'));
    await tester.pump();
    expect(find.text('Login ID'), findsOneWidget);
    expect(find.text('Login as Passenger'), findsOneWidget);

    // Empty ID/PIN should trigger validation snackbar
    await tester.tap(find.text('Login as Passenger'));
    await tester.pump();
    expect(find.text('Please enter both your ID and PIN.'), findsOneWidget);
  });

  test('UserSession and double-encoded AWSJSON decoding keep secrets role-scoped', () {
    const doubleEncoded =
        '"{\\"success\\":true,\\"sessionToken\\":\\"tok.sig\\",\\"user\\":{\\"userId\\":\\"u1\\",\\"loginId\\":\\"student_01\\",\\"fullName\\":\\"Aarav\\",\\"role\\":\\"student\\",\\"assignedBusId\\":\\"BUS_01\\",\\"feePaid\\":true},\\"bus\\":{\\"busId\\":\\"BUS_01\\",\\"routeName\\":\\"Campus Express\\",\\"capacity\\":45,\\"qrSecret\\":null}}"';

    final decoded = decodeAwsJsonPayload(doubleEncoded);
    expect(decoded, isNotNull);
    final session = UserSession.fromLoginResponse(decoded!);
    expect(session.loginId, 'student_01');
    expect(session.assignedBusId, 'BUS_01');
    expect(session.qrSecret, isNull);
    expect(session.feePaid, isTrue);
  });
}
