import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

class MerkleTree {
	nodes: string[];
	numLeaves: number;

	// TODO leaves != 2^k
	constructor(hashedLeaves: string[]) {
		this.nodes = [];
		this.numLeaves = hashedLeaves.length;
		this.build(hashedLeaves);
	}

	build(hashedLeaves: string[]) {
		for (let i = 0; i < hashedLeaves.length; i++) {
			this.nodes.push(hashedLeaves[i]);
		}

		let n = this.nodes.length;
		let offset = 0;

		while (n > 0) {
			for (let i = 0; i < n - 1; i += 2) {
				this.nodes.push(
					this.hashPair(
						this.nodes[offset + i],
						this.nodes[offset + i + 1]
					)
				);
			}

			offset += n;
			n = Math.floor(n / 2);
		}
	}

	hashPair(a: string, b: string): string {
		const aBn = ethers.BigNumber.from(a);
		const bBn = ethers.BigNumber.from(b);

        const items = aBn < bBn ? [aBn, bBn] : [bBn, aBn];

        return ethers.utils.solidityKeccak256(
            ["uint256", "uint256"],
           items
        );
	}

	getRoot(): string {
		return this.nodes[this.nodes.length - 1];
	}

	getProof(index: number): string[] {
		if (index >= this.numLeaves) {
			throw new Error("Index is incorrect");
		}

		let proof: string[] = [];

		let offset = 0;
		let n = this.numLeaves;

		while (n > 1) {
			if (index % 2 === 0) {
				proof.push(this.nodes[offset + index + 1]);
			} else {
				proof.push(this.nodes[offset + index - 1]);
			}

			offset += n;
			n = Math.floor(n / 2);
			index = Math.floor(index / 2);
		}

		return proof;
	}

	verifyProof(hashedLeaf: string, proof: string[]): boolean {
		let computedHash = hashedLeaf;
		for (let i = 0; i < proof.length; i++) {
			computedHash = this.hashPair(computedHash, proof[i]);
		}
		return computedHash === this.getRoot();
	}
}

describe("Merkle Tree", function () {
	async function deploy() {
		const [owner] = await ethers.getSigners();

		const Factory = await ethers.getContractFactory("MerkleTree");
		const merkleTreeContract = await Factory.deploy();

		return { owner, merkleTreeContract };
	}

	it("JS tree", () => {
		const leaves = ["test1", "test2", "test3", "test4"];

		const hashedLeaves = leaves.map((leaf) =>
			ethers.utils.keccak256(ethers.utils.toUtf8Bytes(leaf))
		);

		const tree = new MerkleTree(hashedLeaves);
		const index = 1;
		const proof = tree.getProof(index);

		expect(tree.verifyProof(hashedLeaves[index], proof)).to.be.true;
	});

    it("Solidity tree", async () => {
        const { owner, merkleTreeContract } = await loadFixture(deploy);

        const data = [
            {
                address: ethers.utils.randomBytes(32),
                amount: ethers.utils.parseEther("1.0"),
            },
            {
                address: ethers.utils.randomBytes(32),
                amount: ethers.utils.parseEther("2.0"),
            },
            {
                address: owner.address,
                amount: ethers.utils.parseEther("3.0"),
            },
            {
                address: ethers.utils.randomBytes(32),
                amount: ethers.utils.parseEther("4.0"),
            },
        ];

        const hashedLeaves = data.map((leaf) => {
            return ethers.utils.solidityKeccak256(
                ["address", "uint256"],
                [leaf.address, leaf.amount]
            );
        });

        const tree = new MerkleTree(hashedLeaves);
        const index = 2;

        expect(
            await merkleTreeContract.verify(
                data[index].amount,
                tree.getRoot(),
                tree.getProof(index)
            )
        ).to.be.true;
    });
});
