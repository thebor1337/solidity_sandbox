import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("CommitReveal", function () {

    async function deploy() {
        const [owner, user, candidate1, candidate2, candidate3] = await ethers.getSigners();

        const ContractFactory = await ethers.getContractFactory("CommitRevealPattern");
        const contract = await ContractFactory.deploy([
            candidate1.address, 
            candidate2.address, 
            candidate3.address
        ]);

        return { contract, owner, user };
    }

    it("works", async function () {
        const { contract, owner, user } = await loadFixture(deploy);

        const secret = ethers.utils.formatBytes32String("somesecret");
        const candidate = await contract.candidates(1);
        const hashedVote = ethers.utils.solidityKeccak256(
            ['address', 'bytes32', 'address'], 
            [candidate, secret, user.address]
        );

        expect(await contract.votes(candidate)).to.equal(0);

        await contract.connect(user).commitVote(hashedVote);

        expect(await contract.commits(user.address)).to.eq(hashedVote);

        await contract.connect(owner).stopVoting();
        await contract.connect(user).revealVote(candidate, secret);

        expect(await contract.votes(candidate)).to.equal(1);
        expect(await contract.commits(user.address)).to.eq(ethers.constants.HashZero);
    });
});
