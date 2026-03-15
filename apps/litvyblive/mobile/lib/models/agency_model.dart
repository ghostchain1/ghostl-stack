class AgencyModel {
  final String id;
  final String name;
  final String ownerId;
  final int hostsCount;
  final double monthlyRevenue; // in GST
  final int ranking;
  final String logoUrl;
  final double commissionRate; // 0.0–1.0 (e.g. 0.3 = 30%)

  const AgencyModel({
    required this.id,
    required this.name,
    required this.ownerId,
    this.hostsCount = 0,
    this.monthlyRevenue = 0.0,
    this.ranking = 0,
    this.logoUrl = '',
    this.commissionRate = 0.3,
  });

  factory AgencyModel.fromJson(Map<String, dynamic> json) {
    return AgencyModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      ownerId: json['ownerId'] as String? ?? '',
      hostsCount: (json['hostsCount'] as num?)?.toInt() ?? 0,
      monthlyRevenue: (json['monthlyRevenue'] as num?)?.toDouble() ?? 0.0,
      ranking: (json['ranking'] as num?)?.toInt() ?? 0,
      logoUrl: json['logoUrl'] as String? ?? '',
      commissionRate: (json['commissionRate'] as num?)?.toDouble() ?? 0.3,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'ownerId': ownerId,
        'hostsCount': hostsCount,
        'monthlyRevenue': monthlyRevenue,
        'ranking': ranking,
        'logoUrl': logoUrl,
        'commissionRate': commissionRate,
      };
}
