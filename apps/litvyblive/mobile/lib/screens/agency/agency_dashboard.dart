import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../services/api_service.dart';
import '../../models/agency_model.dart';

class AgencyDashboard extends StatelessWidget {
  const AgencyDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Agency Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.chat),
            onPressed: () => context.go('/agency/chat'),
          ),
        ],
      ),
      body: FutureBuilder<AgencyModel>(
        future: ApiService.instance.getMyAgency(),
        builder: (_, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final agency = snap.data;
          if (agency == null) {
            return Center(
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('Create Agency'),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StatCard(title: 'Agency', value: agency.name, icon: Icons.business),
              _StatCard(title: 'Hosts', value: '${agency.hostsCount}', icon: Icons.people),
              _StatCard(title: 'Monthly Revenue', value: '${agency.monthlyRevenue} GST', icon: Icons.trending_up),
              _StatCard(title: 'Ranking', value: '#${agency.ranking}', icon: Icons.leaderboard),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => context.go('/agency/recruit'),
                icon: const Icon(Icons.person_add),
                label: const Text('Recruit Host'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => context.go('/agency/release'),
                icon: const Icon(Icons.exit_to_app),
                label: const Text('Host Release Requests'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title, value;
  final IconData icon;
  const _StatCard({required this.title, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFF7B2FBE)),
        title: Text(title, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        subtitle: Text(value,
            style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
