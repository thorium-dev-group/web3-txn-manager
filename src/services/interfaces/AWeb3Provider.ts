import type { JsonRpcProvider } from "ethers";

export abstract class AWeb3Provider {
    

    abstract getProvider(): JsonRpcProvider;
}