import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/game_model.dart';

class GameHubScreen extends StatelessWidget {
  const GameHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Games')),
      body: FutureBuilder<List<GameModel>>(
        future: ApiService.instance.getRecommendedGames(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final games = snap.data ?? _defaultGames();
          return GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: games.length,
            itemBuilder: (_, i) => _GameCard(game: games[i]),
          );
        },
      ),
    );
  }

  List<GameModel> _defaultGames() => [
        GameModel(id: 'lucky_spin', name: 'Lucky Spin', iconEmoji: 'Ἷ0', entryFee: 10),
        GameModel(id: 'guess_number', name: 'Guess Number', iconEmoji: 'ὒ2', entryFee: 5),
        GameModel(id: 'dice', name: 'Dice Game', iconEmoji: 'Ἳ2', entryFee: 20),
        GameModel(id: 'treasure_box', name: 'Treasure Box', iconEmoji: 'Ἰ1', entryFee: 15),
        GameModel(id: 'pk_game', name: 'PK Battle', iconEmoji: '⚔️', entryFee: 50),
        GameModel(id: 'slot', name: 'Lucky Slots', iconEmoji: 'Ἷ0', entryFee: 25),
      ];
}

class _GameCard extends StatelessWidget {
  final GameModel game;
  const _GameCard({required this.game});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: () {},
        borderRadius: BorderRadius.circular(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(game.icon, style: const TextStyle(fontSize: 40)),
            const SizedBox(height: 8),
            Text(game.name,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('${game.entryFee} GST',
                style: const TextStyle(color: Color(0xFFFFD700), fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
