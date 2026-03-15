import 'dart:convert';

/// Reputation tier matching the GhostChain reputation engine thresholds.
enum ReputationTier { bronze, silver, gold, platinum, ghost }

extension ReputationTierX on ReputationTier {
  String get label => name[0].toUpperCase() + name.substring(1);

  static ReputationTier fromString(String s) {
    return ReputationTier.values.firstWhere(
      (t) => t.name == s.toLowerCase(),
      orElse: () => ReputationTier.bronze,
    );
  }
}

/// Full identity + profile record returned from GET /identity/profile/:userId
class IdentityModel {
  final String   userId;
  final String   username;
  /// Canonical ghost handle, e.g. `@djNova.ghost`
  final String   ghostHandle;
  final String   avatarUrl;
  final String   bio;
  final Map<String, String> socialLinks;
  final int      creatorLevel;
  final int      followers;
  final int      following;
  final bool     isVerified;
  final String?  verifiedBadge;
  /// GhostChain L1 anchor tx-hash (null until anchored)
  final String?  l1AnchorTxHash;
  final String   updatedAt;

  // Reputation fields
  final int            reputationScore;
  final ReputationTier reputationTier;
  final List<String>   badges;

  const IdentityModel({
    required this.userId,
    required this.username,
    required this.ghostHandle,
    this.avatarUrl     = '',
    this.bio           = '',
    this.socialLinks   = const {},
    this.creatorLevel  = 1,
    this.followers     = 0,
    this.following     = 0,
    this.isVerified    = false,
    this.verifiedBadge,
    this.l1AnchorTxHash,
    this.updatedAt     = '',
    this.reputationScore = 0,
    this.reputationTier  = ReputationTier.bronze,
    this.badges          = const [],
  });

  factory IdentityModel.fromJson(Map<String, dynamic> json) {
    final profile    = json['profile']    as Map<String, dynamic>? ?? json;
    final reputation = json['reputation'] as Map<String, dynamic>? ?? {};

    final rawLinks = profile['socialLinks'] as Map<String, dynamic>? ?? {};
    final links = rawLinks.map((k, v) => MapEntry(k, v.toString()));

    final rawBadges = reputation['badges'] as List<dynamic>? ?? [];
    final badges = rawBadges.cast<String>();

    return IdentityModel(
      userId:          profile['userId']      as String? ?? '',
      username:        profile['username']    as String? ?? '',
      ghostHandle:     profile['ghostHandle'] as String? ?? '',
      avatarUrl:       profile['avatarUrl']   as String? ?? '',
      bio:             profile['bio']         as String? ?? '',
      socialLinks:     links,
      creatorLevel:    (profile['creatorLevel']  as num?)?.toInt() ?? 1,
      followers:       (profile['followers']     as num?)?.toInt() ?? 0,
      following:       (profile['following']     as num?)?.toInt() ?? 0,
      isVerified:      profile['isVerified']     as bool? ?? false,
      verifiedBadge:   profile['verifiedBadge']  as String?,
      l1AnchorTxHash:  profile['l1AnchorTxHash'] as String?,
      updatedAt:       profile['updatedAt']      as String? ?? '',
      reputationScore: (reputation['totalScore'] as num?)?.toInt() ?? 0,
      reputationTier:  ReputationTierX.fromString(
                         reputation['tier'] as String? ?? 'bronze'),
      badges:          badges,
    );
  }

  Map<String, dynamic> toJson() => {
    'userId':          userId,
    'username':        username,
    'ghostHandle':     ghostHandle,
    'avatarUrl':       avatarUrl,
    'bio':             bio,
    'socialLinks':     socialLinks,
    'creatorLevel':    creatorLevel,
    'followers':       followers,
    'following':       following,
    'isVerified':      isVerified,
    'verifiedBadge':   verifiedBadge,
    'l1AnchorTxHash':  l1AnchorTxHash,
    'updatedAt':       updatedAt,
    'reputationScore': reputationScore,
    'reputationTier':  reputationTier.name,
    'badges':          badges,
  };

  static IdentityModel fromJsonString(String s) =>
      IdentityModel.fromJson(json.decode(s) as Map<String, dynamic>);
}

/// Lightweight username-availability response from GET /identity/check/:username
class UsernameCheckResult {
  final String username;
  final bool   available;
  final String ghostHandle;

  const UsernameCheckResult({
    required this.username,
    required this.available,
    required this.ghostHandle,
  });

  factory UsernameCheckResult.fromJson(Map<String, dynamic> json) =>
      UsernameCheckResult(
        username:    json['username']    as String? ?? '',
        available:   json['available']  as bool?   ?? false,
        ghostHandle: json['ghostHandle'] as String? ?? '',
      );
}
