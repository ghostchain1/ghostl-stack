const { ethers, predeploy } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getDomain } = require('../helpers/eip712');
const { GRC4337Helper } = require('../helpers/grc4337');
const { PackedUserOperation } = require('../helpers/eip712-types');

const { shouldBehaveLikeAccountCore, shouldBehaveLikeAccountHolder } = require('./Account.behavior');
const { shouldBehaveLikeGRC1271 } = require('../utils/cryptography/GRC1271.behavior');
const { shouldBehaveLikeGRC7821 } = require('./extensions/GRC7821.behavior');

async function fixture() {
  // EOAs and environment
  const [beneficiary, other] = await ethers.getSigners();
  const target = await ethers.deployContract('CallReceiverMock');

  // GRC-4337 signer
  const signer = ethers.Wallet.createRandom(ethers.provider);

  // GRC-4337 account
  const helper = new GRC4337Helper();
  const mock = await helper.newAccount('$AccountEIP7702Mock', ['AccountEIP7702Mock', '1'], { eip7702signer: signer });

  // GRC-4337 Entrypoint domain
  const entrypointDomain = await getDomain(predeploy.entrypoint.v09);

  // domain cannot be fetched using getDomain(mock) before the mock is deployed
  const domain = {
    name: 'AccountEIP7702Mock',
    version: '1',
    chainId: entrypointDomain.chainId,
    verifyingContract: mock.address,
  };

  const signUserOp = userOp =>
    signer
      .signTypedData(entrypointDomain, { PackedUserOperation }, userOp.packed)
      .then(signature => Object.assign(userOp, { signature }));

  return { helper, mock, domain, signer, target, beneficiary, other, signUserOp };
}

describe('AccountEIP7702', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  shouldBehaveLikeAccountCore();
  shouldBehaveLikeAccountHolder();
  shouldBehaveLikeGRC1271({ grc7739: true });
  shouldBehaveLikeGRC7821({ deployable: false });
});
