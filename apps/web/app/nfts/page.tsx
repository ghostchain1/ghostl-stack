export default async function NftsPage() {
  const { NftManagement } = await import('../../src/modules/nfts/NftManagement');
  return <NftManagement />;
}
