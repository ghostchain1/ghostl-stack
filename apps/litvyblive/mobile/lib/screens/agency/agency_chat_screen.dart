import 'package:flutter/material.dart';
import '../../services/socket_service.dart';

class AgencyChatScreen extends StatefulWidget {
  const AgencyChatScreen({super.key});

  @override
  State<AgencyChatScreen> createState() => _AgencyChatScreenState();
}

class _AgencyChatScreenState extends State<AgencyChatScreen> {
  final _msgCtrl = TextEditingController();
  final _messages = <Map<String, String>>[];
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    SocketService.instance.onAgencyMessage((msg) {
      setState(() => _messages.add(msg));
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
    SocketService.instance.joinAgencyChat();
  }

  void _send() {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    SocketService.instance.sendAgencyMessage(text);
    _msgCtrl.clear();
  }

  @override
  void dispose() {
    SocketService.instance.leaveAgencyChat();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agency Chat')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final m = _messages[i];
                final isMe = m['sender'] == 'me';
                return Align(
                  alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isMe ? const Color(0xFF7B2FBE) : const Color(0xFF1A1A2E),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (!isMe)
                          Text(m['sender'] ?? '',
                              style: const TextStyle(
                                  color: Color(0xFF00D4FF), fontSize: 11)),
                        Text(m['text'] ?? ''),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom + 8,
              left: 12,
              right: 12,
              top: 8,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Message agency...',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12),
                    ),
                    onSubmitted: (_) => _send(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send, color: Color(0xFF7B2FBE)),
                  onPressed: _send,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
