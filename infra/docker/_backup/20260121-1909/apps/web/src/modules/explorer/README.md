# Transactions, Blocks & Explorer Module

Pages
- Mempool (real-time)
- Transactions (filters, failure reasons)
- Blocks (proposer, size, MEV hints)
- Address/Entity View (internal tagging)

Services
- MempoolService
- TxIndexService
- BlockIndexService
- EntityTaggingService

Data models
- Tx { hash, from, to, value, gas, status, error }
- Block { number, hash, proposer, txCount, size, time }

Components
- MempoolStream
- TransactionsTable
- BlocksTable
- EntityView
