export default async function StocksPage() {
  const { StocksDashboard } = await import('../../src/modules/stocks/StocksDashboard');
  return <StocksDashboard />;
}
