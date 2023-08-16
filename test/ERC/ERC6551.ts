import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC6551Account__factory } from "../../typechain-types";

describe("ERC6551", function () {
    async function deploy() {
        const [ u1, u2 ] = await ethers.getSigners();

        const NFTFactory = await ethers.getContractFactory("TestNFT");
        const nft = await NFTFactory.deploy();
        await nft.deployed();

        const AccountFactory = await ethers.getContractFactory("ERC6551Account");
        const account = await AccountFactory.deploy();
        await account.deployed();

        const RegistryFactory = await ethers.getContractFactory("ERC6551Registry");
        const registry = await RegistryFactory.deploy();
        await registry.deployed();

        return { u1, u2, nft, account, registry };
    }

    it("should work", async function () {
        const { u1, u2, nft, account, registry } = await loadFixture(deploy);
    
        console.log("OWNER", u1.address, "\n\n");

        const tokenId = 1;
        const salt = 123;

        await nft.safeMint(u1.address, tokenId);

        expect(await nft.ownerOf(tokenId)).to.equal(u1.address);

        const expectedAddr = await registry.account(
            account.address,
            1337,
            nft.address,
            tokenId,
            salt
        );

        console.log("EXPECTED", expectedAddr, "\n\n");

        const createTx = await registry.createAccount(
            account.address,
            1337,
            nft.address,
            tokenId,
            salt,
            "0x"
        );

        await expect(createTx).to.emit(registry, "AccountCreated").withArgs(
            expectedAddr,
            account.address,
            1337,
            nft.address,
            tokenId,
            salt
        );

        const nftImpl = ERC6551Account__factory.connect(expectedAddr, u1);

        expect(await nftImpl.owner()).to.eq(u1.address);

        const value = 100;

        const txData = {
            to: expectedAddr,
            value: value
        };

        await u1.sendTransaction(txData);

        expect(await ethers.provider.getBalance(expectedAddr)).to.eq(value);

        const sendToU2 = 50;

        const txDelegateSendEth = await nftImpl.execute(
            u2.address, 
            sendToU2, 
            "0x", 
            0, 
        );

        await expect(txDelegateSendEth).to.changeEtherBalance(u2, sendToU2);

        await expect(
            nftImpl.connect(u2).execute(
                u2.address, 
                sendToU2, 
                "0x", 
                0, 
            )
        ).to.be.revertedWith("Invalid signer");

        await nft.transferFrom(u1.address, u2.address, tokenId);

        expect(await nft.ownerOf(tokenId)).to.equal(u2.address);

        const sendToU1 = 50;

        await expect(
            nftImpl.execute(
                u1.address, 
                sendToU2, 
                "0x", 
                0, 
            )
        ).to.be.revertedWith("Invalid signer");

        const txDelegateSendEth2 = await nftImpl.connect(u2).execute(
            u1.address,
            sendToU1,
            "0x",
            0,
        );

        await expect(txDelegateSendEth2).to.changeEtherBalance(u1, sendToU1);
        expect(await ethers.provider.getBalance(expectedAddr)).to.eq(value - sendToU2 - sendToU1);
    });
});