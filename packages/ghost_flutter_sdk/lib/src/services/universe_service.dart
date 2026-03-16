import 'dart:convert';
import 'package:http/http.dart' as http;

/// GhostUniverseService — Flutter client for the Ghost Universe Platform.
///
/// Connects to the ghost-universe API (port 7700) and the multiplayer
/// WebSocket endpoint. Covers world management, avatar actions, land,
/// assets, events, and economy stats — all settled in GST on GhostL3/L2/L1.
///
/// Routing law enforced by the server—this client never touches L1/L2 directly.
///
/// ```dart
/// final universe = GhostUniverseService(apiBase: 'http://localhost:7700');
///
/// // List worlds
/// final worlds = await universe.listWorlds();
///
/// // Create avatar
/// final avatar = await universe.createAvatar(
///   userAddress: '0xYour...',
///   modelUri: 'ghost://avatars/default.ghost3d',
/// );
///
/// // Land market
/// final parcels = await universe.getLandMarket();
/// ```
class GhostUniverseService {
  final String _apiBase;
  final String? _bearerToken;

  GhostUniverseService({
    String? apiBase,
    String? bearerToken,
  })  : _apiBase = apiBase ?? 'http://localhost:7700',
        _bearerToken = bearerToken;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_bearerToken != null) 'Authorization': 'Bearer $_bearerToken',
      };

  // ── Health ────────────────────────────────────────────────────────────────

  Future<bool> isHealthy() async {
    try {
      final res = await http.get(Uri.parse('$_apiBase/health'));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ── Worlds ────────────────────────────────────────────────────────────────

  /// List all active worlds.
  Future<List<GhostWorld>> listWorlds() async {
    final res = await http.get(Uri.parse('$_apiBase/worlds'), headers: _headers);
    _assertOk(res, 'listWorlds');
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['worlds'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostWorld.fromJson)
        .toList();
  }

  /// Create a new world.
  Future<GhostWorld> createWorld({
    required String name,
    String theme = 'ghost-city',
    int? seed,
    int maxPlayers = 1000,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/worlds'),
      headers: _headers,
      body: json.encode({'name': name, 'theme': theme, 'seed': seed, 'maxPlayers': maxPlayers}),
    );
    _assertOk(res, 'createWorld');
    final data = json.decode(res.body) as Map<String, dynamic>;
    return GhostWorld.fromJson(data['world'] as Map<String, dynamic>);
  }

  /// Get a world's current environment snapshot (weather, time-of-day).
  Future<Map<String, dynamic>> getEnvironment(String worldId) async {
    final res = await http.get(Uri.parse('$_apiBase/worlds/$worldId/environment'), headers: _headers);
    _assertOk(res, 'getEnvironment');
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['environment'] as Map<String, dynamic>? ?? {};
  }

  // ── Avatars ───────────────────────────────────────────────────────────────

  /// Create a new avatar for [userAddress].
  Future<Map<String, dynamic>> createAvatar({
    required String userAddress,
    required String modelUri,
    String format = 'ghost3d',
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/avatars'),
      headers: _headers,
      body: json.encode({'userAddress': userAddress, 'modelUri': modelUri, 'format': format}),
    );
    _assertOk(res, 'createAvatar');
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Get avatar by ID.
  Future<Map<String, dynamic>?> getAvatar(String avatarId) async {
    final res = await http.get(Uri.parse('$_apiBase/avatars/$avatarId'), headers: _headers);
    if (res.statusCode == 404) return null;
    _assertOk(res, 'getAvatar');
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['avatar'] as Map<String, dynamic>?;
  }

  /// Move avatar to a position in a world.
  Future<void> moveAvatar(String avatarId, {
    required double x,
    required double y,
    required double z,
    required String worldId,
  }) async {
    final res = await http.patch(
      Uri.parse('$_apiBase/avatars/$avatarId/position?worldId=$worldId'),
      headers: _headers,
      body: json.encode({'x': x, 'y': y, 'z': z}),
    );
    _assertOk(res, 'moveAvatar');
  }

  /// Trigger a gesture on an avatar.
  Future<void> triggerGesture(String avatarId, String gestureId, String worldId) async {
    final res = await http.post(
      Uri.parse('$_apiBase/avatars/$avatarId/gesture'),
      headers: _headers,
      body: json.encode({'gestureId': gestureId, 'worldId': worldId}),
    );
    _assertOk(res, 'triggerGesture');
  }

  /// Grant XP to an avatar.
  Future<void> grantXP(String avatarId, int amount) async {
    final res = await http.post(
      Uri.parse('$_apiBase/avatars/$avatarId/xp'),
      headers: _headers,
      body: json.encode({'amount': amount}),
    );
    _assertOk(res, 'grantXP');
  }

  // ── Land ──────────────────────────────────────────────────────────────────

  /// Get parcels listed for sale, optionally filtered by [worldId].
  Future<List<GhostLandParcel>> getLandMarket({String? worldId}) async {
    final uri = Uri.parse('$_apiBase/land/market${worldId != null ? '?worldId=$worldId' : ''}');
    final res = await http.get(uri, headers: _headers);
    _assertOk(res, 'getLandMarket');
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['parcels'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostLandParcel.fromJson)
        .toList();
  }

  /// Buy a land parcel. Payment comes from [buyerAddress] (GST on L3→L2).
  Future<Map<String, dynamic>> buyLand({
    required int x,
    required int y,
    required String buyerAddress,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/land/buy'),
      headers: _headers,
      body: json.encode({'x': x, 'y': y, 'buyer': buyerAddress}),
    );
    _assertOk(res, 'buyLand');
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Get land stats for a world.
  Future<Map<String, dynamic>> getLandStats({String? worldId}) async {
    final uri = Uri.parse('$_apiBase/land/stats${worldId != null ? '?worldId=$worldId' : ''}');
    final res = await http.get(uri, headers: _headers);
    _assertOk(res, 'getLandStats');
    final data = json.decode(res.body) as Map<String, dynamic>;
    return data['stats'] as Map<String, dynamic>? ?? {};
  }

  // ── Asset Marketplace ─────────────────────────────────────────────────────

  /// Search the GhostUniverse asset marketplace.
  Future<List<GhostMarketAsset>> searchAssets({
    String? category,
    String? keyword,
    BigInt? maxPriceGST,
  }) async {
    final params = {
      if (category != null) 'category': category,
      if (keyword != null) 'keyword': keyword,
      if (maxPriceGST != null) 'maxPrice': maxPriceGST.toString(),
    };
    final uri = Uri.parse('$_apiBase/assets').replace(queryParameters: params);
    final res = await http.get(uri, headers: _headers);
    _assertOk(res, 'searchAssets');
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['assets'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostMarketAsset.fromJson)
        .toList();
  }

  /// Buy an asset by ID. Payment settled on L3.
  Future<Map<String, dynamic>> buyAsset(String assetId, String buyerAddress) async {
    final res = await http.post(
      Uri.parse('$_apiBase/assets/$assetId/buy'),
      headers: _headers,
      body: json.encode({'buyer': buyerAddress}),
    );
    _assertOk(res, 'buyAsset');
    return json.decode(res.body) as Map<String, dynamic>;
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /// Get upcoming events, optionally filtered by [worldId].
  Future<List<GhostUniverseEvent>> getUpcomingEvents({String? worldId}) async {
    final uri = Uri.parse('$_apiBase/events${worldId != null ? '?worldId=$worldId' : ''}');
    final res = await http.get(uri, headers: _headers);
    _assertOk(res, 'getUpcomingEvents');
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['events'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostUniverseEvent.fromJson)
        .toList();
  }

  /// Get currently live events.
  Future<List<GhostUniverseEvent>> getLiveEvents({String? worldId}) async {
    final uri = Uri.parse('$_apiBase/events/live${worldId != null ? '?worldId=$worldId' : ''}');
    final res = await http.get(uri, headers: _headers);
    _assertOk(res, 'getLiveEvents');
    final data = json.decode(res.body) as Map<String, dynamic>;
    final list = data['events'] as List<dynamic>? ?? [];
    return list
        .whereType<Map<String, dynamic>>()
        .map(GhostUniverseEvent.fromJson)
        .toList();
  }

  /// Join an event (free or ticketed). For paid events provide [buyerAddress].
  Future<Map<String, dynamic>> joinEvent(
    String eventId,
    String avatarId, {
    String? buyerAddress,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/events/$eventId/join'),
      headers: _headers,
      body: json.encode({'avatarId': avatarId, if (buyerAddress != null) 'buyerAddress': buyerAddress}),
    );
    _assertOk(res, 'joinEvent');
    return json.decode(res.body) as Map<String, dynamic>;
  }

  /// Send a GST gift to a live event host.
  Future<Map<String, dynamic>> sendEventGift(
    String eventId, {
    required String fromAddress,
    required BigInt amountGSTWei,
  }) async {
    final res = await http.post(
      Uri.parse('$_apiBase/events/$eventId/gift'),
      headers: _headers,
      body: json.encode({'from': fromAddress, 'amountGST': amountGSTWei.toString()}),
    );
    _assertOk(res, 'sendEventGift');
    return json.decode(res.body) as Map<String, dynamic>;
  }

  // ── Economy ───────────────────────────────────────────────────────────────

  /// Get treasury stats (L1 balance, L2 volume, L3 volume, fees).
  Future<GhostEconomyStats> getEconomyStats() async {
    final res = await http.get(Uri.parse('$_apiBase/economy'), headers: _headers);
    _assertOk(res, 'getEconomyStats');
    final data = json.decode(res.body) as Map<String, dynamic>;
    return GhostEconomyStats.fromJson(data['stats'] as Map<String, dynamic>);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _assertOk(http.Response res, String label) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('GhostUniverseService.$label failed [${res.statusCode}]: ${res.body}');
    }
  }
}

// ── Model classes ─────────────────────────────────────────────────────────────

class GhostWorld {
  final String worldId;
  final String name;
  final String theme;
  final int players;
  final int maxPlayers;
  final int createdAt;

  const GhostWorld({
    required this.worldId,
    required this.name,
    required this.theme,
    required this.players,
    required this.maxPlayers,
    required this.createdAt,
  });

  factory GhostWorld.fromJson(Map<String, dynamic> j) => GhostWorld(
        worldId:    j['worldId']    as String? ?? j['id'] as String? ?? '',
        name:       j['name']       as String? ?? '',
        theme:      j['theme']      as String? ?? 'ghost-city',
        players:    (j['players']   as num?)?.toInt() ?? 0,
        maxPlayers: (j['maxPlayers'] as num?)?.toInt() ?? 1000,
        createdAt:  (j['createdAt'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'worldId': worldId, 'name': name, 'theme': theme,
        'players': players, 'maxPlayers': maxPlayers, 'createdAt': createdAt,
      };
}

class GhostLandParcel {
  final String id;
  final String owner;
  final List<int> location; // [x, y]
  final String type;
  final String worldId;
  final BigInt? priceGST;   // null = not for sale

  const GhostLandParcel({
    required this.id,
    required this.owner,
    required this.location,
    required this.type,
    required this.worldId,
    this.priceGST,
  });

  bool get forSale => priceGST != null;

  factory GhostLandParcel.fromJson(Map<String, dynamic> j) {
    final loc = (j['location'] as List<dynamic>?)?.cast<int>() ?? [0, 0];
    final price = j['priceGST'] as String?;
    return GhostLandParcel(
      id:       j['id']      as String? ?? '',
      owner:    j['owner']   as String? ?? '',
      location: loc,
      type:     j['type']    as String? ?? 'residential',
      worldId:  j['worldId'] as String? ?? '',
      priceGST: price != null ? BigInt.tryParse(price) : null,
    );
  }

  String get formattedPrice => priceGST == null
      ? '—'
      : '${(priceGST! / BigInt.from(10).pow(18)).toStringAsFixed(2)} GST';
}

class GhostMarketAsset {
  final String assetId;
  final String name;
  final String description;
  final String category;
  final String creatorAddress;
  final BigInt priceGST;
  final BigInt royaltyBps;
  final String assetUri;
  final bool available;

  const GhostMarketAsset({
    required this.assetId,
    required this.name,
    required this.description,
    required this.category,
    required this.creatorAddress,
    required this.priceGST,
    required this.royaltyBps,
    required this.assetUri,
    required this.available,
  });

  factory GhostMarketAsset.fromJson(Map<String, dynamic> j) => GhostMarketAsset(
        assetId:        j['assetId']        as String? ?? '',
        name:           j['name']           as String? ?? '',
        description:    j['description']    as String? ?? '',
        category:       j['category']       as String? ?? 'other',
        creatorAddress: j['creatorAddress'] as String? ?? '',
        priceGST:       BigInt.tryParse(j['priceGST']?.toString() ?? '0') ?? BigInt.zero,
        royaltyBps:     BigInt.tryParse(j['royaltyBps']?.toString() ?? '0') ?? BigInt.zero,
        assetUri:       j['assetUri']       as String? ?? '',
        available:      j['available']      as bool?   ?? true,
      );

  String get formattedPrice =>
      '${(priceGST / BigInt.from(10).pow(18)).toStringAsFixed(2)} GST';
}

class GhostUniverseEvent {
  final String eventId;
  final String name;
  final String type;        // concert | live-stream | gaming-tournament | ...
  final String worldId;
  final String hostAddress;
  final BigInt ticketPriceGST;
  final int maxAttendees;
  final int attendeeCount;
  final int startAt;
  final String status;
  final String? streamUrl;
  final BigInt totalGiftsGST;

  const GhostUniverseEvent({
    required this.eventId,
    required this.name,
    required this.type,
    required this.worldId,
    required this.hostAddress,
    required this.ticketPriceGST,
    required this.maxAttendees,
    required this.attendeeCount,
    required this.startAt,
    required this.status,
    this.streamUrl,
    required this.totalGiftsGST,
  });

  bool get isFree    => ticketPriceGST == BigInt.zero;
  bool get isLive    => status == 'live';
  DateTime get start => DateTime.fromMillisecondsSinceEpoch(startAt);

  factory GhostUniverseEvent.fromJson(Map<String, dynamic> j) {
    final attendees = j['attendees'];
    final count = attendees is List ? attendees.length : (attendees as int? ?? 0);
    return GhostUniverseEvent(
      eventId:        j['eventId']       as String? ?? '',
      name:           j['name']          as String? ?? '',
      type:           j['type']          as String? ?? 'live-stream',
      worldId:        j['worldId']       as String? ?? '',
      hostAddress:    j['hostAddress']   as String? ?? '',
      ticketPriceGST: BigInt.tryParse(j['ticketPriceGST']?.toString() ?? '0') ?? BigInt.zero,
      maxAttendees:   (j['maxAttendees'] as num?)?.toInt() ?? 500,
      attendeeCount:  count,
      startAt:        (j['startAt']      as num?)?.toInt() ?? 0,
      status:         j['status']        as String? ?? 'scheduled',
      streamUrl:      j['streamUrl']     as String?,
      totalGiftsGST:  BigInt.tryParse(j['totalGiftsGST']?.toString() ?? '0') ?? BigInt.zero,
    );
  }
}

class GhostEconomyStats {
  final BigInt l1BalanceGST;
  final BigInt l2VolumeGST;
  final BigInt l3VolumeGST;
  final BigInt platformFeesGST;
  final int totalTxCount;

  const GhostEconomyStats({
    required this.l1BalanceGST,
    required this.l2VolumeGST,
    required this.l3VolumeGST,
    required this.platformFeesGST,
    required this.totalTxCount,
  });

  factory GhostEconomyStats.fromJson(Map<String, dynamic> j) => GhostEconomyStats(
        l1BalanceGST:   BigInt.tryParse(j['l1BalanceGST']?.toString()   ?? '0') ?? BigInt.zero,
        l2VolumeGST:    BigInt.tryParse(j['l2VolumeGST']?.toString()    ?? '0') ?? BigInt.zero,
        l3VolumeGST:    BigInt.tryParse(j['l3VolumeGST']?.toString()    ?? '0') ?? BigInt.zero,
        platformFeesGST:BigInt.tryParse(j['platformFeesGST']?.toString() ?? '0') ?? BigInt.zero,
        totalTxCount:   (j['totalTxCount'] as num?)?.toInt() ?? 0,
      );
}
