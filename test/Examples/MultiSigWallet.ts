import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MultiSigWallet, TestMultiSigWalletContract } from "../../typechain-types";

interface SubmitTransaction {
    to: string;
    value: string;
    data: string;
    expiresAt: number;
}

interface SubmitAddOwnerTransaction {
    owner: string;
    increaseNumConfirmationsRequired: boolean;
    expiresAt: number;
}

interface SubmitRemoveOwnerTransaction {
    ownerIdx: number;
    decreaseNumConfirmationsRequired: boolean;
    expiresAt: number;
}

interface SubmitSetNumConfirmationsRequiredTransaction {
    numConfirmationsRequired: number;
    expiresAt: number;
}

describe("MultiSigWallet", () => {

    async function deploy() {
        const [owner1, owner2, user1] = await ethers.getSigners();

        const WalletFactory = await ethers.getContractFactory("MultiSigWallet");
        const wallet = await WalletFactory.deploy([
            owner1.address,
            owner2.address,
        ], 2);

        const DemoFactory = await ethers.getContractFactory("TestMultiSigWalletContract");
        const demo = await DemoFactory.deploy();

        return { wallet, demo, owner1, owner2, user1 };
    }

    it("should be deployed and have correct parameters", async () => {
        const { wallet, owner1, owner2 } = await loadFixture(deploy);
        expect(wallet.address).to.be.properAddress;
        for (const owner of [owner1, owner2]) {
            expect(await wallet.isOwner(owner.address)).to.be.true;
        }
        expect(await wallet.numConfirmationsRequired()).to.equal(2);
    });

    it("should allow owners to submit transactions", async () => {
        const { wallet, demo } = await loadFixture(deploy);
        const rawTx: SubmitTransaction = {
            to: demo.address,
            value: "0",
            data: demo.interface.encodeFunctionData("test", [42]),
            expiresAt: (await time.latest()) + time.duration.days(1),
        }

        await wallet.submitTransaction(rawTx.to, rawTx.value, rawTx.data, rawTx.expiresAt);

        expect(await wallet.getTransactionCount()).to.equal(1);
        const tx = await wallet.transactions(0);

        expect(tx.to).to.equal(rawTx.to);
        expect(tx.value).to.equal(rawTx.value);
        expect(tx.data).to.equal(rawTx.data);
        expect(tx.expiresAt).to.equal(rawTx.expiresAt);
        expect(tx.executed).to.be.false;
        expect(tx.numConfirmations).to.equal(0);
        expect(tx.inner).to.be.false;
    });

    describe("base transaction processing", () => {
        let rawTx: SubmitTransaction;
        let wallet: MultiSigWallet;
        let demo: TestMultiSigWalletContract;
        let owner1: SignerWithAddress;
        let owner2: SignerWithAddress;
        let user1: SignerWithAddress;

        beforeEach(async () => {
            const deployed = await loadFixture(deploy);
            wallet = deployed.wallet;
            demo = deployed.demo;
            owner1 = deployed.owner1;
            owner2 = deployed.owner2;
            user1 = deployed.user1;

            rawTx = {
                to: demo.address,
                value: "100",
                data: demo.interface.encodeFunctionData("test", [42]),
                expiresAt: (await time.latest()) + time.duration.days(1),
            }

            await wallet.submitTransaction(rawTx.to, rawTx.value, rawTx.data, rawTx.expiresAt);
        });

        it("should allow owners to confirm transactions", async function () {
            for (let i = 0; i < 2; i++) {
                const owner = i === 0 ? owner1 : owner2;
                await wallet.connect(owner).confirmTransaction(0);
                expect((await wallet.transactions(0)).numConfirmations).to.equal(i + 1);
                expect(await wallet.isConfirmed(0, owner.address)).to.be.true;
            }
        });

        it("should allow to revoke confirmations", async function () {
            await wallet.connect(owner1).confirmTransaction(0);
            await wallet.connect(owner2).confirmTransaction(0);

            await wallet.connect(owner2).revokeConfirmation(0);
            expect((await wallet.transactions(0)).numConfirmations).to.equal(1);
            expect(await wallet.isConfirmed(0, owner2.address)).to.be.false;
        });

        describe("when enough confirmations", () => {
            it("should allow to execute transaction", async () => {
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(owner2).confirmTransaction(0);
                await wallet.connect(user1).fallback({ value: 100 });

                await wallet.connect(user1).executeTransaction(0);
                expect((await wallet.transactions(0)).executed).to.true;

                expect(await demo.a()).to.equal(42);
                expect(await demo.value()).to.equal(100);
            });
        });

        describe("when not enough confirmations", () => {
            it("should not allow to execute transaction", async () => {
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(user1).fallback({ value: 100 });

                await expect(wallet.connect(user1).executeTransaction(0)).to.be.revertedWith("not enough confirmations");
            });
        });

        describe("when expired", () => {
            it("Should not allow to execute transaction", async () => {
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(owner2).confirmTransaction(0);
                await wallet.connect(user1).fallback({ value: 100 });

                await time.increaseTo(rawTx.expiresAt + 1);
                await expect(wallet.connect(user1).executeTransaction(0)).to.be.revertedWith("tx expired");
            });
        });
    });

    describe("inner transaction processing", () => {
        let wallet: MultiSigWallet;
        let demo: TestMultiSigWalletContract;
        let owner1: SignerWithAddress;
        let owner2: SignerWithAddress;
        let user1: SignerWithAddress;

        beforeEach(async () => {
            const deployed = await loadFixture(deploy);
            wallet = deployed.wallet;
            demo = deployed.demo;
            owner1 = deployed.owner1;
            owner2 = deployed.owner2;
            user1 = deployed.user1;
        });

        describe("add owner", () => {
            let rawTx: SubmitAddOwnerTransaction;

            beforeEach(async () => {
                rawTx = {
                    owner: user1.address,
                    increaseNumConfirmationsRequired: true,
                    expiresAt: (await time.latest()) + time.duration.days(1),
                }
            });

            it("should submit add owner transaction", async () => {
                await wallet.connect(owner1).submitAddOwnerTransaction(rawTx.owner, rawTx.increaseNumConfirmationsRequired, rawTx.expiresAt);
                const tx = await wallet.transactions(0);

                expect(tx.to).to.equal(wallet.address);
                expect(tx.value).to.equal("0");
                expect(tx.data).to.equal(wallet.interface.encodeFunctionData(
                    "addOwner", 
                    [0, rawTx.owner, rawTx.increaseNumConfirmationsRequired])
                );
                expect(tx.expiresAt).to.equal(rawTx.expiresAt);
                expect(tx.executed).to.be.false;
                expect(tx.numConfirmations).to.equal(0);
                expect(tx.inner).to.be.true;
            });

            it("should execute add owner transaction", async () => {
                await wallet.connect(owner1).submitAddOwnerTransaction(rawTx.owner, rawTx.increaseNumConfirmationsRequired, rawTx.expiresAt);
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(owner2).confirmTransaction(0);
                await wallet.connect(user1).executeTransaction(0);

                expect(await wallet.isOwner(user1.address)).to.be.true;
                expect(await wallet.numConfirmationsRequired()).to.equal(3);
            });
        });

        describe("removeOwner", () => {
            let rawTx: SubmitRemoveOwnerTransaction;

            beforeEach(async () => {
                rawTx = {
                    ownerIdx: 1,
                    decreaseNumConfirmationsRequired: true,
                    expiresAt: (await time.latest()) + time.duration.days(1),
                }
            });

            it("should submit remove owner transaction", async () => {
                await wallet.connect(owner1).submitRemoveOwnerTransaction(rawTx.ownerIdx, rawTx.decreaseNumConfirmationsRequired, rawTx.expiresAt);
                const tx = await wallet.transactions(0);

                expect(tx.to).to.equal(wallet.address);
                expect(tx.value).to.equal("0");
                expect(tx.data).to.equal(wallet.interface.encodeFunctionData(
                    "removeOwner", 
                    [0, rawTx.ownerIdx, rawTx.decreaseNumConfirmationsRequired])
                );
                expect(tx.expiresAt).to.equal(rawTx.expiresAt);
                expect(tx.executed).to.be.false;
                expect(tx.numConfirmations).to.equal(0);
                expect(tx.inner).to.be.true;
            });

            it("should execute remove owner transaction", async () => {
                const numOwners = await wallet.getNumOwners();

                await wallet.connect(owner1).submitRemoveOwnerTransaction(rawTx.ownerIdx, rawTx.decreaseNumConfirmationsRequired, rawTx.expiresAt);
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(user1).executeTransaction(0);

                expect(await wallet.isOwner(owner2.address)).to.be.false;
                expect(await wallet.getNumOwners()).to.equal(numOwners.sub(1));
                expect(await wallet.numConfirmationsRequired()).to.equal(1);
            });
        });

        describe("setNumConfirmationsRequired", () => {
            let rawTx: SubmitSetNumConfirmationsRequiredTransaction;

            beforeEach(async () => {
                rawTx = {
                    numConfirmationsRequired: 1,
                    expiresAt: (await time.latest()) + time.duration.days(1),
                }
            });

            it("should submit set num confirmations required transaction", async () => {
                await wallet.connect(owner1).submitSetNumConfirmationsRequiredTransaction(rawTx.numConfirmationsRequired, rawTx.expiresAt);
                const tx = await wallet.transactions(0);

                expect(tx.to).to.equal(wallet.address);
                expect(tx.value).to.equal("0");
                expect(tx.data).to.equal(wallet.interface.encodeFunctionData(
                    "setNumConfirmationsRequired", 
                    [0, rawTx.numConfirmationsRequired])
                );
                expect(tx.expiresAt).to.equal(rawTx.expiresAt);
                expect(tx.executed).to.be.false;
                expect(tx.numConfirmations).to.equal(0);
                expect(tx.inner).to.be.true;
            });

            it("should execute set num confirmations required transaction", async () => {
                await wallet.connect(owner1).submitSetNumConfirmationsRequiredTransaction(rawTx.numConfirmationsRequired, rawTx.expiresAt);
                await wallet.connect(owner1).confirmTransaction(0);
                await wallet.connect(owner2).confirmTransaction(0);
                await wallet.connect(user1).executeTransaction(0);

                expect(await wallet.numConfirmationsRequired()).to.equal(rawTx.numConfirmationsRequired);
            });
        });
    });
});
