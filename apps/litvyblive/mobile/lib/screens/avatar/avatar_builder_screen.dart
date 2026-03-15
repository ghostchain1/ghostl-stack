import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AvatarBuilderScreen extends StatefulWidget {
  const AvatarBuilderScreen({super.key});

  @override
  State<AvatarBuilderScreen> createState() => _AvatarBuilderScreenState();
}

class _AvatarBuilderScreenState extends State<AvatarBuilderScreen> {
  String _baseBody = 'base_01';
  String _hairStyle = 'hair_wave';
  String _clothing = 'neon_jacket';
  final _equippedNfts = <String>[];
  bool _saving = false;

  static const _bodies = ['base_01', 'base_02', 'base_03'];
  static const _hairs = ['hair_wave', 'hair_short', 'hair_long', 'hair_curly'];
  static const _clothes = ['neon_jacket', 'cyber_hoodie', 'dj_vest', 'street_wear'];

  Future<void> _save() async {
    setState(() => _saving = true);
    await ApiService.instance.saveAvatarConfig({
      'base_body': _baseBody,
      'hair': _hairStyle,
      'clothing': _clothing,
      'nft_items': _equippedNfts,
    });
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Avatar saved!')));
      setState(() => _saving = false);
    }
  }

  Widget _buildSelector<T>(String label, List<String> options, String current,
      void Function(String) onChanged) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: options.map((o) {
            final selected = o == current;
            return ChoiceChip(
              label: Text(o),
              selected: selected,
              onSelected: (_) => onChanged(o),
              selectedColor: const Color(0xFF7B2FBE),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Avatar Studio'),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: const Text('Save', style: TextStyle(color: Color(0xFF00D4FF))),
          ),
        ],
      ),
      body: Column(
        children: [
          // Avatar 3D preview placeholder
          Container(
            height: 200,
            color: Colors.black87,
            alignment: Alignment.center,
            child: const Icon(Icons.face_retouching_natural, size: 80, color: Colors.white38),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildSelector('Base Body', _bodies, _baseBody,
                      (v) => setState(() => _baseBody = v)),
                  _buildSelector('Hair Style', _hairs, _hairStyle,
                      (v) => setState(() => _hairStyle = v)),
                  _buildSelector('Clothing', _clothes, _clothing,
                      (v) => setState(() => _clothing = v)),
                  const Text('NFT Accessories',
                      style: TextStyle(color: Colors.white70, fontSize: 12)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.store),
                    label: const Text('Browse NFT Store (GhostL3)'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
