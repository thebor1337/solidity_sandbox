import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { MasterMyERC20, MyERC20Factory } from "../../typechain-types";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("ERC1167", function () {

    async function deploy() {
        const [owner, user1, user2] = await ethers.getSigners();

        const MasterFactory = await ethers.getContractFactory("MasterMyERC20");
        const master = await MasterFactory.deploy();

        const FactoryFactory = await ethers.getContractFactory("MyERC20Factory");
        const factory = await FactoryFactory.deploy(master.address, 1);

        return { master, factory, owner, user1, user2 };
    }

    describe("deploy", () => {
        it("should deploy a master contract", async function () {
            const { master } = await loadFixture(deploy);
    
            expect(await master.name()).to.eq("");
            expect(await master.symbol()).to.eq("");
        });
    
        it("should deploy a factory contract", async function () {
            const { owner, factory, master } = await loadFixture(deploy);
    
            expect(await factory.owner()).to.eq(owner.address);
            expect(await factory.fee()).to.eq(1);
            expect(await factory.implementation()).to.eq(master.address);
        });
    
        it("should deploy a proxy contract", async function () {
            const { factory, user1 } = await loadFixture(deploy);
    
            const tx = await factory.connect(user1).deploy("MyToken", "MTK");
            const receipt = await tx.wait();
    
            const proxyAddress = receipt.events[2]?.args[0];
    
            const proxy = await ethers.getContractAt("MasterMyERC20", proxyAddress);
    
            expect(await proxy.owner()).to.eq(user1.address);
            expect(await proxy.factory()).to.eq(factory.address);
            expect(await proxy.name()).to.eq("MyToken");
            expect(await proxy.symbol()).to.eq("MTK");
        });
    });

    describe("functions", () => {
        let factory: MyERC20Factory;
        let master: MasterMyERC20;
        let proxy: MasterMyERC20;
        let owner: SignerWithAddress;
        let user1: SignerWithAddress;
        let user2: SignerWithAddress;

        this.beforeEach(async function () {
            const result = await loadFixture(deploy);
            factory = result.factory;
            master = result.master;
            owner = result.owner;
            user1 = result.user1;
            user2 = result.user2;

            const tx = await factory.connect(user1).deploy("MyToken", "MTK");
            const receipt = await tx.wait();

            proxy = await ethers.getContractAt("MasterMyERC20", receipt.events[2]?.args[0]);
        });

        it("a user should be able to deposit to the proxy token", async function () {
            await proxy.connect(user2).deposit({value: 100});
            expect(await proxy.balanceOf(user2.address)).to.eq(100);
        });

        it("a proxy owner should be able to withdraw and pay fee to the factory", async function () {
            await proxy.connect(user2).deposit({value: 100});
            await expect(() =>
                proxy.connect(user1).withdraw()
            ).to.changeEtherBalances([proxy, user1, factory], ["-100", 99, 1]);
        });

        it("should revert if not a proxy owner tries to withdraw", async function () {
            await proxy.connect(user2).deposit({value: 100});
            await expect(
                proxy.connect(user2).withdraw()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("a factory owner should be able to withdraw fees", async function () {
            await proxy.connect(user2).deposit({value: 100});
            await proxy.connect(user1).withdraw();
            await expect(() =>
                factory.connect(owner).withdraw()
            ).to.changeEtherBalances([factory, owner], ["-1", "1"]);
        });
    });
});
