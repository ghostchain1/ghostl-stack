import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

// ── Models ────────────────────────────────────────────────────────────────────

class EconomyDashboard {
  final String creatorId;
  final String tier;
  final double score;
  final double salaryGst;
  final LeagueStanding? standing;
  final List<CompetitionEntry> recentCompetitions;
  final List<PromotionEvent> activePromotions;

  EconomyDashboard.fromJson(Map<String, dynamic> j)
      : creatorId = j['creatorId'] as String,
        tier = j['tier'] as String? ?? 'bronze',
        score = (j['score'] as num?)?.toDouble() ?? 0,
        salaryGst = (j['salaryGst'] as num?)?.toDouble() ?? 0,
        standing = j['standing'] != null
            ? LeagueStanding.fromJson(j['standing'] as Map<String, dynamic>)
            : null,
        recentCompetitions = (j['recentCompetitions'] as List? ?? [])
            .map((e) => CompetitionEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
        activePromotions = (j['activePromotions'] as List? ?? [])
            .map((e) => PromotionEvent.fromJson(e as Map<String, dynamic>))
            .toList();
}

class LeagueStanding {
  final String seasonId;
  final String leagueTier;
  final int rankInTier;
  final double score;
  final bool promoted;
  final bool relegated;

  LeagueStanding.fromJson(Map<String, dynamic> j)
      : seasonId = j['season_id'] as String? ?? '',
        leagueTier = j['league_tier'] as String? ?? 'bronze',
        rankInTier = (j['rank_in_tier'] as num?)?.toInt() ?? 0,
        score = (j['score'] as num?)?.toDouble() ?? 0,
        promoted = j['promoted'] == 1 || j['promoted'] == true,
        relegated = j['relegated'] == 1 || j['relegated'] == true;
}

class LeagueSeason {
  final String seasonId;
  final String seasonName;
  final String startsAt;
  final String endsAt;
  final String status;

  LeagueSeason.fromJson(Map<String, dynamic> j)
      : seasonId = j['season_id'] as String,
        seasonName = j['season_name'] as String,
        startsAt = j['starts_at'] as String,
        endsAt = j['ends_at'] as String,
        status = j['status'] as String;
}

class LeaderboardEntry {
  final String creatorId;
  final String tier;
  final int rankInTier;
  final double score;
  final bool promoted;
  final bool relegated;

  LeaderboardEntry.fromJson(Map<String, dynamic> j)
      : creatorId = j['creator_id'] as String,
        tier = j['league_tier'] as String? ?? 'bronze',
        rankInTier = (j['rank_in_tier'] as num?)?.toInt() ?? 0,
        score = (j['score'] as num?)?.toDouble() ?? 0,
        promoted = j['promoted'] == 1 || j['promoted'] == true,
        relegated = j['relegated'] == 1 || j['relegated'] == true;
}

class Competition {
  final String competitionId;
  final String title;
  final String type;
  final String cadence;
  final double prizePoolGst;
  final int maxParticipants;
  final double entryFeeGst;
  final String startsAt;
  final String endsAt;
  final String status;

  Competition.fromJson(Map<String, dynamic> j)
      : competitionId = j['competition_id'] as String,
        title = j['title'] as String,
        type = j['type'] as String,
        cadence = j['cadence'] as String,
        prizePoolGst = (j['prize_pool_gst'] as num?)?.toDouble() ?? 0,
        maxParticipants = (j['max_participants'] as num?)?.toInt() ?? 0,
        entryFeeGst = (j['entry_fee_gst'] as num?)?.toDouble() ?? 0,
        startsAt = j['starts_at'] as String,
        endsAt = j['ends_at'] as String,
        status = j['status'] as String;
}

class CompetitionEntry {
  final String entryId;
  final String competitionId;
  final String creatorId;
  final double score;
  final int? finalRank;
  final double? prizeGst;
  final String prizeStatus;

  CompetitionEntry.fromJson(Map<String, dynamic> j)
      : entryId = j['entry_id'] as String,
        competitionId = j['competition_id'] as String,
        creatorId = j['creator_id'] as String,
        score = (j['score'] as num?)?.toDouble() ?? 0,
        finalRank = (j['final_rank'] as num?)?.toInt(),
        prizeGst = (j['prize_gst'] as num?)?.toDouble(),
        prizeStatus = j['prize_status'] as String? ?? 'pending';
}

class PromotionEvent {
  final String eventId;
  final String creatorId;
  final String trigger;
  final String action;
  final String? expiresAt;
  final bool active;

  PromotionEvent.fromJson(Map<String, dynamic> j)
      : eventId = j['event_id'] as String,
        creatorId = j['creator_id'] as String,
        trigger = j['trigger'] as String,
        action = j['action'] as String,
        expiresAt = j['expires_at'] as String?,
        active = j['active'] == 1 || j['active'] == true;
}

// ── Service ───────────────────────────────────────────────────────────────────

class EconomyService {
  EconomyService._();
  static final instance = EconomyService._();

  String get _base => '${ApiService.instance.baseUrl}/economy';
  Map<String, String> get _headers => ApiService.instance.authHeaders;

  // ── Dashboard ──────────────────────────────────────────────────────────────

  Future<EconomyDashboard> getDashboard(String creatorId) async {
    final res = await http.get(Uri.parse('$_base/dashboard/$creatorId'), headers: _headers);
    _check(res);
    return EconomyDashboard.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  // ── Leagues ────────────────────────────────────────────────────────────────

  Future<List<LeagueSeason>> listSeasons() async {
    final res = await http.get(Uri.parse('$_base/leagues/seasons'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['seasons'] as List)
        .map((e) => LeagueSeason.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LeagueSeason?> getActiveSeason() async {
    final res = await http.get(Uri.parse('$_base/leagues/seasons/active'), headers: _headers);
    if (res.statusCode == 404) return null;
    _check(res);
    return LeagueSeason.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<LeaderboardEntry>> getLeaderboard(String seasonId, String tier) async {
    final res = await http.get(Uri.parse('$_base/leagues/$seasonId/leaderboard/$tier'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['standings'] as List)
        .map((e) => LeaderboardEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LeagueStanding?> getMyStanding(String seasonId, String creatorId) async {
    final res = await http.get(Uri.parse('$_base/leagues/$seasonId/standing/$creatorId'), headers: _headers);
    if (res.statusCode == 404) return null;
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return LeagueStanding.fromJson(body['standing'] as Map<String, dynamic>);
  }

  // ── Competitions ───────────────────────────────────────────────────────────

  Future<List<Competition>> listCompetitions({String? status}) async {
    final query = status != null ? '?status=$status' : '';
    final res = await http.get(Uri.parse('$_base/competitions$query'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['competitions'] as List)
        .map((e) => Competition.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Competition> getCompetition(String id) async {
    final res = await http.get(Uri.parse('$_base/competitions/$id'), headers: _headers);
    _check(res);
    return Competition.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<CompetitionEntry> enterCompetition(String competitionId, String creatorId) async {
    final res = await http.post(
      Uri.parse('$_base/competitions/$competitionId/enter'),
      headers: {..._headers, 'Content-Type': 'application/json'},
      body: jsonEncode({'creatorId': creatorId}),
    );
    _check(res);
    return CompetitionEntry.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<CompetitionEntry?> getMyEntry(String competitionId, String creatorId) async {
    final res = await http.get(
      Uri.parse('$_base/competitions/$competitionId/my-entry?creatorId=$creatorId'),
      headers: _headers,
    );
    if (res.statusCode == 404) return null;
    _check(res);
    return CompetitionEntry.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  Future<List<CompetitionEntry>> getCompetitionHistory(String creatorId) async {
    final res = await http.get(Uri.parse('$_base/competitions/creator/$creatorId/history'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['entries'] as List)
        .map((e) => CompetitionEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Promotions ─────────────────────────────────────────────────────────────

  Future<List<PromotionEvent>> getMyPromotions(String creatorId) async {
    final res = await http.get(Uri.parse('$_base/promotions/$creatorId/active'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['promotions'] as List)
        .map((e) => PromotionEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  void _check(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('EconomyService ${res.statusCode}: ${res.body}');
    }
  }
}
