import 'package:flutter/foundation.dart';

// ── Fan tier ──────────────────────────────────────────────────────────────────

enum FanTier { supporter, fan, vip, elite, legendary }

extension FanTierExt on FanTier {
  String get label {
    switch (this) {
      case FanTier.supporter: return 'Supporter';
      case FanTier.fan:       return 'Fan';
      case FanTier.vip:       return 'VIP';
      case FanTier.elite:     return 'Elite';
      case FanTier.legendary: return 'Legendary';
    }
  }

  static FanTier fromString(String s) {
    switch (s.toLowerCase()) {
      case 'fan':       return FanTier.fan;
      case 'vip':       return FanTier.vip;
      case 'elite':     return FanTier.elite;
      case 'legendary': return FanTier.legendary;
      default:          return FanTier.supporter;
    }
  }
}

// ── Creator token ─────────────────────────────────────────────────────────────

@immutable
class CreatorTokenModel {
  const CreatorTokenModel({
    required this.id,
    required this.creatorId,
    required this.creatorWallet,
    required this.name,
    required this.symbol,
    this.tokenAddress,
    required this.maxSupply,
    this.factoryTxHash,
    required this.isActive,
    required this.launchedAt,
  });

  final String  id;
  final String  creatorId;
  final String  creatorWallet;
  final String  name;
  final String  symbol;
  final String? tokenAddress;
  final double  maxSupply;
  final String? factoryTxHash;
  final bool    isActive;
  final DateTime launchedAt;

  bool get isConfirmed => tokenAddress != null;

  factory CreatorTokenModel.fromJson(Map<String, dynamic> j) => CreatorTokenModel(
        id:            j['id'] as String,
        creatorId:     j['creator_id'] as String,
        creatorWallet: j['creator_wallet'] as String,
        name:          j['name'] as String,
        symbol:        j['symbol'] as String,
        tokenAddress:  j['token_address'] as String?,
        maxSupply:     (j['max_supply'] as num).toDouble(),
        factoryTxHash: j['factory_tx_hash'] as String?,
        isActive:      (j['is_active'] as int) == 1,
        launchedAt:    DateTime.parse(j['launched_at'] as String),
      );
}

// ── Token sale ────────────────────────────────────────────────────────────────

@immutable
class TokenSaleModel {
  const TokenSaleModel({
    required this.id,
    required this.tokenId,
    required this.creatorId,
    required this.priceGst,
    required this.totalForSale,
    required this.sold,
    required this.proceedsClaimed,
    required this.startsAt,
    required this.endsAt,
    this.chainSaleId,
    required this.createdAt,
  });

  final String  id;
  final String  tokenId;
  final String  creatorId;
  final double  priceGst;
  final double  totalForSale;
  final double  sold;
  final double  proceedsClaimed;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? chainSaleId;
  final DateTime createdAt;

  double get remaining   => totalForSale - sold;
  double get progress    => totalForSale > 0 ? sold / totalForSale : 0;
  bool   get isActive    {
    final now = DateTime.now();
    return now.isAfter(startsAt) && now.isBefore(endsAt) && remaining > 0;
  }

  factory TokenSaleModel.fromJson(Map<String, dynamic> j) => TokenSaleModel(
        id:               j['id'] as String,
        tokenId:          j['token_id'] as String,
        creatorId:        j['creator_id'] as String,
        priceGst:         (j['price_gst'] as num).toDouble(),
        totalForSale:     (j['total_for_sale'] as num).toDouble(),
        sold:             (j['sold'] as num).toDouble(),
        proceedsClaimed:  (j['proceeds_claimed'] as num).toDouble(),
        startsAt:         DateTime.parse(j['starts_at'] as String),
        endsAt:           DateTime.parse(j['ends_at'] as String),
        chainSaleId:      j['chain_sale_id'] as String?,
        createdAt:        DateTime.parse(j['created_at'] as String),
      );
}

// ── Fan reward status ─────────────────────────────────────────────────────────

@immutable
class FanRewardStatus {
  const FanRewardStatus({
    required this.tokenId,
    required this.holding,
    required this.tier,
    required this.perks,
  });

  final String   tokenId;
  final double   holding;
  final FanTier  tier;
  final List<String> perks;

  factory FanRewardStatus.fromJson(Map<String, dynamic> j) => FanRewardStatus(
        tokenId: j['tokenId'] as String,
        holding: (j['holding'] as num).toDouble(),
        tier:    FanTierExt.fromString(j['tier'] as String),
        perks:   List<String>.from(j['perks'] as List),
      );
}

// ── DAO Proposal ──────────────────────────────────────────────────────────────

@immutable
class DAOProposalModel {
  const DAOProposalModel({
    required this.id,
    required this.tokenId,
    required this.creatorId,
    required this.proposerId,
    required this.description,
    required this.votesFor,
    required this.votesAgainst,
    required this.endsAt,
    required this.executed,
    this.chainProposalId,
    required this.createdAt,
  });

  final String  id;
  final String  tokenId;
  final String  creatorId;
  final String  proposerId;
  final String  description;
  final double  votesFor;
  final double  votesAgainst;
  final DateTime endsAt;
  final bool    executed;
  final String? chainProposalId;
  final DateTime createdAt;

  bool   get isOpen   => !executed && DateTime.now().isBefore(endsAt);
  bool   get hasPassed => votesFor > votesAgainst;
  double get totalVotes => votesFor + votesAgainst;

  factory DAOProposalModel.fromJson(Map<String, dynamic> j) => DAOProposalModel(
        id:               j['id'] as String,
        tokenId:          j['token_id'] as String,
        creatorId:        j['creator_id'] as String,
        proposerId:       j['proposer_id'] as String,
        description:      j['description'] as String,
        votesFor:         (j['votes_for'] as num).toDouble(),
        votesAgainst:     (j['votes_against'] as num).toDouble(),
        endsAt:           DateTime.parse(j['ends_at'] as String),
        executed:         (j['executed'] as int) == 1,
        chainProposalId:  j['chain_proposal_id'] as String?,
        createdAt:        DateTime.parse(j['created_at'] as String),
      );
}
