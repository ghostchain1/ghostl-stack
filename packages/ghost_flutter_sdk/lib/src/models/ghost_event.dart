/// GhostEvent — a live or scheduled event on the GhostChain ecosystem.
///
/// Events can be:
/// - **Live streams** via LitVybzLive (port 4000).
/// - **Virtual concerts/tournaments** in GhostUniverse (port 7700).
/// - **NFT drops** with GRC-721 mint contracts.
/// - **Governance sessions** for on-chain ratification.
///
/// Tickets are priced in GST (never ETH or any external token).
///
/// ```dart
/// final event = GhostEvent(
///   eventId: 'evt_001',
///   name: 'GhostChain Genesis Concert',
///   type: GhostEventType.concert,
///   hostAddress: '0xDJ...',
///   ticketPriceGSTWei: BigInt.from(5) * BigInt.from(10).pow(18),
///   status: GhostEventStatus.live,
/// );
///
/// print(event.formattedTicketPrice); // "5.00 GST"
/// print(event.isFree);               // false
/// ```
class GhostEvent {
  final String eventId;
  final String name;
  final String? description;
  final GhostEventType type;

  /// Host's L3 wallet address.
  final String hostAddress;

  /// Optional GNS name of the host.
  final String? hostGnsName;

  /// GhostUniverse world ID where this event takes place. Null for off-world events.
  final String? worldId;

  /// Ticket price in GST wei. Zero = free.
  final BigInt ticketPriceGSTWei;

  final int maxAttendees;
  final int attendeeCount;

  /// Unix millisecond timestamp for scheduled start.
  final int startAt;

  /// Unix millisecond timestamp for actual end (0 = not ended).
  final int endedAt;

  final GhostEventStatus status;

  /// LitVybzLive stream URL. Set when the event goes live.
  final String? streamUrl;

  /// Total GST gifted during the event (in wei).
  final BigInt totalGiftsGSTWei;

  const GhostEvent({
    required this.eventId,
    required this.name,
    this.description,
    required this.type,
    required this.hostAddress,
    this.hostGnsName,
    this.worldId,
    this.ticketPriceGSTWei = BigInt.zero,
    this.maxAttendees = 500,
    this.attendeeCount = 0,
    this.startAt = 0,
    this.endedAt = 0,
    required this.status,
    this.streamUrl,
    this.totalGiftsGSTWei = BigInt.zero,
  });

  bool get isFree    => ticketPriceGSTWei == BigInt.zero;
  bool get isLive    => status == GhostEventStatus.live;
  bool get isEndable => status == GhostEventStatus.live;
  bool get hasStream => streamUrl != null;

  bool get isFull => maxAttendees > 0 && attendeeCount >= maxAttendees;

  DateTime get scheduledStart => DateTime.fromMillisecondsSinceEpoch(startAt);

  /// Human-readable ticket price (e.g. "2.50 GST" or "Free").
  String get formattedTicketPrice {
    if (isFree) return 'Free';
    final gst = ticketPriceGSTWei / BigInt.from(10).pow(18);
    return '${gst.toStringAsFixed(2)} GST';
  }

  /// Human-readable total gifts (e.g. "150.00 GST").
  String get formattedTotalGifts {
    final gst = totalGiftsGSTWei / BigInt.from(10).pow(18);
    return '${gst.toStringAsFixed(2)} GST';
  }

  factory GhostEvent.fromJson(Map<String, dynamic> j) {
    final typeStr = j['type'] as String? ?? 'live-stream';
    final statusStr = j['status'] as String? ?? 'scheduled';

    final type = GhostEventType.values.firstWhere(
      (t) => t.apiName == typeStr,
      orElse: () => GhostEventType.liveStream,
    );
    final status = GhostEventStatus.values.firstWhere(
      (s) => s.name == statusStr,
      orElse: () => GhostEventStatus.scheduled,
    );

    final attendees = j['attendees'];
    final count = attendees is List
        ? attendees.length
        : (attendees is int ? attendees : (j['attendeeCount'] as num?)?.toInt() ?? 0);

    return GhostEvent(
      eventId:           j['eventId']           as String? ?? '',
      name:              j['name']              as String? ?? '',
      description:       j['description']       as String?,
      type:              type,
      hostAddress:       j['hostAddress']       as String? ?? '',
      hostGnsName:       j['hostGnsName']       as String?,
      worldId:           j['worldId']           as String?,
      ticketPriceGSTWei: BigInt.tryParse(j['ticketPriceGST']?.toString() ?? '0') ?? BigInt.zero,
      maxAttendees:      (j['maxAttendees']      as num?)?.toInt() ?? 500,
      attendeeCount:     count,
      startAt:           (j['startAt']           as num?)?.toInt() ?? 0,
      endedAt:           (j['endedAt']           as num?)?.toInt() ?? 0,
      status:            status,
      streamUrl:         j['streamUrl']         as String?,
      totalGiftsGSTWei:  BigInt.tryParse(j['totalGiftsGST']?.toString() ?? '0') ?? BigInt.zero,
    );
  }

  Map<String, dynamic> toJson() => {
        'eventId':           eventId,
        'name':              name,
        if (description  != null) 'description': description,
        'type':              type.apiName,
        'hostAddress':       hostAddress,
        if (hostGnsName != null) 'hostGnsName': hostGnsName,
        if (worldId     != null) 'worldId':     worldId,
        'ticketPriceGST':    ticketPriceGSTWei.toString(),
        'maxAttendees':      maxAttendees,
        'attendeeCount':     attendeeCount,
        'startAt':           startAt,
        'endedAt':           endedAt,
        'status':            status.name,
        if (streamUrl != null) 'streamUrl': streamUrl,
        'totalGiftsGST':     totalGiftsGSTWei.toString(),
      };

  @override
  String toString() =>
      'GhostEvent($eventId "$name" type=${type.apiName} status=${status.name})';

  @override
  bool operator ==(Object other) =>
      other is GhostEvent && eventId == other.eventId;

  @override
  int get hashCode => eventId.hashCode;
}

/// Type of GhostChain event.
enum GhostEventType {
  concert('concert'),
  liveStream('live-stream'),
  gamingTournament('gaming-tournament'),
  virtualConference('virtual-conference'),
  nftDrop('nft-drop'),
  governance('governance');

  const GhostEventType(this.apiName);

  /// The string value used in the Ghost Universe API / JSON serialisation.
  final String apiName;
}

/// Lifecycle status of a GhostEvent.
enum GhostEventStatus {
  scheduled,
  live,
  ended,
  cancelled,
}
