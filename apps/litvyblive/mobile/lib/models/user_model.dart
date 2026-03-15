import 'dart:convert';

class UserModel {
  final String id;
  final String username;
  final String avatarUrl;
  final int level;
  final int followers;
  final int following;
  final int totalGifts;
  final double gstBalance;
  final int talentScore;
  final String? agencyId;
  final bool isHost;

  const UserModel({
    required this.id,
    required this.username,
    this.avatarUrl = '',
    this.level = 1,
    this.followers = 0,
    this.following = 0,
    this.totalGifts = 0,
    this.gstBalance = 0.0,
    this.talentScore = 0,
    this.agencyId,
    this.isHost = false,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String? ?? '',
      username: json['username'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String? ?? '',
      level: (json['level'] as num?)?.toInt() ?? 1,
      followers: (json['followers'] as num?)?.toInt() ?? 0,
      following: (json['following'] as num?)?.toInt() ?? 0,
      totalGifts: (json['totalGifts'] as num?)?.toInt() ?? 0,
      gstBalance: (json['gstBalance'] as num?)?.toDouble() ?? 0.0,
      talentScore: (json['talentScore'] as num?)?.toInt() ?? 0,
      agencyId: json['agencyId'] as String?,
      isHost: json['isHost'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'avatarUrl': avatarUrl,
        'level': level,
        'followers': followers,
        'following': following,
        'totalGifts': totalGifts,
        'gstBalance': gstBalance,
        'talentScore': talentScore,
        'agencyId': agencyId,
        'isHost': isHost,
      };

  static UserModel fromJsonString(String src) =>
      UserModel.fromJson(json.decode(src) as Map<String, dynamic>);
}
