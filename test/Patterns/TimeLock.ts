import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TimeLockDemo, TimeLockPattern } from "../../typechain-types";

interface Transaction {
    to: string;
    func: string;
    data: string;
    value: number;
    timestamp: number;
}

const getTxId = (tx: Transaction) => {
    return ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            ["address", "string", "bytes", "uint256", "uint256"],
            [tx.to, tx.func, tx.data, tx.value, tx.timestamp]
        )
    );
}

describe("TimeLock", function () {

    async function deploy() {
        const [owner] = await ethers.getSigners();

        const TimelockFactory = await ethers.getContractFactory("TimeLockPattern");
        const timelock = await TimelockFactory.deploy();

        const DemoFactory = await ethers.getContractFactory("TimeLockDemo");
        const demo = await DemoFactory.deploy();

        return { timelock, demo, owner };
    }

    let timelock: TimeLockPattern;
    let demo: TimeLockDemo;
    let owner: SignerWithAddress;
    let tx: Transaction;

    this.beforeEach(async () => {
        const deployed = await loadFixture(deploy);
        timelock = deployed.timelock;
        demo = deployed.demo;
        owner = deployed.owner;

        tx = {
            to: demo.address,
            func: "demo(string)",
            data: ethers.utils.defaultAbiCoder.encode(["string"], ["hello world"]),
            value: 10,
            timestamp: await time.latest() + 120
        }

        await timelock.addToQueue(tx.to, tx.func, tx.data, tx.value, tx.timestamp);
    });

    it("should add to queue", async () => {
        const txId = getTxId(tx);
        expect(await timelock.queue(txId)).to.eq(true);
    });

    it("should be able to discard", async () => {
        const txId = getTxId(tx);
        await timelock.discard(txId);
        expect(await timelock.queue(txId)).to.eq(false);
    });

    it("should not execute before time", async () => {
        await expect(timelock.execute(tx.to, tx.func, tx.data, tx.value, tx.timestamp))
            .to.be.revertedWith("Too early");
    });

    it("should not execute after grace period", async () => {
        await time.increaseTo(tx.timestamp + (await timelock.GRACE_PERIOD()).toNumber() + 1);
        await expect(timelock.execute(tx.to, tx.func, tx.data, tx.value, tx.timestamp))
            .to.be.revertedWith("Tx expired");
    });

    it("should not execute not queued tx", async () => {
        await time.increaseTo(tx.timestamp + 1);
        await expect(timelock.execute(tx.to, "anotherFunc()", tx.data, tx.value, tx.timestamp, {value: tx.value}))
            .to.be.revertedWith("Not queued");
    });

    it("should execute", async () => {
        await time.increaseTo(tx.timestamp + 1);
        await timelock.execute(tx.to, tx.func, tx.data, tx.value, tx.timestamp, {value: tx.value});
        expect(await timelock.queue(getTxId(tx))).to.eq(false);
        expect(await demo.message()).to.eq("hello world");
        expect(await demo.value()).to.eq(tx.value);
    });
});
