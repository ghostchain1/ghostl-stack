class GameModel {
  final String id;
  final String name;
  final String iconEmoji;
  final int entryFee; // in GST micro-units
  final int minPlayers;
  final int maxPlayers;
  final bool isAvailable;
  final String category;

  const GameModel({
    required this.id,
    required this.name,
    required this.iconEmoji,
    required this.entryFee,
    this.minPlayers = 1,
    this.maxPlayers = 10,
    this.isAvailable = true,
    this.category = 'casual',
  });

  factory GameModel.fromJson(Map<String, dynamic> json) {
    return GameModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      iconEmoji: json['iconEmoji'] as String? ?? '🎮',
      entryFee: (json['entryFee'] as num?)?.toInt() ?? 0,
      minPlayers: (json['minPlayers'] as num?)?.toInt() ?? 1,
      maxPlayers: (json['maxPlayers'] as num?)?.toInt() ?? 10,
      isAvailable: json['isAvailable'] as bool? ?? true,
      category: json['category'] as String? ?? 'casual',
    );
  }

  /// Alias for iconEmoji for backward-compat with call sites using game.icon.
  String get icon => iconEmoji;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'iconEmoji': iconEmoji,
        'entryFee': entryFee,
        'minPlayers': minPlayers,
        'maxPlayers': maxPlayers,
        'isAvailable': isAvailable,
        'category': category,
      };

  static const List<GameModel> catalog = [
    GameModel(id: 'lucky_spin', name: 'Lucky Spin', iconEmoji: '🎡', entryFee: 5),
    GameModel(id: 'guess_number', name: 'Guess Number', iconEmoji: '🔢', entryFee: 2),
    GameModel(id: 'dice', name: 'Dice Duel', iconEmoji: '🎲', entryFee: 10),
    GameModel(id: 'treasure_box', name: 'Treasure Box', iconEmoji: '📦', entryFee: 20),
    GameModel(id: 'pk_battle', name: 'PK Battle', iconEmoji: '⚡', entryFee: 50, category: 'battle'),
    GameModel(id: 'lucky_slots', name: 'Lucky Slots', iconEmoji: '🎰', entryFee: 15),
  ];
}
