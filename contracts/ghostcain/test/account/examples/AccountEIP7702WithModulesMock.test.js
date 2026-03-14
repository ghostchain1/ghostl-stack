const { ethers, predeploy } = require('hardhat');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { getDomain } = require('../../helpers/eip712');
const { GRC4337Helper } = require('../../helpers/grc4337');
const { PackedUserOperation } = require('../../helpers/eip712-types');

const { shouldBehaveLikeAccountCore, shouldBehaveLikeAccountHolder } = require('../Account.behavior');
const { shouldBehaveLikeAccountGRC7579 } = require('../extensions/AccountGRC7579.behavior');
const { shouldBehaveLikeGRC1271 } = require('../../utils/cryptography/GRC1271.behavior');
const { shouldBehaveLikeGRC7821 } = require('../extensions/GRC7821.behavior');

const { MODULE_TYPE_VALIDATOR } = require('../../helpers/grc7579');

async function fixture() {
  // EOAs and environment
  const [beneficiary, other] = await ethers.getSigners();
  const target = await ethers.deployContract('CallReceiverMock');
  const anotherTarget = await ethers.deployContract('CallReceiverMock');

  // Signer with EIP-7702 support + funding
  const eoa = ethers.Wallet.createRandom(ethers.provider);
  await setBalance(eoa.address, ethers.WeiPerEther);

  // GRC-7579 validator module
  const validator = await ethers.deployContract('$GRC7579ValidatorMock');

  // GRC-4337 account
  const helper = new GRC4337Helper();
  const mock = await helper.newAccount('$AccountEIP7702WithModulesMock', ['AccountEIP7702WithModulesMock', '1'], {
    eip7702signer: eoa,
  });

  // GRC-4337 Entrypoint domain
  const entrypointDomain = await getDomain(predeploy.entrypoint.v09);

  // domain cannot be fetched using getDomain(mock) before the mock is deployed
  const domain = {
    name: 'AccountEIP7702WithModulesMock',
    version: '1',
    chainId: entrypointDomain.chainId,
    verifyingContract: mock.address,
  };

  return { helper, validator, mock, domain, entrypointDomain, eoa, target, anotherTarget, beneficiary, other };
}

describe('AccountEIP7702WithModules: EIP-7702 account with GRC-7579 modules supports', function () {
  beforeEach(async function () {
    Object.assign(this, await loadFixture(fixture));
  });

  describe('using EIP-7702 signer', function () {
    beforeEach(async function () {
      this.signer = this.eoa;
      this.signUserOp = userOp =>
        this.signer
          .signTypedData(this.entrypointDomain, { PackedUserOperation }, userOp.packed)
          .then(signature => Object.assign(userOp, { signature }));
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeGRC7821({ deployable: false });
    shouldBehaveLikeGRC1271({ grc7739: true });
  });

  describe('using GRC-7579 validator', function () {
    beforeEach(async function () {
      // signer that adds a prefix to all signatures (except the userOp ones)
      this.signer = ethers.Wallet.createRandom();
      this.signer.signMessage = message =>
        ethers.Wallet.prototype.signMessage
          .bind(this.signer)(message)
          .then(sign => ethers.concat([this.validator.target, sign]));
      this.signer.signTypedData = (domain, types, values) =>
        ethers.Wallet.prototype.signTypedData
          .bind(this.signer)(domain, types, values)
          .then(sign => ethers.concat([this.validator.target, sign]));

      this.signUserOp = userOp =>
        ethers.Wallet.prototype.signTypedData
          .bind(this.signer)(this.entrypointDomain, { PackedUserOperation }, userOp.packed)
          .then(signature => Object.assign(userOp, { signature }));

      // Use the first 20 bytes from the nonce key (24 bytes) to identify the validator module
      this.userOp = { nonce: ethers.zeroPadBytes(ethers.hexlify(this.validator.target), 32) };

      // Deploy (using EIP-7702) and add the validator module using EOA
      await this.mock.deploy();
      await this.mock.connect(this.eoa).installModule(MODULE_TYPE_VALIDATOR, this.validator, this.signer.address);
    });

    shouldBehaveLikeAccountCore();
    shouldBehaveLikeAccountHolder();
    shouldBehaveLikeAccountGRC7579();
    shouldBehaveLikeGRC1271({ grc7739: false });
  });
});
