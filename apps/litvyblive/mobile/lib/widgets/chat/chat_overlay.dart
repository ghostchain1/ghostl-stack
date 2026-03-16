import 'package:flutter/material.dart';
import '../../services/socket_service.dart';

/// Scrolling chat messages overlaid on the live stream.
class ChatOverlay extends StatefulWidget {
  final String streamId;
  const ChatOverlay({super.key, this.streamId = ''});

  @override
  State<ChatOverlay> createState() => _ChatOverlayState();
}

class _ChatOverlayState extends State<ChatOverlay> {
  final _messages = <Map<String, dynamic>>();
  final _msgCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    SocketService.instance.onChatMessage((msg) {
      if (mounted) {
        setState(() {
          _messages.add(msg);
          if (_messages.length > 100) _messages.removeAt(0);
        });
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _send() {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty) return;
    SocketService.instance.sendChatMessage(widget.streamId, text);
    _msgCtrl.clear();
  }

  @override
  void dispose() {
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 260,
      height: 220,
      child: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final m = _messages[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: RichText(
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: '${m['sender']}: ',
                          style: const TextStyle(
                              color: Color(0xFF00D4FF), fontWeight: FontWeight.bold),
                        ),
                        TextSpan(
                          text: m['text'],
                          style: const TextStyle(color: Colors.white, shadows: [
                            Shadow(blurRadius: 4, color: Colors.black)
                          ]),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _msgCtrl,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    hintText: 'Say something...',
                    hintStyle: const TextStyle(color: Colors.white54, fontSize: 13),
                    filled: true,
                    fillColor: Colors.black45,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              IconButton(icon: const Icon(Icons.send, size: 18, color: Colors.white70), onPressed: _send),
            ],
          ),
        ],
      ),
    );
  }
}
