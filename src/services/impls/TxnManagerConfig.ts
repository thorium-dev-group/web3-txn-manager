import { ITxnOpts } from "../interfaces";
import { ethers } from "ethers";
import { ATxnManagerConfig } from "../interfaces/ATxnManagerConfig";
import { IWeb3TxnMgrOptions } from "../../Web3TxnManager.module";


export class TxnManagerConfig extends ATxnManagerConfig {

    constructor(
        readonly props: IWeb3TxnMgrOptions
    ) {
        super();
        if(!props.rpcUrl) {
            throw new Error("rpcUrl is required");
        }
        if(props.minWalletBalance) {
            props.minWalletBalance = ethers.parseEther("0.5")
        }
    }

    getRpcUrl(): string {
        return this.props.rpcUrl;
    }

    getMinWalletBalance(): bigint {
        return this.props.minWalletBalance!;
    }

    getTxnManagerOpts(): ITxnOpts | undefined {
        return this.props.txnOpts;
    }

    getSignerFactory() {
        return this.props.signerFactory;
    }

    getBalanceNotifier() {
        return this.props.balanceNotifier;
    }
    
}