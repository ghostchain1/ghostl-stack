class StreamModel {
  final String id;
  final String hostId;
  final String hostName;
  final String title;
  final int viewerCount;
  final String thumbnailUrl;
  final bool isPkActive;
  final bool isAvatarMode;
  final String category;
  final DateTime startedAt;

  const StreamModel({
    required this.id,
    required this.hostId,
    required this.hostName,
    this.title = '',
    this.viewerCount = 0,
    this.thumbnailUrl = '',
    this.isPkActive = false,
    this.isAvatarMode = false,
    this.category = 'general',
    required this.startedAt,
  });

  factory StreamModel.fromJson(Map<String, dynamic> json) {
    return StreamModel(
      id: json['id'] as String? ?? '',
      hostId: json['hostId'] as String? ?? '',
      hostName: json['hostName'] as String? ?? '',
      title: json['title'] as String? ?? '',
      viewerCount: (json['viewerCount'] as num?)?.toInt() ?? 0,
      thumbnailUrl: json['thumbnailUrl'] as String? ?? '',
      isPkActive: json['isPkActive'] as bool? ?? false,
      isAvatarMode: json['isAvatarMode'] as bool? ?? false,
      category: json['category'] as String? ?? 'general',
      startedAt: json['startedAt'] != null
          ? DateTime.parse(json['startedAt'] as String)
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'hostId': hostId,
        'hostName': hostName,
        'title': title,
        'viewerCount': viewerCount,
        'thumbnailUrl': thumbnailUrl,
        'isPkActive': isPkActive,
        'isAvatarMode': isAvatarMode,
        'category': category,
        'startedAt': startedAt.toIso8601String(),
      };
}
