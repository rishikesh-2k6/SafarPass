import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

/// Singleton helper for disaster-style audio buzzer playback on Driver & Passenger devices.
class EmergencyBuzzerService {
  EmergencyBuzzerService._();
  static final EmergencyBuzzerService instance = EmergencyBuzzerService._();

  final AudioPlayer _player = AudioPlayer();
  String? _lastAlertId;
  bool _isPlaying = false;

  bool get isPlaying => _isPlaying;

  Future<void> triggerForAlert(String? alertId) async {
    if (alertId == null || alertId.isEmpty) return;
    if (_lastAlertId == alertId) return;
    _lastAlertId = alertId;
    await startLoop();
  }

  Future<void> startLoop() async {
    if (_isPlaying) return;
    _isPlaying = true;
    try {
      await _player.setReleaseMode(ReleaseMode.loop);
      await _player.setVolume(1.0);
      await _player.play(AssetSource('sounds/emergency_buzzer.wav'));
    } catch (e) {
      debugPrint('Emergency buzzer audio error: $e');
      _isPlaying = false;
    }
  }

  Future<void> stopBuzzer() async {
    _isPlaying = false;
    try {
      await _player.stop();
    } catch (e) {
      debugPrint('Error stopping emergency buzzer: $e');
    }
  }
}
