# GhostChain Contract Interactions (L1/L2/L3)

```mermaid
flowchart LR
  subgraph L1["GhostChain L1"]
    L1NativeToken["NativeToken.sol"]
    L1SystemConfig["SystemConfig.sol"]
    L1Portal["Portal.sol"]
    L1L2OO["L2OutputOracle.sol"]
    L1Messenger["Messenger.sol"]
    L1Treasury["Treasury.sol"]
  end

  subgraph L2["Ghost L2"]
    L2Messenger["XDomainMessenger.sol"]
    L2StandardBridge["StandardBridge.sol"]
    GhostTokenL2["GhostTokenL2.sol"]
    L2L3Bridge["L2L3Bridge.sol"]
    L2Dispute["DisputeGameAddressBook.sol"]
  end

  subgraph L3["Ghost L3"]
    L3Inbox["L3Inbox.sol"]
    L3BridgedToken["L3BridgedToken.sol"]
    L3BridgedTokenFactory["L3BridgedTokenFactory.sol"]
    L3Guardian["AIGuardianL3.sol"]
  end

  L1SystemConfig --> L1Portal
  L1L2OO --> L1Portal
  L1Messenger --> L2Messenger
  L2Messenger --> L1Messenger

  L1Portal --> L2StandardBridge
  L2StandardBridge --> L1Portal

  GhostTokenL2 --> L2StandardBridge
  GhostTokenL2 --> L2L3Bridge

  L2L3Bridge --> L3Inbox
  L3Inbox --> L2L3Bridge

  L3BridgedTokenFactory --> L3BridgedToken
  L3BridgedToken --> L2L3Bridge

  L1Treasury --> L1NativeToken
  L3Guardian --> L3Inbox
```

Notes:
- Diagram reflects custom contracts under `contracts/src` and focuses on L1/L2/L3 messaging, bridge, and token flows.
- OP Stack upstream contracts are not duplicated here.
