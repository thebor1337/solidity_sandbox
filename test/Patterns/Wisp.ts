import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployedBytecode as runtimeCodeWisp1 } from "../../artifacts/contracts/Patterns/Create/Wisp.sol/TestWisp1.json";
import { deployedBytecode as runtimeCodeWisp2 } from "../../artifacts/contracts/Patterns/Create/Wisp.sol/TestWisp2.json";
import { deployedBytecode as runtimeCodeWisp3 } from "../../artifacts/contracts/Patterns/Create/Wisp.sol/TestWisp3.json";

describe("Wisp", function () {
	async function deploy() {
		const [owner] = await ethers.getSigners();

		const Factory = await ethers.getContractFactory("WispFactory");
		const factory = await Factory.deploy();

		const salt = 1337;

		const saltHex = ethers.utils.hexZeroPad(
			ethers.BigNumber.from(salt).toHexString(),
			32
		);

		const initCode = await factory.initCode();
		const wispAddress = await factory.getWispAddress(saltHex);

		return { owner, factory, initCode, saltHex, wispAddress };
	}

	it("should have expected wisp address", async () => {
		const { factory, wispAddress, saltHex, initCode } = await loadFixture(
			deploy
		);

		const computedWispAddress = ethers.utils.getCreate2Address(
			factory.address,
			saltHex,
			ethers.utils.keccak256(initCode)
		);

		expect(wispAddress).to.equal(computedWispAddress);
	});

	describe("Wisp1", () => {
		it("should execute the wisp contract at expected address", async () => {
			const { factory, saltHex, wispAddress } = await loadFixture(deploy);
			const tx = await factory.execute(runtimeCodeWisp1, saltHex);
			expect(tx).to.emit(wispAddress, "Executed");
		});
	});

	describe("Wisp2", () => {
		it("should revert if no funds are sent for execution", async () => {
			const { factory, saltHex } = await loadFixture(deploy);

			await expect(
				factory.execute(runtimeCodeWisp2, saltHex)
			).to.be.revertedWith("TestWisp2: no balance");
		});

		it("should emit event with proper values and pay all funds back to the owner", async () => {
			const { owner, factory, saltHex, wispAddress } = await loadFixture(
				deploy
			);

			const initialBalance = ethers.utils.parseEther("2");
			const value = ethers.utils.parseEther("1");

			const sendFundsTx = await owner.sendTransaction({
				to: wispAddress,
				value: initialBalance,
			});
			await sendFundsTx.wait();

			expect(await ethers.provider.getBalance(wispAddress)).to.equal(
				initialBalance
			);

			const tx = await factory.execute(runtimeCodeWisp2, saltHex, {
				value,
			});

			expect(tx)
				.to.emit(wispAddress, "Executed")
				.withArgs(wispAddress, initialBalance.add(value), value);

			expect(await ethers.provider.getBalance(wispAddress)).to.equal(0);
			expect(tx).to.changeEtherBalance(owner, initialBalance.add(value));
		});
	});

	describe("Wisp3", () => {
		it("should send msg.value to the factory and initial balance to the owner", async () => {
			const { owner, factory, saltHex, wispAddress } = await loadFixture(
				deploy
			);

			const initialBalance = ethers.utils.parseEther("2");
			const value = ethers.utils.parseEther("1");

			const sendFundsTx = await owner.sendTransaction({
				to: wispAddress,
				value: initialBalance,
			});
			await sendFundsTx.wait();

			const tx = await factory.execute(runtimeCodeWisp3, saltHex, {
				value,
			});

			expect(tx)
				.to.emit(wispAddress, "Executed")
				.withArgs(wispAddress, initialBalance.add(value), value);

			expect(await ethers.provider.getBalance(wispAddress)).to.equal(0);
			expect(tx).to.changeEtherBalance(factory, value);
			expect(tx).to.changeEtherBalance(owner, initialBalance);
		});
	});
});
