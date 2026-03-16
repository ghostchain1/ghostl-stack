class RankingEntry {
  final int rank;
  final String userId;
  final String username;
  final int level;
  final double score; // GST earned or gifts received
  final String avatarUrl;

  const RankingEntry({
    required this.rank,
    required this.userId,
    required this.username,
    this.level = 1,
    this.score = 0.0,
    this.avatarUrl = '',
  });

  factory RankingEntry.fromJson(Map<String, dynamic> json) {
    return RankingEntry(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      userId: json['userId'] as String? ?? '',
      username: json['username'] as String? ?? '',
      level: (json['level'] as num?)?.toInt() ?? 1,
      score: (json['score'] as num?)?.toDouble() ?? 0.0,
      avatarUrl: json['avatarUrl'] as String? ?? '',
    );
  }

  /// Alias for username for call sites using e.name.
  String get name => username;

  Map<String, dynamic> toJson() => {
        'rank': rank,
        'userId': userId,
        'username': username,
        'level': level,
        'score': score,
        'avatarUrl': avatarUrl,
      };
}

class RankingModel {
  final List<RankingEntry> creators;
  final List<RankingEntry> fans;
  final List<RankingEntry> agencies;
  final List<RankingEntry> gifts;
  final DateTime updatedAt;

  const RankingModel({
    this.creators = const [],
    this.fans = const [],
    this.agencies = const [],
    this.gifts = const [],
    required this.updatedAt,
  });

  factory RankingModel.fromJson(Map<String, dynamic> json) {
    List<RankingEntry> _parseList(dynamic raw) {
      if (raw is List) {
        return raw
            .whereType<Map<String, dynamic>>()
            .map(RankingEntry.fromJson)
            .toList();
      }
      return [];
    }

    return RankingModel(
      creators: _parseList(json['creators']),
      fans: _parseList(json['fans']),
      agencies: _parseList(json['agencies']),
      gifts: _parseList(json['gifts']),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'] as String)
          : DateTime.now(),
    );
  }
}
