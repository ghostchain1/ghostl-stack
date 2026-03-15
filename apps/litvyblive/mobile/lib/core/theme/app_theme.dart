import 'package:flutter/material.dart';

class AppTheme {
  AppTheme._();

  static const Color brandPurple = Color(0xFF7B2FBE);
  static const Color brandGold = Color(0xFFFFD700);
  static const Color brandPink = Color(0xFFFF2D78);
  static const Color ghostBlue = Color(0xFF00D4FF);
  static const Color darkBg = Color(0xFF0A0A12);
  static const Color darkCard = Color(0xFF13131F);
  static const Color darkSurface = Color(0xFF1A1A2E);

  static ThemeData get darkTheme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: darkBg,
        primaryColor: brandPurple,
        colorScheme: const ColorScheme.dark(
          primary: brandPurple,
          secondary: brandGold,
          tertiary: brandPink,
          surface: darkCard,
          background: darkBg,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: darkBg,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        bottomNavigationBarTheme: const BottomNavigationBarThemeData(
          backgroundColor: darkCard,
          selectedItemColor: brandPurple,
          unselectedItemColor: Colors.white54,
          type: BottomNavigationBarType.fixed,
        ),
        cardTheme: const CardTheme(
          color: darkCard,
          elevation: 4,
        ),
        textTheme: const TextTheme(
          headlineLarge: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
          bodyLarge: TextStyle(color: Colors.white),
          bodyMedium: TextStyle(color: Colors.white70),
        ),
      );
}
