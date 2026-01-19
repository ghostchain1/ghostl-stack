export default async function ContractsPage() {
  const { ContractsConsole } = await import('../../src/modules/contracts/components/ContractsConsole');
  return <ContractsConsole />;
}
