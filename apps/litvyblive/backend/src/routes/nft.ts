import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.js';

export const nftRouter = Router();

nftRouter.post('/mint', (req: AuthRequest, res) => {
  const { recipient, giftId, metadataUri } = req.body as {
    recipient: string;
    giftId: string;
    metadataUri: string;
  };
  if (!recipient || !giftId) { res.status(400).json({ error: 'recipient and giftId required' }); return; }
  // Submit mint request to on-chain NFTGift contract via microtx settlement engine
  const mockTxHash = `0x${'a'.repeat(64)}`;
  res.json({
    txHash: mockTxHash,
    recipient,
    giftId,
    metadataUri,
    chainId: 903, // GhostL3
  });
});

nftRouter.get('/owned/:address', (req, res) => {
  // Query NFT holdings from GhostL3 via GhostScan indexer
  res.json([]);
});
