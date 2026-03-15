import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../services/multiverse_service.dart';
import '../../services/auth_service.dart';

/// Full multiverse hub: world browser, upcoming events, virtual event tickets,
/// and NFT assets browser all in one tabbed screen.
class AvatarStreamOverlay extends ConsumerStatefulWidget {
  const AvatarStreamOverlay({super.key});

  @override
  ConsumerState<AvatarStreamOverlay> createState() => _AvatarStreamOverlayState();
}

class _AvatarStreamOverlayState extends ConsumerState<AvatarStreamOverlay>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _service = MultiverseService.instance;

  bool _loading = true;
  String? _error;
  List<MultiverseWorld> _worlds = [];
  List<VirtualEvent> _events = [];
  List<EventTicket> _myTickets = [];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await Future.wait([
        _service.listActiveWorlds(),
        _service.listUpcomingEvents(),
        _service.listMyTickets(),
      ]);
      setState(() {
        _worlds    = results[0] as List<MultiverseWorld>;
        _events    = results[1] as List<VirtualEvent>;
        _myTickets = results[2] as List<EventTicket>;
        _loading   = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text('Multiverse', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        actions: [IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _load)],
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: const Color(0xFF7B2FBE),
          labelColor: const Color(0xFF7B2FBE),
          unselectedLabelColor: Colors.white38,
          tabs: const [
            Tab(text: 'Worlds'),
            Tab(text: 'Events'),
            Tab(text: 'My Tickets'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE)))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.redAccent)))
              : TabBarView(
                  controller: _tabs,
                  children: [
                    _WorldsTab(worlds: _worlds),
                    _EventsTab(events: _events, onRefresh: _load),
                    _TicketsTab(tickets: _myTickets, events: _events),
                  ],
                ),
    );
  }
}

// ── Worlds tab ────────────────────────────────────────────────────────────────

class _WorldsTab extends StatelessWidget {
  const _WorldsTab({required this.worlds});
  final List<MultiverseWorld> worlds;

  static const _icons = {
    'arena':    Icons.sports_esports,
    'city':     Icons.location_city,
    'verse':    Icons.public,
    'default':  Icons.travel_explore,
  };

  IconData _iconFor(String name) {
    final lower = name.toLowerCase();
    for (final key in _icons.keys) {
      if (lower.contains(key)) return _icons[key]!;
    }
    return _icons['default']!;
  }

  @override
  Widget build(BuildContext context) {
    if (worlds.isEmpty) {
      return const Center(child: Text('No worlds connected yet', style: TextStyle(color: Colors.white54)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: worlds.length,
      itemBuilder: (context, i) {
        final w = worlds[i];
        return Card(
          color: const Color(0xFF1A1A2E),
          margin: const EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: const LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
              ),
              child: Icon(_iconFor(w.worldName), color: Colors.white, size: 26),
            ),
            title: Text(w.worldName, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  children: w.supportedAssets.map((a) => _Chip(a)).toList(),
                ),
              ],
            ),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF00C853).withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('LIVE', style: TextStyle(color: Color(0xFF00C853), fontSize: 11)),
            ),
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF7B2FBE).withOpacity(0.2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: const TextStyle(color: Color(0xFF7B2FBE), fontSize: 11)),
    );
  }
}

// ── Events tab ────────────────────────────────────────────────────────────────

class _EventsTab extends StatelessWidget {
  const _EventsTab({required this.events, required this.onRefresh});
  final List<VirtualEvent> events;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const Center(child: Text('No upcoming events', style: TextStyle(color: Colors.white54)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: events.length,
      itemBuilder: (context, i) => _EventCard(event: events[i], onRefresh: onRefresh),
    );
  }
}

class _EventCard extends StatefulWidget {
  const _EventCard({required this.event, required this.onRefresh});
  final VirtualEvent event;
  final VoidCallback onRefresh;

  @override
  State<_EventCard> createState() => _EventCardState();
}

class _EventCardState extends State<_EventCard> {
  bool _buying = false;
  String? _ticketId;

  static const _typeIcons = {
    'concert':     Icons.music_note,
    'meetup':      Icons.people,
    'tournament':  Icons.emoji_events,
    'exhibition':  Icons.palette,
  };

  Future<void> _buy() async {
    final wallet = AuthService.instance.currentUser?.walletAddress;
    if (wallet == null || wallet.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Connect your GhostWallet first')),
      );
      return;
    }
    setState(() => _buying = true);
    try {
      final ticket = await MultiverseService.instance.buyTicket(
        eventId: widget.event.eventId,
        wallet:  wallet,
      );
      setState(() { _ticketId = ticket.ticketId; _buying = false; });
      widget.onRefresh();
    } catch (e) {
      setState(() => _buying = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ev = widget.event;
    final icon = _typeIcons[ev.eventType] ?? Icons.event;

    return Card(
      color: const Color(0xFF1A1A2E),
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: const Color(0xFF7B2FBE), size: 22),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(ev.title,
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (ev.description.isNotEmpty)
              Text(ev.description, style: const TextStyle(color: Colors.white54, fontSize: 13), maxLines: 2),
            const SizedBox(height: 10),
            if (ev.maxTickets > 0) ...[
              LinearProgressIndicator(
                value: ev.progress,
                backgroundColor: Colors.white12,
                color: const Color(0xFF7B2FBE),
              ),
              const SizedBox(height: 4),
              Text('${ev.ticketsSold}/${ev.maxTickets} tickets sold',
                  style: const TextStyle(color: Colors.white38, fontSize: 11)),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  ev.isFree ? 'Free Entry' : '${ev.ticketPriceGst.toStringAsFixed(0)} GST',
                  style: TextStyle(
                    color: ev.isFree ? const Color(0xFF00C853) : const Color(0xFF00D4FF),
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                  ),
                ),
                if (_ticketId != null)
                  const Row(children: [
                    Icon(Icons.check_circle, color: Color(0xFF00C853), size: 18),
                    SizedBox(width: 4),
                    Text('Ticket Secured', style: TextStyle(color: Color(0xFF00C853), fontSize: 13)),
                  ])
                else if (!ev.isSoldOut)
                  SizedBox(
                    height: 36,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF7B2FBE),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: _buying ? null : _buy,
                      child: _buying
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Get Ticket'),
                    ),
                  )
                else
                  const Text('Sold Out', style: TextStyle(color: Colors.redAccent)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Tickets tab ───────────────────────────────────────────────────────────────

class _TicketsTab extends StatelessWidget {
  const _TicketsTab({required this.tickets, required this.events});
  final List<EventTicket> tickets;
  final List<VirtualEvent> events;

  VirtualEvent? _event(String eventId) {
    try { return events.firstWhere((e) => e.eventId == eventId); }
    catch (_) { return null; }
  }

  @override
  Widget build(BuildContext context) {
    if (tickets.isEmpty) {
      return const Center(child: Text('No tickets yet', style: TextStyle(color: Colors.white54)));
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: tickets.length,
      itemBuilder: (context, i) {
        final t = tickets[i];
        final ev = _event(t.eventId);
        return Card(
          color: const Color(0xFF1A1A2E),
          margin: const EdgeInsets.only(bottom: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child: ListTile(
            contentPadding: const EdgeInsets.all(16),
            leading: const Icon(Icons.confirmation_number, color: Color(0xFFFFD700), size: 32),
            title: Text(ev?.title ?? t.eventId,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Text('Ticket ID: ${t.ticketId.substring(0, 8)}…',
                    style: const TextStyle(color: Colors.white38, fontSize: 11)),
                if (t.onChainTokenId != null)
                  Text('NFT #${t.onChainTokenId}', style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 11)),
              ],
            ),
            trailing: t.onChainTokenId != null
                ? const Icon(Icons.verified, color: Color(0xFF00C853), size: 20)
                : const Icon(Icons.pending, color: Colors.white38, size: 20),
          ),
        );
      },
    );
  }
}
