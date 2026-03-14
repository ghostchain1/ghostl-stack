export default async function TokensPage() {
  const { TokensConsole } = await import('../../src/modules/tokens/TokensConsole');
  return <TokensConsole />;
}
