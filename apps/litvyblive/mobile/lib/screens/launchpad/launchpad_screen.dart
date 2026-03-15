import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/creator_token_model.dart';
import '../../services/launchpad_service.dart';
import 'token_details.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _tokensProvider = FutureProvider.autoDispose<List<CreatorTokenModel>>((ref) async {
  return LaunchpadService.instance.listTokens();
});

final _activeSalesProvider = FutureProvider.autoDispose<List<TokenSaleModel>>((ref) async {
  return LaunchpadService.instance.listActiveSales();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class LaunchpadScreen extends ConsumerStatefulWidget {
  const LaunchpadScreen({super.key});

  @override
  ConsumerState<LaunchpadScreen> createState() => _LaunchpadScreenState();
}

class _LaunchpadScreenState extends ConsumerState<LaunchpadScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _searchController = TextEditingController();
  List<CreatorTokenModel>? _searchResults;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) {
      setState(() => _searchResults = null);
      return;
    }
    final results = await LaunchpadService.instance.searchTokens(q.trim());
    if (mounted) setState(() => _searchResults = results);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: const Text('Creator Launchpad', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabs,
          labelColor: const Color(0xFF00D4FF),
          unselectedLabelColor: Colors.white38,
          indicatorColor: const Color(0xFF7B2FBE),
          tabs: const [Tab(text: 'All Tokens'), Tab(text: 'Active Sales')],
        ),
      ),
      body: Column(
        children: [
          _SearchBar(controller: _searchController, onChanged: _search),
          Expanded(
            child: _searchResults != null
                ? _TokenGrid(tokens: _searchResults!)
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _AllTokensTab(),
                      _ActiveSalesTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Search bar ────────────────────────────────────────────────────────────────

class _SearchBar extends StatelessWidget {
  const _SearchBar({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: 'Search creator tokens…',
          hintStyle: const TextStyle(color: Colors.white38),
          prefixIcon: const Icon(Icons.search, color: Color(0xFF7B2FBE)),
          filled: true,
          fillColor: const Color(0xFF1A1A2E),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          suffixIcon: controller.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear, color: Colors.white38),
                  onPressed: () { controller.clear(); onChanged(''); },
                )
              : null,
        ),
      ),
    );
  }
}

// ── All Tokens tab ────────────────────────────────────────────────────────────

class _AllTokensTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_tokensProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
      data: (tokens) => tokens.isEmpty
          ? const Center(child: Text('No tokens launched yet', style: TextStyle(color: Colors.white38)))
          : _TokenGrid(tokens: tokens),
    );
  }
}

// ── Active Sales tab ──────────────────────────────────────────────────────────

class _ActiveSalesTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_activeSalesProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFF7B2FBE))),
      error: (e, _) => Center(child: Text('Error: $e', style: const TextStyle(color: Colors.red))),
      data: (sales) => sales.isEmpty
          ? const Center(child: Text('No active sales', style: TextStyle(color: Colors.white38)))
          : ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: sales.length,
              itemBuilder: (context, i) => _SaleTile(sale: sales[i]),
            ),
    );
  }
}

// ── Token grid ────────────────────────────────────────────────────────────────

class _TokenGrid extends StatelessWidget {
  const _TokenGrid({required this.tokens});
  final List<CreatorTokenModel> tokens;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.85,
      ),
      itemCount: tokens.length,
      itemBuilder: (context, i) => _TokenCard(token: tokens[i]),
    );
  }
}

// ── Token card ────────────────────────────────────────────────────────────────

class _TokenCard extends StatelessWidget {
  const _TokenCard({required this.token});
  final CreatorTokenModel token;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => TokenDetailsScreen(token: token)),
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1A1A2E), Color(0xFF16213E)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF7B2FBE).withAlpha(77)),
        ),
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Token icon
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(
                child: Text(token.symbol.isNotEmpty ? token.symbol[0] : '?',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 22)),
              ),
            ),
            const SizedBox(height: 10),
            Text(token.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text('\$${token.symbol}', style: const TextStyle(color: Color(0xFF00D4FF), fontSize: 12)),
            const Spacer(),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: token.isConfirmed ? const Color(0xFF7B2FBE).withAlpha(51) : Colors.orange.withAlpha(51),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    token.isConfirmed ? 'LIVE' : 'PENDING',
                    style: TextStyle(
                      color: token.isConfirmed ? const Color(0xFF7B2FBE) : Colors.orange,
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Sale tile ─────────────────────────────────────────────────────────────────

class _SaleTile extends StatelessWidget {
  const _SaleTile({required this.sale});
  final TokenSaleModel sale;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF1A1A2E),
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF7B2FBE), width: 0.4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.rocket_launch, color: Color(0xFF00D4FF), size: 18),
                const SizedBox(width: 8),
                Text('${sale.priceGst} GST / token',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                const Spacer(),
                Text('${(sale.progress * 100).toStringAsFixed(0)}% sold',
                    style: const TextStyle(color: Color(0xFF7B2FBE), fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: sale.progress.clamp(0.0, 1.0),
                backgroundColor: Colors.white12,
                valueColor: const AlwaysStoppedAnimation(Color(0xFF7B2FBE)),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 6),
            Text('${sale.remaining.toStringAsFixed(0)} remaining',
                style: const TextStyle(color: Colors.white38, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
