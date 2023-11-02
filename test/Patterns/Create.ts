import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bytecode as testContractBytecode } from "../../artifacts/contracts/Patterns/Create/Factory.sol/TestChildContract.json";

function getCreateAddress(from: string, nonce: number) {
	// const address = ethers.utils.getContractAddress({ from, nonce });

	const hexNonce = ethers.utils.stripZeros(
		ethers.utils.arrayify(ethers.BigNumber.from(nonce).toHexString())
	);

	const rlp = ethers.utils.RLP.encode([from, hexNonce]);

	const address = ethers.utils.getAddress(
		ethers.utils.hexDataSlice(ethers.utils.keccak256(rlp), 12)
	);

	return address;
}

function getCreate2Address(from: string, salt: number, bytecode: string) {
	// const address = ethers.utils.getCreate2Address(
	// 	from,
	// 	saltHex,
	// 	ethers.utils.keccak256(bytecode)
	// );
	
	const saltHex = ethers.utils.hexZeroPad(
		ethers.BigNumber.from(salt).toHexString(),
		32
	);

	const address = ethers.utils.getAddress(
		ethers.utils.hexDataSlice(
			ethers.utils.keccak256(
				ethers.utils.concat([
					"0xff",
					from,
					saltHex,
					ethers.utils.keccak256(bytecode),
				])
			),
			12
		)
	);

	return address;
}

describe("Create patterns", function () {
	async function deploy() {
		const [owner] = await ethers.getSigners();

		const Factory = await ethers.getContractFactory("TestFactory");
		const factory = await Factory.deploy();

		return { owner, Factory, factory };
	}

	describe("Factory deployment", () => {
		it("should be deployed at a deterministic address", async () => {
			const { owner, factory, Factory } = await loadFixture(deploy);

			expect(factory.address).to.equal(
				getCreateAddress(owner.address, 0)
			);

			await factory.dummy();

			const newFactory = await Factory.deploy();

			expect(newFactory.address).to.equal(
				getCreateAddress(owner.address, 2)
			);
		});
	});

	describe("Factory", () => {
		it("should deploy a contract using contract's nonce", async () => {
			const { factory } = await loadFixture(deploy);

			const nonce = 1;

			const tx = await factory.create();
			const receipt = await tx.wait();

			const createdAddress = receipt.events?.[0].args?.[0];

			const computedAddress = getCreateAddress(
				factory.address,
				ethers.BigNumber.from(nonce).toNumber()
			);

			expect(createdAddress).to.equal(computedAddress);
		});

		it("should deploy a contract using salt", async () => {
			const { factory } = await loadFixture(deploy);

			const salt = 1337;

			const saltBytes = ethers.utils.hexZeroPad(
				ethers.BigNumber.from(salt).toHexString(),
				32
			);

			const tx = await factory.create2(saltBytes);
			const receipt = await tx.wait();

			const createdAddress = receipt.events?.[0].args?.[0];

			const computedAddress = getCreate2Address(
				factory.address,
				salt,
				testContractBytecode
			);

			const solidityComputedAddress = await factory.getPrecomputedCreate2ChildAddress(saltBytes);

			expect(createdAddress).to.equal(computedAddress);
			expect(createdAddress).to.equal(solidityComputedAddress);
		});
	});
});
