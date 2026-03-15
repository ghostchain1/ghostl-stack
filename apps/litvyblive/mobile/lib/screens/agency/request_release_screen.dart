import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class RequestReleaseScreen extends StatefulWidget {
  const RequestReleaseScreen({super.key});

  @override
  State<RequestReleaseScreen> createState() => _RequestReleaseScreenState();
}

class _RequestReleaseScreenState extends State<RequestReleaseScreen> {
  final _reasonCtrl = TextEditingController();
  bool _loading = false;
  String? _result;

  Future<void> _submit() async {
    if (_reasonCtrl.text.trim().isEmpty) return;
    setState(() { _loading = true; _result = null; });
    try {
      final decision = await ApiService.instance.requestHostRelease(_reasonCtrl.text.trim());
      setState(() => _result = 'AI Mediator Decision: ${decision['status']}. '
          '${decision['message'] ?? ''}');
    } catch (e) {
      setState(() => _result = 'Error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Request Agency Release')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'GhostBrain AI will mediate your release request based on your contract terms.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _reasonCtrl,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Reason for release',
                border: OutlineInputBorder(),
              ),
            ),
            if (_result != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A2E),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_result!, style: const TextStyle(color: Color(0xFF00D4FF))),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7B2FBE),
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: _loading
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('Submit to AI Mediator'),
            ),
          ],
        ),
      ),
    );
  }
}
