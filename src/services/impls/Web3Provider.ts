import { Injectable } from "@nestjs/common";
import { ATxnManagerConfig, AWeb3Provider } from "../interfaces";
import { JsonRpcProvider } from "ethers";

@Injectable()
export class Web3Provider extends AWeb3Provider {

    provider: JsonRpcProvider;
    constructor(
        readonly config: ATxnManagerConfig
    ) {
        super();
        const url = this.config.getRpcUrl();
        if(!url) {
            throw new Error("RPC URL not configured");
        }
        this.provider = new JsonRpcProvider(url);
    }
    
    getProvider(): JsonRpcProvider {
        return this.provider;
    }
    
}