import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/main.dart';

void main() {
  testWidgets('VahanSync smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const VahanSyncApp());
    expect(find.text('VahanSync'), findsOneWidget);
    expect(find.text('Driver Mode'), findsOneWidget);
  });
}
