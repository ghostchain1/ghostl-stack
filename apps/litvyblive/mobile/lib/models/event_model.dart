import 'package:flutter/material.dart';

class EventModel {
  final String id;
  final String name;
  final String description;
  final DateTime endsAt;
  final double rewardPool; // in GST
  final String colorHex;
  final String iconEmoji;
  final bool isActive;

  const EventModel({
    required this.id,
    required this.name,
    this.description = '',
    required this.endsAt,
    this.rewardPool = 0.0,
    this.colorHex = '#7B2FBE',
    this.iconEmoji = '🏆',
    this.isActive = true,
  });

  factory EventModel.fromJson(Map<String, dynamic> json) {
    return EventModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      endsAt: json['endsAt'] != null
          ? DateTime.parse(json['endsAt'] as String)
          : DateTime.now().add(const Duration(days: 7)),
      rewardPool: (json['rewardPool'] as num?)?.toDouble() ?? 0.0,
      colorHex: json['colorHex'] as String? ?? '#7B2FBE',
      iconEmoji: json['iconEmoji'] as String? ?? '🏆',
      isActive: json['isActive'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'endsAt': endsAt.toIso8601String(),
        'rewardPool': rewardPool,
        'colorHex': colorHex,
        'iconEmoji': iconEmoji,
        'isActive': isActive,
      };

  Duration get timeRemaining => endsAt.difference(DateTime.now());

  Color get color {
    try {
      return Color(int.parse(colorHex.replaceFirst('#', '0xFF')));
    } catch (_) {
      return const Color(0xFF7B2FBE);
    }
  }
}
