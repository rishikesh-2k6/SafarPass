import 'package:flutter/material.dart';
import 'driver_screen.dart';
import 'student_screen.dart';
import 'parent_screen.dart';

enum UserRole { driver, student, parent }

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  UserRole _selectedRole = UserRole.driver;
  final TextEditingController _idController =
      TextEditingController(text: 'driver_01');
  final TextEditingController _pinController =
      TextEditingController(text: '1234');
  bool _obscurePin = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _updateDefaultCredentials(UserRole.driver);
  }

  void _updateDefaultCredentials(UserRole role) {
    setState(() {
      _selectedRole = role;
      switch (role) {
        case UserRole.driver:
          _idController.text = 'driver_01';
          _pinController.text = '1234';
          break;
        case UserRole.student:
          _idController.text = 'student_01';
          _pinController.text = '1234';
          break;
        case UserRole.parent:
          _idController.text = '9876543210';
          _pinController.text = '1234';
          break;
      }
    });
  }

  String get _idLabel {
    switch (_selectedRole) {
      case UserRole.driver:
        return 'Driver ID';
      case UserRole.student:
        return 'Student Roll Number';
      case UserRole.parent:
        return 'Parent Phone Number';
    }
  }

  String get _idHint {
    switch (_selectedRole) {
      case UserRole.driver:
        return 'e.g. driver_01';
      case UserRole.student:
        return 'e.g. 24AIE001 or student_01';
      case UserRole.parent:
        return 'e.g. 9876543210';
    }
  }

  IconData get _idIcon {
    switch (_selectedRole) {
      case UserRole.driver:
        return Icons.badge_rounded;
      case UserRole.student:
        return Icons.school_rounded;
      case UserRole.parent:
        return Icons.phone_android_rounded;
    }
  }

  String get _loginButtonText {
    switch (_selectedRole) {
      case UserRole.driver:
        return 'Login as Driver';
      case UserRole.student:
        return 'Login as Student';
      case UserRole.parent:
        return 'Login as Parent';
    }
  }

  Future<void> _handleLogin() async {
    final String id = _idController.text.trim();
    final String pin = _pinController.text.trim();

    if (id.isEmpty || pin.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Color(0xFFEF4444),
          content: Text('Please enter both your ID and PIN.'),
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 300));
    if (!mounted) return;
    setState(() => _isLoading = false);

    Widget nextScreen;
    switch (_selectedRole) {
      case UserRole.driver:
        nextScreen = const DriverScreen();
        break;
      case UserRole.student:
        nextScreen = const StudentScreen();
        break;
      case UserRole.parent:
        nextScreen = const ParentScreen();
        break;
    }

    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => nextScreen),
    );
  }

  @override
  void dispose() {
    _idController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 12),
              // Brand Header
              Center(
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF10B981), Color(0xFF059669)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF10B981).withValues(alpha: 0.35),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.directions_bus_rounded,
                    size: 46,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'VahanSync',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A),
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Smart Campus Transit',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF64748B),
                ),
              ),
              const SizedBox(height: 32),

              // Elevated Card containing Role Selector + Inputs + Action
              Container(
                padding: const EdgeInsets.all(22.0),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF0F172A).withValues(alpha: 0.05),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Sleek 3-tab Role Selector
                    Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: _buildRoleTab(
                              role: UserRole.driver,
                              label: 'Driver Mode',
                              shortLabel: 'Driver',
                              icon: Icons.drive_eta_rounded,
                            ),
                          ),
                          Expanded(
                            child: _buildRoleTab(
                              role: UserRole.student,
                              label: 'Student Mode',
                              shortLabel: 'Student',
                              icon: Icons.school_rounded,
                            ),
                          ),
                          Expanded(
                            child: _buildRoleTab(
                              role: UserRole.parent,
                              label: 'Parent Mode',
                              shortLabel: 'Parent',
                              icon: Icons.family_restroom_rounded,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // ID Input
                    Text(
                      _idLabel,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF334155),
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _idController,
                      decoration: InputDecoration(
                        prefixIcon: Icon(_idIcon, size: 20, color: const Color(0xFF64748B)),
                        hintText: _idHint,
                        hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                      ),
                    ),
                    const SizedBox(height: 18),

                    // PIN Input
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: const [
                        Text(
                          'Security PIN',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF334155),
                          ),
                        ),
                        Text(
                          '4-6 Digits',
                          style: TextStyle(
                            fontSize: 11,
                            color: Color(0xFF94A3B8),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _pinController,
                      obscureText: _obscurePin,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(
                          Icons.lock_outline_rounded,
                          size: 20,
                          color: Color(0xFF64748B),
                        ),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscurePin
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            size: 20,
                            color: const Color(0xFF64748B),
                          ),
                          onPressed: () {
                            setState(() {
                              _obscurePin = !_obscurePin;
                            });
                          },
                        ),
                        hintText: 'Enter 4-6 digit PIN',
                        hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF94A3B8)),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Full-width 52px-tall primary login button
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0F172A),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        onPressed: _isLoading ? null : _handleLogin,
                        child: _isLoading
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  color: Colors.white,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _loginButtonText,
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.3,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const Icon(Icons.arrow_forward_rounded, size: 18),
                                ],
                              ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Demo quick switch hints
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.info_outline_rounded,
                      size: 18,
                      color: Color(0xFF10B981),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Demo credentials pre-filled. Switch roles at any time.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.blueGrey.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRoleTab({
    required UserRole role,
    required String label,
    required String shortLabel,
    required IconData icon,
  }) {
    final bool isSelected = _selectedRole == role;

    return InkWell(
      onTap: () => _updateDefaultCredentials(role),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 20,
              color: isSelected ? const Color(0xFF10B981) : const Color(0xFF64748B),
            ),
            const SizedBox(height: 4),
            Text(
              // Keep label accessible for smoke test & UI
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                color: isSelected ? const Color(0xFF0F172A) : const Color(0xFF64748B),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
