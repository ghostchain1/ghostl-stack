class GiftModel {
  final String id;
  final String name;
  final String icon;
  final int price; // in GST micro-units (1 = 1 GST for display purposes)
  final String? animationType;
  final bool isNft;

  const GiftModel({
    required this.id,
    required this.name,
    required this.icon,
    required this.price,
    this.animationType,
    this.isNft = false,
  });

  factory GiftModel.fromJson(Map<String, dynamic> json) {
    return GiftModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      icon: json['icon'] as String? ?? '🎁',
      price: (json['price'] as num?)?.toInt() ?? 1,
      animationType: json['animationType'] as String?,
      isNft: json['isNft'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'icon': icon,
        'price': price,
        'animationType': animationType,
        'isNft': isNft,
      };

  // Canonical gift catalog (GhostL3 on-chain price, denominated in GST)
  static const List<GiftModel> catalog = [
    GiftModel(id: 'rose', name: 'Rose', icon: '🌹', price: 1),
    GiftModel(id: 'heart', name: 'Heart', icon: '💖', price: 5),
    GiftModel(id: 'star', name: 'Star', icon: '⭐', price: 10),
    GiftModel(id: 'crown', name: 'Crown', icon: '👑', price: 50, animationType: 'crown_float'),
    GiftModel(id: 'rocket', name: 'Rocket', icon: '🚀', price: 100, animationType: 'rocket_launch'),
    GiftModel(id: 'gem', name: 'Gem', icon: '💎', price: 500, animationType: 'gem_explosion'),
    GiftModel(id: 'diamond', name: 'Diamond', icon: '🔷', price: 1000, animationType: 'gift_storm'),
    GiftModel(id: 'dragon', name: 'Dragon', icon: '🐉', price: 5000, animationType: 'dragon', isNft: true),
  ];
}
