package com.ghostchain.litvyblive

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channel = "com.ghostchain.litvyblive/native"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getDeviceId" -> {
                        val id = android.provider.Settings.Secure.getString(
                            contentResolver,
                            android.provider.Settings.Secure.ANDROID_ID,
                        )
                        result.success(id)
                    }
                    "haptic" -> {
                        val heavy = call.argument<Boolean>("heavy") ?: false
                        val vibrator = if (android.os.Build.VERSION.SDK_INT >= 31) {
                            val vm = getSystemService(android.os.VibratorManager::class.java)
                            vm.defaultVibrator
                        } else {
                            @Suppress("DEPRECATION")
                            getSystemService(VIBRATOR_SERVICE) as android.os.Vibrator
                        }
                        if (android.os.Build.VERSION.SDK_INT >= 26) {
                            vibrator.vibrate(
                                android.os.VibrationEffect.createOneShot(
                                    if (heavy) 80L else 40L,
                                    android.os.VibrationEffect.DEFAULT_AMPLITUDE,
                                )
                            )
                        } else {
                            @Suppress("DEPRECATION")
                            vibrator.vibrate(if (heavy) 80L else 40L)
                        }
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
