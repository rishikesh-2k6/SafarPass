import 'package:flutter/material.dart';
import '../services/auth_session_service.dart';

Future<void> showChangePinDialog(
  BuildContext context, {
  required String sessionToken,
}) async {
  final currentCtrl = TextEditingController();
  final newCtrl = TextEditingController();
  final confirmCtrl = TextEditingController();
  bool obscureCurrent = true;
  bool obscureNew = true;
  bool isSaving = false;
  String? errorText;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setDialogState) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.lock_reset_rounded, color: Color(0xFF059669)),
            SizedBox(width: 8),
            Text('Change Security PIN'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Enter your current PIN (first 6 digits of phone if auto-assigned) and pick a new 4–6 digit PIN.',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: currentCtrl,
                obscureText: obscureCurrent,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  counterText: '',
                  labelText: 'Current PIN',
                  suffixIcon: IconButton(
                    icon: Icon(
                      obscureCurrent
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 18,
                    ),
                    onPressed: () =>
                        setDialogState(() => obscureCurrent = !obscureCurrent),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: newCtrl,
                obscureText: obscureNew,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  counterText: '',
                  labelText: 'New PIN (4–6 digits)',
                  suffixIcon: IconButton(
                    icon: Icon(
                      obscureNew
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      size: 18,
                    ),
                    onPressed: () =>
                        setDialogState(() => obscureNew = !obscureNew),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: confirmCtrl,
                obscureText: obscureNew,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                  counterText: '',
                  labelText: 'Confirm New PIN',
                ),
              ),
              if (errorText != null) ...[
                const SizedBox(height: 10),
                Text(
                  errorText!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFFDC2626),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: isSaving ? null : () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF059669),
              foregroundColor: Colors.white,
            ),
            onPressed: isSaving
                ? null
                : () async {
                    final cur = currentCtrl.text.trim();
                    final next = newCtrl.text.trim();
                    final conf = confirmCtrl.text.trim();
                    if (!RegExp(r'^\d{4,6}$').hasMatch(next)) {
                      setDialogState(() =>
                          errorText = 'New PIN must be 4 to 6 numeric digits.');
                      return;
                    }
                    if (next != conf) {
                      setDialogState(
                          () => errorText = 'New PIN entries do not match.');
                      return;
                    }
                    setDialogState(() {
                      isSaving = true;
                      errorText = null;
                    });
                    final res = await AuthSessionService.changePin(
                      sessionToken: sessionToken,
                      currentPin: cur,
                      newPin: next,
                    );
                    if (!ctx.mounted) return;
                    if (res.success) {
                      Navigator.pop(ctx);
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: const Color(0xFF10B981),
                            content: Text(res.message),
                          ),
                        );
                      }
                    } else {
                      setDialogState(() {
                        isSaving = false;
                        errorText = res.message;
                      });
                    }
                  },
            child: Text(isSaving ? 'Updating...' : 'Save PIN'),
          ),
        ],
      ),
    ),
  );

  currentCtrl.dispose();
  newCtrl.dispose();
  confirmCtrl.dispose();
}
