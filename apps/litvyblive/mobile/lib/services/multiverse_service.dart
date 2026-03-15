import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

// ── Models ────────────────────────────────────────────────────────────────────

class MultiverseWorld {
  final String worldId;
  final String worldName;
  final String apiEndpoint;
  final List<String> supportedAssets;
  final String status;
  final String createdAt;

  const MultiverseWorld({
    required this.worldId,
    required this.worldName,
    required this.apiEndpoint,
    required this.supportedAssets,
    required this.status,
    required this.createdAt,
  });

  factory MultiverseWorld.fromJson(Map<String, dynamic> j) => MultiverseWorld(
        worldId:         j['world_id']          as String,
        worldName:       j['world_name']         as String,
        apiEndpoint:     j['api_endpoint']       as String? ?? '',
        supportedAssets: List<String>.from(j['supported_assets'] as List? ?? []),
        status:          j['status']             as String? ?? 'active',
        createdAt:       j['created_at']         as String,
      );
}

class AvatarState {
  final String creatorId;
  final String worldId;
  final String avatarModel;
  final String animationState;
  final String updatedAt;

  const AvatarState({
    required this.creatorId,
    required this.worldId,
    required this.avatarModel,
    required this.animationState,
    required this.updatedAt,
  });

  factory AvatarState.fromJson(Map<String, dynamic> j) => AvatarState(
        creatorId:      j['creator_id']       as String,
        worldId:        j['world_id']         as String,
        avatarModel:    j['avatar_model']     as String? ?? '',
        animationState: j['animation_state']  as String? ?? 'idle',
        updatedAt:      j['updated_at']       as String,
      );
}

class NftAsset {
  final String assetId;
  final String tokenId;
  final String ownerWallet;
  final List<String> worldPermissions;
  final String metadataUri;
  final String assetType;
  final int chainId;
  final String createdAt;

  const NftAsset({
    required this.assetId,
    required this.tokenId,
    required this.ownerWallet,
    required this.worldPermissions,
    required this.metadataUri,
    required this.assetType,
    required this.chainId,
    required this.createdAt,
  });

  factory NftAsset.fromJson(Map<String, dynamic> j) => NftAsset(
        assetId:          j['asset_id']          as String,
        tokenId:          j['token_id']          as String,
        ownerWallet:      j['owner_wallet']       as String,
        worldPermissions: List<String>.from(j['world_permissions'] as List? ?? []),
        metadataUri:      j['metadata_uri']       as String? ?? '',
        assetType:        j['asset_type']         as String? ?? 'nft',
        chainId:          j['chain_id']           as int? ?? 903,
        createdAt:        j['created_at']         as String,
      );
}

class VirtualEvent {
  final String eventId;
  final String creatorId;
  final String worldId;
  final String title;
  final String description;
  final String eventType;
  final double ticketPriceGst;
  final int maxTickets;
  final int ticketsSold;
  final String startsAt;
  final String endsAt;
  final bool isActive;
  final String createdAt;

  const VirtualEvent({
    required this.eventId,
    required this.creatorId,
    required this.worldId,
    required this.title,
    required this.description,
    required this.eventType,
    required this.ticketPriceGst,
    required this.maxTickets,
    required this.ticketsSold,
    required this.startsAt,
    required this.endsAt,
    required this.isActive,
    required this.createdAt,
  });

  factory VirtualEvent.fromJson(Map<String, dynamic> j) => VirtualEvent(
        eventId:        j['event_id']         as String,
        creatorId:      j['creator_id']       as String,
        worldId:        j['world_id']         as String,
        title:          j['title']            as String,
        description:    j['description']      as String? ?? '',
        eventType:      j['event_type']       as String? ?? 'concert',
        ticketPriceGst: (j['ticket_price_gst'] as num).toDouble(),
        maxTickets:     j['max_tickets']      as int? ?? 0,
        ticketsSold:    j['tickets_sold']     as int? ?? 0,
        startsAt:       j['starts_at']        as String,
        endsAt:         j['ends_at']          as String,
        isActive:       (j['is_active'] as int? ?? 1) == 1,
        createdAt:      j['created_at']       as String,
      );

  bool get isFree => ticketPriceGst == 0;
  bool get isSoldOut => maxTickets > 0 && ticketsSold >= maxTickets;
  int  get remaining => maxTickets > 0 ? (maxTickets - ticketsSold).clamp(0, maxTickets) : 9999999;
  double get progress => maxTickets > 0 ? ticketsSold / maxTickets : 0;
}

class EventTicket {
  final String ticketId;
  final String eventId;
  final String ownerId;
  final String ownerWallet;
  final String? onChainTokenId;
  final String purchasedAt;

  const EventTicket({
    required this.ticketId,
    required this.eventId,
    required this.ownerId,
    required this.ownerWallet,
    this.onChainTokenId,
    required this.purchasedAt,
  });

  factory EventTicket.fromJson(Map<String, dynamic> j) => EventTicket(
        ticketId:        j['ticket_id']           as String,
        eventId:         j['event_id']            as String,
        ownerId:         j['owner_id']            as String,
        ownerWallet:     j['owner_wallet']         as String,
        onChainTokenId:  j['on_chain_token_id']   as String?,
        purchasedAt:     j['purchased_at']         as String,
      );
}

// ── Service ───────────────────────────────────────────────────────────────────

class MultiverseService {
  MultiverseService._();
  static final instance = MultiverseService._();

  String get _base => '${ApiService.instance.baseUrl}/multiverse';
  Map<String, String> get _headers => ApiService.instance.authHeaders;
  Map<String, String> get _jsonHeaders => {..._headers, 'Content-Type': 'application/json'};

  void _check(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final body = jsonDecode(res.body) as Map<String, dynamic>?;
      throw Exception(body?['error'] ?? 'Request failed (${res.statusCode})');
    }
  }

  // ── Gateway ────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getGatewayStatus() async {
    final res = await http.get(Uri.parse('$_base/status'), headers: _headers);
    _check(res);
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  // ── Worlds ─────────────────────────────────────────────────────────────────

  Future<List<MultiverseWorld>> listActiveWorlds() async {
    final res = await http.get(Uri.parse('$_base/worlds'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => MultiverseWorld.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<MultiverseWorld> getWorld(String worldId) async {
    final res = await http.get(Uri.parse('$_base/worlds/$worldId'), headers: _headers);
    _check(res);
    return MultiverseWorld.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  // ── Avatars ────────────────────────────────────────────────────────────────

  Future<List<AvatarState>> listAvatarStates(String creatorId) async {
    final res = await http.get(Uri.parse('$_base/avatars/$creatorId'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => AvatarState.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<AvatarState> syncAvatar({
    required String creatorId,
    required String worldId,
    required String avatarModel,
    String animationState = 'idle',
  }) async {
    final res = await http.post(
      Uri.parse('$_base/avatars/$creatorId/sync'),
      headers: _jsonHeaders,
      body: jsonEncode({'worldId': worldId, 'avatarModel': avatarModel, 'animationState': animationState}),
    );
    _check(res);
    return AvatarState.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<Map<String, dynamic>>> propagateAvatar({
    required String creatorId,
    required String avatarModel,
    String animationState = 'idle',
  }) async {
    final res = await http.post(
      Uri.parse('$_base/avatars/$creatorId/propagate'),
      headers: _jsonHeaders,
      body: jsonEncode({'avatarModel': avatarModel, 'animationState': animationState}),
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return List<Map<String, dynamic>>.from(body['results'] as List);
  }

  // ── NFT Assets ─────────────────────────────────────────────────────────────

  Future<List<NftAsset>> listAssetsInWorld(String worldId, {String? assetType}) async {
    final query = assetType != null ? '?type=$assetType' : '';
    final res = await http.get(Uri.parse('$_base/assets/world/$worldId$query'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => NftAsset.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<NftAsset>> listMyAssets(String wallet, {int page = 0}) async {
    final res = await http.get(Uri.parse('$_base/assets/owner/$wallet?page=$page'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => NftAsset.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ── Virtual Events ─────────────────────────────────────────────────────────

  Future<List<VirtualEvent>> listUpcomingEvents({int page = 0, int pageSize = 20}) async {
    final res = await http.get(Uri.parse('$_base/events?page=$page&pageSize=$pageSize'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => VirtualEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<VirtualEvent>> listEventsByWorld(String worldId, {int page = 0}) async {
    final res = await http.get(Uri.parse('$_base/events/world/$worldId?page=$page'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => VirtualEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<VirtualEvent>> listMyEvents() async {
    final res = await http.get(Uri.parse('$_base/events/creator/me'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => VirtualEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<VirtualEvent> getEvent(String eventId) async {
    final res = await http.get(Uri.parse('$_base/events/$eventId'), headers: _headers);
    _check(res);
    return VirtualEvent.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<VirtualEvent> createEvent({
    required String worldId,
    required String title,
    String description = '',
    String eventType = 'concert',
    double ticketPriceGst = 0,
    int maxTickets = 0,
    required String startsAt,
    required String endsAt,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/events'),
      headers: _jsonHeaders,
      body: jsonEncode({
        'worldId': worldId, 'title': title, 'description': description,
        'eventType': eventType, 'ticketPriceGst': ticketPriceGst,
        'maxTickets': maxTickets, 'startsAt': startsAt, 'endsAt': endsAt,
      }),
    );
    _check(res);
    return VirtualEvent.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  Future<EventTicket> buyTicket({required String eventId, required String wallet}) async {
    final res = await http.post(
      Uri.parse('$_base/events/$eventId/tickets'),
      headers: _jsonHeaders,
      body: jsonEncode({'wallet': wallet}),
    );
    _check(res);
    return EventTicket.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<EventTicket>> listMyTickets() async {
    final res = await http.get(Uri.parse('$_base/tickets/mine'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as List).map((e) => EventTicket.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<bool> checkHasTicket(String eventId) async {
    final res = await http.get(Uri.parse('$_base/events/$eventId/tickets/check'), headers: _headers);
    _check(res);
    return (jsonDecode(res.body) as Map<String, dynamic>)['hasTicket'] as bool;
  }
}
