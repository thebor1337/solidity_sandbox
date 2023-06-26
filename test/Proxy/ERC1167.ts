import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Lock", function () {

    async function deploy() {
        const [owner, user1] = await ethers.getSigners();

        const MasterFactory = await ethers.getContractFactory("MasterMyERC20");
        const master = await MasterFactory.deploy();

        const TokenFactoryFactory = await ethers.getContractFactory("MyERC20Factory");
        const tokenFactory = await TokenFactoryFactory.deploy(master.address, 1);

        return { master, tokenFactory, owner, user1 };
    }

    
});
