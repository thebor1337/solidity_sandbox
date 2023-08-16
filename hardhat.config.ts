import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17"
      },
      {
        version: "0.8.19"
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1337,
    }
  }
};

export default config;
