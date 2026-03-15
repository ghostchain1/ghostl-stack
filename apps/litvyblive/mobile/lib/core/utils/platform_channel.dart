import 'package:flutter/services.dart';

/// Wraps the MethodChannel bridge set up in MainActivity.kt / AppDelegate.swift.
/// Provides typed calls to native platform features.
class PlatformChannel {
  PlatformChannel._();
  static final PlatformChannel instance = PlatformChannel._();

  static const _channel = MethodChannel('com.ghostchain.litvyblive/native');

  Future<String?> getNativeDeviceId() async {
    try {
      return await _channel.invokeMethod<String>('getDeviceId');
    } on PlatformException {
      return null;
    }
  }

  Future<bool> requestCameraPermission() async {
    try {
      final granted =
          await _channel.invokeMethod<bool>('requestCameraPermission');
      return granted ?? false;
    } on PlatformException {
      return false;
    }
  }

  Future<bool> requestMicrophonePermission() async {
    try {
      final granted =
          await _channel.invokeMethod<bool>('requestMicrophonePermission');
      return granted ?? false;
    } on PlatformException {
      return false;
    }
  }

  Future<void> triggerHapticFeedback({bool heavy = false}) async {
    try {
      await _channel.invokeMethod('haptic', {'heavy': heavy});
    } on PlatformException {
      // Best-effort — ignore if unavailable
    }
  }

  Future<void> setStatusBarTheme({required bool dark}) async {
    try {
      await _channel.invokeMethod('setStatusBar', {'dark': dark});
    } on PlatformException {
      // Ignore
    }
  }
}
