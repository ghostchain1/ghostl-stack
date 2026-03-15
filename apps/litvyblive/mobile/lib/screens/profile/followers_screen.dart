import 'package:flutter/material.dart';
import '../../models/user_model.dart';
import '../../services/api_service.dart';

enum FollowersTab { followers, following }

/// Displays the followers or following list for a user.
class FollowersScreen extends StatefulWidget {
  final String userId;
  final String username;
  final FollowersTab initialTab;

  const FollowersScreen({
    super.key,
    required this.userId,
    required this.username,
    this.initialTab = FollowersTab.followers,
  });

  @override
  State<FollowersScreen> createState() => _FollowersScreenState();
}

class _FollowersScreenState extends State<FollowersScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTab.index,
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0D0D1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0D0D1A),
        title: Text(
          '@${widget.username.toLowerCase()}.ghost',
          style: const TextStyle(color: Color(0xFF00D4FF), fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(0xFF7B2FBE),
          unselectedLabelColor: Colors.white54,
          indicatorColor: const Color(0xFF7B2FBE),
          tabs: const [
            Tab(text: 'Followers'),
            Tab(text: 'Following'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _UserList(userId: widget.userId, type: 'followers'),
          _UserList(userId: widget.userId, type: 'following'),
        ],
      ),
    );
  }
}

class _UserList extends StatefulWidget {
  final String userId;
  final String type; // 'followers' | 'following'
  const _UserList({required this.userId, required this.type});

  @override
  State<_UserList> createState() => _UserListState();
}

class _UserListState extends State<_UserList> {
  late Future<List<UserModel>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<UserModel>> _load() async {
    // The /users/:id/followers and /users/:id/following endpoints return
    // a list of UserModel-compatible objects.
    final raw = await ApiService.instance
        .get('/users/${widget.userId}/${widget.type}') as List<dynamic>;
    return raw
        .cast<Map<String, dynamic>>()
        .map(UserModel.fromJson)
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<UserModel>>(
      future: _future,
      builder: (_, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(
              child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation(Color(0xFF7B2FBE))));
        }
        if (snap.hasError) {
          return Center(
              child: Text('Failed to load ${widget.type}',
                  style: const TextStyle(color: Colors.redAccent)));
        }
        final users = snap.data ?? [];
        if (users.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.people_outline, size: 48, color: Colors.white24),
                const SizedBox(height: 12),
                Text(
                  widget.type == 'followers' ? 'No followers yet' : 'Not following anyone',
                  style: const TextStyle(color: Colors.white54, fontSize: 15),
                ),
              ],
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: users.length,
          itemBuilder: (_, i) => _UserTile(user: users[i]),
        );
      },
    );
  }
}

class _UserTile extends StatelessWidget {
  final UserModel user;
  const _UserTile({required this.user});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xFF7B2FBE),
        backgroundImage:
            user.avatarUrl.isNotEmpty ? NetworkImage(user.avatarUrl) : null,
        child: user.avatarUrl.isEmpty
            ? Text(
                user.username.isNotEmpty ? user.username[0].toUpperCase() : '?',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              )
            : null,
      ),
      title: Text(
        '@${user.username.toLowerCase()}.ghost',
        style: const TextStyle(
            color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
      ),
      subtitle: Text(
        'Lv ${user.level} · ${user.followers} followers',
        style: const TextStyle(color: Colors.white54, fontSize: 12),
      ),
      trailing: user.isHost
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFF7B2FBE), Color(0xFF00D4FF)]),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Text('LIVE',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold)),
            )
          : null,
      onTap: () => Navigator.of(context).pushNamed('/profile', arguments: user.id),
    );
  }
}
