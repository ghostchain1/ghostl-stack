import 'package:test/test.dart';
import 'package:ghost_flutter_sdk/ghost_flutter_sdk.dart';

void main() {
  // ── GhostToken ─────────────────────────────────────────────────────────────
  group('GhostToken', () {
    test('symbol is GST', () => expect(GhostToken.symbol, 'GST'));
    test('name is Ghost Token', () => expect(GhostToken.name, 'Ghost Token'));
    test('decimals is 18', () => expect(GhostToken.decimals, 18));
    test('chainId is 903 (GhostL3)', () => expect(GhostToken.chainId, 903));

    test('toWei(1.0) == 1e18', () {
      expect(GhostToken.toWei(1.0), BigInt.parse('1000000000000000000'));
    });

    test('toWei(0.5) == 5e17', () {
      expect(GhostToken.toWei(0.5), BigInt.parse('500000000000000000'));
    });

    test('formatWei(1e18) == "1.0000 GST"', () {
      expect(
        GhostToken.formatWei(BigInt.parse('1000000000000000000')),
        '1.0000 GST',
      );
    });

    test('formatWei(0) == "0.0000 GST"', () {
      expect(GhostToken.formatWei(BigInt.zero), '0.0000 GST');
    });
  });

  // ── GhostBalance ───────────────────────────────────────────────────────────
  group('GhostBalance', () {
    test('gst converts wei to double', () {
      final b = GhostBalance(wei: BigInt.parse('2000000000000000000'));
      expect(b.gst, closeTo(2.0, 0.0001));
    });

    test('chainId defaults to 903', () {
      expect(GhostBalance(wei: BigInt.zero).chainId, 903);
    });

    test('toJson / fromJson round-trip', () {
      final original = GhostBalance(
        wei: BigInt.parse('1000000000000000000'),
        stakedWei: BigInt.parse('500000000000000000'),
      );
      final decoded = GhostBalance.fromJson(original.toJson());
      expect(decoded.wei, original.wei);
      expect(decoded.stakedWei, original.stakedWei);
      expect(decoded.chainId, 903);
    });

    test('toString includes GST symbol', () {
      final b = GhostBalance(wei: BigInt.parse('1000000000000000000'));
      expect(b.toString(), contains('GST'));
      expect(b.toString(), contains('903'));
    });
  });

  // ── GhostTx ────────────────────────────────────────────────────────────────
  group('GhostTx', () {
    test('chainId defaults to 903', () {
      final tx = GhostTx(
        hash: '0xabc',
        from: '0x1',
        to: '0x2',
        valueWei: BigInt.zero,
        timestamp: DateTime.now(),
      );
      expect(tx.chainId, 903);
    });

    test('isPending defaults to false', () {
      final tx = GhostTx(
        hash: '0xabc',
        from: '0x1',
        to: '0x2',
        valueWei: BigInt.zero,
        timestamp: DateTime.now(),
      );
      expect(tx.isPending, isFalse);
    });

    test('toJson / fromJson round-trip', () {
      final now = DateTime.now().toUtc();
      final original = GhostTx(
        hash: '0xdeadbeef',
        from: '0xsender',
        to: '0xrecipient',
        valueWei: BigInt.parse('1000000000000000000'),
        timestamp: now,
        isPending: true,
      );
      final decoded = GhostTx.fromJson(original.toJson());
      expect(decoded.hash, original.hash);
      expect(decoded.from, original.from);
      expect(decoded.to, original.to);
      expect(decoded.valueWei, original.valueWei);
      expect(decoded.isPending, isTrue);
      expect(decoded.chainId, 903);
    });

    test('gstAmount converts wei correctly', () {
      final tx = GhostTx(
        hash: '0x1',
        from: '0xa',
        to: '0xb',
        valueWei: BigInt.parse('5000000000000000000'),
        timestamp: DateTime.now(),
      );
      expect(tx.gstAmount, closeTo(5.0, 0.0001));
    });
  });

  // ── GhostHdWallet ──────────────────────────────────────────────────────────
  group('GhostHdWallet', () {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    test('validates mnemonic on construction', () {
      final hd = GhostHdWallet(testMnemonic);
      expect(hd.mnemonic, testMnemonic);
    });

    test('throws ArgumentError on invalid mnemonic', () {
      expect(() => GhostHdWallet('not a valid mnemonic'), throwsArgumentError);
    });

    test('generate() produces a 12-word mnemonic by default', () {
      final hd = GhostHdWallet.generate();
      expect(hd.mnemonic.split(' ').length, 12);
    });

    test('generate(strength: 256) produces a 24-word mnemonic', () {
      final hd = GhostHdWallet.generate(strength: 256);
      expect(hd.mnemonic.split(' ').length, 24);
    });

    test('deriveWallet is deterministic for the same mnemonic', () {
      final hd = GhostHdWallet(testMnemonic);
      final w1 = hd.deriveWallet();
      final w2 = hd.deriveWallet();
      expect(w1.address.hex.toLowerCase(), w2.address.hex.toLowerCase());
    });

    test('different account indices produce different addresses', () {
      final hd = GhostHdWallet(testMnemonic);
      final w0 = hd.deriveWallet(accountIndex: 0);
      final w1 = hd.deriveWallet(accountIndex: 1);
      expect(w0.address.hex.toLowerCase(),
          isNot(equals(w1.address.hex.toLowerCase())));
    });

    test('different address indices produce different addresses', () {
      final hd = GhostHdWallet(testMnemonic);
      final w0 = hd.deriveWallet(addressIndex: 0);
      final w1 = hd.deriveWallet(addressIndex: 1);
      expect(w0.address.hex.toLowerCase(),
          isNot(equals(w1.address.hex.toLowerCase())));
    });

    test('derived address is a valid hex EVM address (42 chars, 0x prefix)', () {
      final hd = GhostHdWallet(testMnemonic);
      final w = hd.deriveWallet();
      final hex = w.address.hex;
      expect(hex, startsWith('0x'));
      expect(hex.length, 42);
    });
  });

  // ── GhostWallet.fromMnemonic ───────────────────────────────────────────────
  group('GhostWallet.fromMnemonic', () {
    const testMnemonic =
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    test('creates wallet without throwing', () {
      final wallet = GhostWallet.fromMnemonic(testMnemonic);
      expect(wallet.address.hex, isNotEmpty);
    });

    test('deterministic — same mnemonic same address', () {
      final w1 = GhostWallet.fromMnemonic(testMnemonic);
      final w2 = GhostWallet.fromMnemonic(testMnemonic);
      expect(w1.address.hex.toLowerCase(), w2.address.hex.toLowerCase());
    });
  });

  // ── GhostProvider ─────────────────────────────────────────────────────────
  group('GhostProvider', () {
    test('chainId constant is 903', () {
      expect(GhostProvider.chainId, 903);
    });
  });

  // ── GhostContracts ────────────────────────────────────────────────────────
  group('GhostContracts', () {
    test('l2L3Bridge address matches canonical value', () {
      expect(GhostContracts.l2L3Bridge,
          '0xDadd1125B8Df98A66Abd5EB302C0d9Ca5A061dC2');
    });

    test('l1Rollup address matches canonical value', () {
      expect(GhostContracts.l1Rollup,
          '0xad32D5C2Da9f4159C4cc98686C005852b3905355');
    });

    test('l2Rollup address matches canonical value', () {
      expect(GhostContracts.l2Rollup,
          '0x130A46b6E41DB6E1e18fb9c759F223c459190e90');
    });

    test('finalityOracleL3 address matches canonical value', () {
      expect(GhostContracts.finalityOracleL3,
          '0x87F850cbC2cFfac086F20d0d7307E12d06fA2127');
    });

    test('chain IDs are correct', () {
      expect(GhostContracts.chainIdL1, 14000101);
      expect(GhostContracts.chainIdL2, 901);
      expect(GhostContracts.chainIdL3, 903);
    });
  });

  // ── GhostTransaction helpers ──────────────────────────────────────────────
  group('GhostTransaction.weiToGst', () {
    test('includes GST suffix', () {
      final result = GhostTransaction.weiToGst(BigInt.parse('1000000000000000000'));
      expect(result, contains('GST'));
    });

    test('0 wei returns "0.0 GST" or similar', () {
      final result = GhostTransaction.weiToGst(BigInt.zero);
      expect(result, contains('0'));
      expect(result, contains('GST'));
    });
  });

  // ── GhostNft ───────────────────────────────────────────────────────────────
  group('GhostNft', () {
    final nft = GhostNft(
      tokenId: BigInt.from(42),
      contractAddress: '0xAbCd1234000000000000000000000000000000AB',
      ownerAddress: '0xOwner000000000000000000000000000000000001',
      metadataUri: 'ghost://nfts/42/metadata.json',
      name: 'GhostPunk #42',
      collection: 'GhostPunks',
      standard: NftStandard.grc721,
      chainId: 903,
      creatorAddress: '0xCreator0000000000000000000000000000000001',
      royaltyBps: 500,
    );

    test('chainId is 903', () => expect(nft.chainId, 903));
    test('standard is grc721 (not erc721)', () => expect(nft.standard, NftStandard.grc721));
    test('displayName uses collection', () => expect(nft.displayName, 'GhostPunks #42'));
    test('isGiftNft is false when giftId is null', () => expect(nft.isGiftNft, isFalse));

    test('toJson / fromJson round-trip', () {
      final decoded = GhostNft.fromJson(nft.toJson());
      expect(decoded.tokenId, nft.tokenId);
      expect(decoded.contractAddress, nft.contractAddress);
      expect(decoded.ownerAddress, nft.ownerAddress);
      expect(decoded.chainId, 903);
      expect(decoded.standard, NftStandard.grc721);
      expect(decoded.royaltyBps, 500);
    });

    test('equality by tokenId + contractAddress + chainId', () {
      final dup = GhostNft.fromJson(nft.toJson());
      expect(dup, equals(nft));
    });

    test('gift NFT with giftId', () {
      final giftNft = GhostNft(
        tokenId: BigInt.one,
        contractAddress: '0x0000000000000000000000000000000000000001',
        ownerAddress: '0x0000000000000000000000000000000000000002',
        metadataUri: 'ghost://gifts/1',
        name: 'Dragon Gift',
        giftId: 'gift_dragon_001',
      );
      expect(giftNft.isGiftNft, isTrue);
      expect(giftNft.displayName, 'Dragon Gift');
    });
  });

  // ── GhostCreator ───────────────────────────────────────────────────────────
  group('GhostCreator', () {
    final creator = GhostCreator(
      address: '0xCreator0000000000000000000000000000000099',
      gnsName: 'ghostdj.ghost',
      displayName: 'Ghost DJ',
      isVerified: true,
      fanTokenAddress: '0xFanToken000000000000000000000000000000FF',
      fanTokenSymbol: 'GHOSTDJ',
      totalEarningsGSTWei: BigInt.parse('100000000000000000000'), // 100 GST
      followerCount: 50000,
      socialLinks: {'twitter': 'https://ghost.social/ghostdj'},
    );

    test('shortName uses GNS name when available', () {
      expect(creator.shortName, 'ghostdj.ghost');
    });

    test('shortName falls back to shortened address', () {
      final noGns = GhostCreator(address: '0xAbCd1234567890AbCd1234567890AbCd12345678', displayName: 'No GNS');
      expect(noGns.shortName, startsWith('0x'));
      expect(noGns.shortName, contains('...'));
    });

    test('hasFanToken is true', () => expect(creator.hasFanToken, isTrue));
    test('isVerified is true', () => expect(creator.isVerified, isTrue));

    test('toJson / fromJson round-trip', () {
      final decoded = GhostCreator.fromJson(creator.toJson());
      expect(decoded.address, creator.address);
      expect(decoded.gnsName, 'ghostdj.ghost');
      expect(decoded.fanTokenSymbol, 'GHOSTDJ');
      expect(decoded.followerCount, 50000);
      expect(decoded.totalEarningsGSTWei, creator.totalEarningsGSTWei);
      expect(decoded.isVerified, isTrue);
    });

    test('equality by address', () {
      final dup = GhostCreator.fromJson(creator.toJson());
      expect(dup, equals(creator));
    });
  });

  // ── GhostEvent ─────────────────────────────────────────────────────────────
  group('GhostEvent', () {
    final liveEvent = GhostEvent(
      eventId: 'evt_concert_001',
      name: 'GhostChain Genesis Concert',
      type: GhostEventType.concert,
      hostAddress: '0xDJ00000000000000000000000000000000000001',
      ticketPriceGSTWei: BigInt.parse('5000000000000000000'), // 5 GST
      maxAttendees: 2000,
      attendeeCount: 1500,
      startAt: 1700000000000,
      status: GhostEventStatus.live,
      streamUrl: 'ghost://streams/genesis-concert',
      totalGiftsGSTWei: BigInt.parse('150000000000000000000'), // 150 GST
    );

    test('isLive is true for live event', () => expect(liveEvent.isLive, isTrue));
    test('isFree is false for ticketed event', () => expect(liveEvent.isFree, isFalse));
    test('hasStream is true', () => expect(liveEvent.hasStream, isTrue));
    test('isFull reflects capacity', () => expect(liveEvent.isFull, isFalse));

    test('formattedTicketPrice shows GST', () {
      expect(liveEvent.formattedTicketPrice, contains('GST'));
      expect(liveEvent.formattedTicketPrice, contains('5.00'));
    });

    test('formattedTotalGifts shows GST', () {
      expect(liveEvent.formattedTotalGifts, contains('GST'));
      expect(liveEvent.formattedTotalGifts, contains('150.00'));
    });

    test('toJson / fromJson round-trip', () {
      final decoded = GhostEvent.fromJson(liveEvent.toJson());
      expect(decoded.eventId, 'evt_concert_001');
      expect(decoded.type, GhostEventType.concert);
      expect(decoded.status, GhostEventStatus.live);
      expect(decoded.ticketPriceGSTWei, liveEvent.ticketPriceGSTWei);
      expect(decoded.totalGiftsGSTWei, liveEvent.totalGiftsGSTWei);
    });

    test('free event — isFree is true', () {
      final free = GhostEvent(
        eventId: 'evt_free_001',
        name: 'Free Community Stream',
        type: GhostEventType.liveStream,
        hostAddress: '0x0000000000000000000000000000000000000001',
        status: GhostEventStatus.scheduled,
      );
      expect(free.isFree, isTrue);
      expect(free.formattedTicketPrice, 'Free');
    });

    test('type.apiName matches JSON convention', () {
      expect(GhostEventType.liveStream.apiName, 'live-stream');
      expect(GhostEventType.gamingTournament.apiName, 'gaming-tournament');
      expect(GhostEventType.nftDrop.apiName, 'nft-drop');
    });

    test('equality by eventId', () {
      final dup = GhostEvent.fromJson(liveEvent.toJson());
      expect(dup, equals(liveEvent));
    });
  });

  // ── GhostBridgeService static constants ───────────────────────────────────
  group('GhostBridgeService constants', () {
    test('L3 chain ID is 903', () => expect(GhostBridgeService.l3ChainId, 903));
    test('L2 chain ID is 901', () => expect(GhostBridgeService.l2ChainId, 901));
    test('L1 chain ID is 14000101', () => expect(GhostBridgeService.l1ChainId, 14000101));
    test('minimum bridge amount is positive', () {
      expect(GhostBridgeService.minBridgeWei > BigInt.zero, isTrue);
    });
  });

  // ── GhostXService static constants ────────────────────────────────────────
  group('GhostXService constants', () {
    test('protocol fee is 30 bps', () => expect(GhostXService.protocolFeeBps, 30));
    test('calcFee on 1 GST is correct bps', () {
      final oneGST = BigInt.parse('1000000000000000000');
      final fee = GhostXService.calcFee(oneGST);
      // 0.3% of 1 GST = 3e15 wei
      expect(fee, BigInt.parse('3000000000000000'));
    });
    test('l3ChainId is 903', () => expect(GhostXService.l3ChainId, 903));
  });
}
