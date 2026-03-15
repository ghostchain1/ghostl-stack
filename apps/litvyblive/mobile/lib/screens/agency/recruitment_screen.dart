import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../models/user_model.dart';

class RecruitmentScreen extends StatelessWidget {
  const RecruitmentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recruit Hosts')),
      body: FutureBuilder<List<UserModel>>(
        future: ApiService.instance.getTalentRecommendations(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final talents = snap.data ?? [];
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: talents.length,
            itemBuilder: (_, i) {
              final t = talents[i];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFF7B2FBE),
                    child: Text(t.username[0].toUpperCase()),
                  ),
                  title: Text(t.username),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Talent Score: ${t.talentScore ?? 0}',
                          style: const TextStyle(color: Color(0xFFFFD700))),
                      Text('Followers: ${t.followers}'),
                    ],
                  ),
                  trailing: ElevatedButton(
                    onPressed: () => _sendInvite(context, t.id),
                    child: const Text('Recruit'),
                  ),
                  isThreeLine: true,
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _sendInvite(BuildContext context, String userId) async {
    await ApiService.instance.sendRecruitInvite(userId);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Invite sent!')));
  }
}
