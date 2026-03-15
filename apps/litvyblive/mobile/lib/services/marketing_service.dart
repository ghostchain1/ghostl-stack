import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_service.dart';

// ── Models ───────────────────────────────────────────────────────────────────

class TrendingCreator {
  final String creatorId;
  final String signal;
  final double score;
  final String updatedAt;

  TrendingCreator.fromJson(Map<String, dynamic> j)
      : creatorId = j['creator_id'] as String,
        signal    = j['signal']     as String,
        score     = (j['score'] as num).toDouble(),
        updatedAt = j['updated_at'] as String;
}

class Campaign {
  final String  campaignId;
  final String? creatorId;
  final String  type;
  final String  title;
  final String  description;
  final double  budgetGst;
  final double  spentGst;
  final String  startsAt;
  final String  endsAt;
  final String  status;
  final String? vaultTxHash;
  final String  createdAt;

  Campaign.fromJson(Map<String, dynamic> j)
      : campaignId  = j['campaign_id'] as String,
        creatorId   = j['creator_id']  as String?,
        type        = j['type']        as String,
        title       = j['title']       as String,
        description = j['description'] as String,
        budgetGst   = (j['budget_gst'] as num).toDouble(),
        spentGst    = (j['spent_gst']  as num).toDouble(),
        startsAt    = j['starts_at']   as String,
        endsAt      = j['ends_at']     as String,
        status      = j['status']      as String,
        vaultTxHash = j['vault_tx_hash'] as String?,
        createdAt   = j['created_at']  as String;

  double get remainingBudget => budgetGst - spentGst;
  bool   get isActive        => status == 'active';
}

class SocialDistribution {
  final String  distId;
  final String  campaignId;
  final String  creatorId;
  final String  channel;
  final String  content;
  final String? clipUrl;
  final String  hashtags;
  final String  status;
  final String? sentAt;
  final String  createdAt;

  SocialDistribution.fromJson(Map<String, dynamic> j)
      : distId     = j['dist_id']     as String,
        campaignId = j['campaign_id'] as String,
        creatorId  = j['creator_id']  as String,
        channel    = j['channel']     as String,
        content    = j['content']     as String,
        clipUrl    = j['clip_url']    as String?,
        hashtags   = j['hashtags']    as String,
        status     = j['status']      as String,
        sentAt     = j['sent_at']     as String?,
        createdAt  = j['created_at']  as String;
}

class CampaignROI {
  final String campaignId;
  final String campaignTitle;
  final double budgetGst;
  final double giftRevenueDelta;
  final int    newFollowers;
  final double roiPct;

  CampaignROI.fromJson(Map<String, dynamic> j)
      : campaignId       = j['campaign_id']        as String,
        campaignTitle    = j['campaign_title']      as String,
        budgetGst        = (j['budget_gst']         as num).toDouble(),
        giftRevenueDelta = (j['gift_revenue_delta'] as num).toDouble(),
        newFollowers     = (j['new_followers']       as num).toInt(),
        roiPct           = (j['roi_pct']             as num).toDouble();
}

class GrowthSummary {
  final int    totalNewUsers;
  final double totalGiftsGst;
  final int    totalNewFollowers;
  final double avgRoiPct;
  final String? topCampaignId;

  GrowthSummary.fromJson(Map<String, dynamic> j)
      : totalNewUsers      = (j['totalNewUsers']      as num).toInt(),
        totalGiftsGst      = (j['totalGiftsGst']      as num).toDouble(),
        totalNewFollowers  = (j['totalNewFollowers']   as num).toInt(),
        avgRoiPct          = (j['avgRoiPct']           as num).toDouble(),
        topCampaignId      = j['topCampaignId']        as String?;
}

class ChannelReach {
  final String channel;
  final int    sent;
  final int    failed;
  final int    queued;

  ChannelReach.fromJson(Map<String, dynamic> j)
      : channel = j['channel'] as String,
        sent    = (j['sent']   as num).toInt(),
        failed  = (j['failed'] as num).toInt(),
        queued  = (j['queued'] as num).toInt();
}

class MarketingStatus {
  final int trendingCount;
  final int activeCampaigns;
  final int completeCampaigns;
  final int totalDistributed;

  MarketingStatus.fromJson(Map<String, dynamic> j)
      : trendingCount     = (j['trendingCount']     as num).toInt(),
        activeCampaigns   = (j['activeCampaigns']   as num).toInt(),
        completeCampaigns = (j['completeCampaigns'] as num).toInt(),
        totalDistributed  = (j['totalDistributed']  as num).toInt();
}

// ── Service ───────────────────────────────────────────────────────────────────

class MarketingService {
  MarketingService._();
  static final instance = MarketingService._();

  String get _base   => '${ApiService.instance.baseUrl}/marketing';
  Map<String, String> get _headers => ApiService.instance.authHeaders;

  // ── Viral detection ────────────────────────────────────────────────────────

  Future<List<TrendingCreator>> getTrendingCreators({int limit = 20}) async {
    final res = await http.get(
      Uri.parse('$_base/viral/trending?limit=$limit'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['creators'] as List)
        .map((e) => TrendingCreator.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Campaigns ──────────────────────────────────────────────────────────────

  Future<List<Campaign>> getCampaigns({String? status, String? creatorId}) async {
    final params = <String, String>{};
    if (status    != null) params['status']    = status;
    if (creatorId != null) params['creatorId'] = creatorId;
    final uri = Uri.parse('$_base/campaigns').replace(queryParameters: params);
    final res = await http.get(uri, headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['campaigns'] as List)
        .map((e) => Campaign.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Campaign> getCampaign(String id) async {
    final res = await http.get(Uri.parse('$_base/campaigns/$id'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return Campaign.fromJson(body['campaign'] as Map<String, dynamic>);
  }

  Future<List<Campaign>> getCreatorCampaigns(String creatorId) async {
    final res = await http.get(
      Uri.parse('$_base/campaigns/creator/$creatorId'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['campaigns'] as List)
        .map((e) => Campaign.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<ChannelReach>> getCampaignReach(String campaignId) async {
    final res = await http.get(
      Uri.parse('$_base/campaigns/$campaignId/reach'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['summary'] as List)
        .map((e) => ChannelReach.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Social distributions ───────────────────────────────────────────────────

  Future<List<SocialDistribution>> getCreatorDistributions(String creatorId) async {
    final res = await http.get(
      Uri.parse('$_base/social/$creatorId'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['distributions'] as List)
        .map((e) => SocialDistribution.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  Future<CampaignROI> getCampaignROI(String campaignId) async {
    final res = await http.get(
      Uri.parse('$_base/analytics/roi/$campaignId'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return CampaignROI.fromJson(body['roi'] as Map<String, dynamic>);
  }

  Future<List<CampaignROI>> getAllROIs() async {
    final res = await http.get(
      Uri.parse('$_base/analytics/roi'),
      headers: _headers,
    );
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (body['rois'] as List)
        .map((e) => CampaignROI.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GrowthSummary> getGrowthSummary({String? from, String? to}) async {
    final params = <String, String>{};
    if (from != null) params['from'] = from;
    if (to   != null) params['to']   = to;
    final uri = Uri.parse('$_base/analytics/growth').replace(queryParameters: params);
    final res = await http.get(uri, headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return GrowthSummary.fromJson(body['summary'] as Map<String, dynamic>);
  }

  // ── AI orchestration ───────────────────────────────────────────────────────

  Future<MarketingStatus> getAIStatus() async {
    final res = await http.get(Uri.parse('$_base/ai/status'), headers: _headers);
    _check(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return MarketingStatus.fromJson(body['status'] as Map<String, dynamic>);
  }

  Future<void> triggerMarketingCycle() async {
    final res = await http.post(Uri.parse('$_base/ai/cycle'), headers: _headers);
    _check(res);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  void _check(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('MarketingService ${res.statusCode}: ${res.body}');
    }
  }
}
