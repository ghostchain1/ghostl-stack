import 'package:flutter/material.dart';
import '../../services/socket_service.dart';
import '../../core/constants/app_constants.dart';

class PkBattleScreen extends StatefulWidget {
  final String streamId;
  const PkBattleScreen({super.key, required this.streamId});

  @override
  State<PkBattleScreen> createState() => _PkBattleScreenState();
}

class _PkBattleScreenState extends State<PkBattleScreen> {
  int _scoreA = 0;
  int _scoreB = 0;
  int _timeLeft = kPkBattleDuration;

  @override
  void initState() {
    super.initState();
    SocketService.instance.onPkScore((data) {
      if (mounted) setState(() {
        _scoreA = (data['scoreA'] as num?)?.toInt() ?? 0;
        _scoreB = (data['scoreB'] as num?)?.toInt() ?? 0;
      });
    });
    _startTimer();
  }

  void _startTimer() async {
    while (_timeLeft > 0 && mounted) {
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) setState(() => _timeLeft--);
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = _scoreA + _scoreB;
    final pctA = total == 0 ? 0.5 : _scoreA / total;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Split video panels — Host A | Host B
          Row(
            children: [
              Expanded(
                child: Container(
                  color: const Color(0xFF1A1A2E),
                  alignment: Alignment.center,
                  child: const Text('Host A', style: TextStyle(color: Colors.white, fontSize: 22)),
                ),
              ),
              Expanded(
                child: Container(
                  color: const Color(0xFF2E1A1A),
                  alignment: Alignment.center,
                  child: const Text('Host B', style: TextStyle(color: Colors.white, fontSize: 22)),
                ),
              ),
            ],
          ),

          // PK progress bar
          Positioned(
            top: 80,
            left: 0,
            right: 0,
            child: Column(
              children: [
                Text(
                  '${(_timeLeft ~/ 60).toString().padLeft(2, '0')}:${(_timeLeft % 60).toString().padLeft(2, '0')}',
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      flex: (pctA * 100).round(),
                      child: Container(height: 6, color: const Color(0xFF7B2FBE)),
                    ),
                    Expanded(
                      flex: ((1 - pctA) * 100).round(),
                      child: Container(height: 6, color: const Color(0xFFFF2D78)),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('$_scoreA GST', style: const TextStyle(color: Color(0xFF7B2FBE))),
                      Text('$_scoreB GST', style: const TextStyle(color: Color(0xFFFF2D78))),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
