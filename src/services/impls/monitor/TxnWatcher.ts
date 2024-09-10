import { Injectable, Logger } from "@nestjs/common";
import { ATxnWatcher, IWatchRequest} from "../../interfaces/ATxnWatcher";
import { MonitorLoop } from "./MonitorLoop";
import { IMonitorJob } from "./IMonitorJob";
import { ATxnPreparer } from "../../interfaces/ATxnPreparer";
import { ABalanceMonitor } from "../../interfaces/ABalanceMonitor";
import { TransactionReceipt } from "ethers";
import { AWeb3Provider } from "../../interfaces";
import { PendingAsyncValue } from "../../../utils";
import { ARPCErrorInterceptor, IRPCCallResult } from "../../interfaces/ARPCErrorInterceptor";

@Injectable()
export class TxnWatcher extends ATxnWatcher {

    private readonly log = new Logger(TxnWatcher.name);
    constructor(
        readonly loop: MonitorLoop,
        readonly web3Provider: AWeb3Provider,
        readonly prep: ATxnPreparer,
        readonly balanceMonitor: ABalanceMonitor,
        readonly rpcIntercept: ARPCErrorInterceptor
        
    ) {
        super();
    }


    async watchForReceipt(request: IWatchRequest): Promise<IRPCCallResult<TransactionReceipt>> {
        const res = new PendingAsyncValue<IRPCCallResult<TransactionReceipt>>();
        
       const job: IMonitorJob = {
            callback: async (j: IMonitorJob) => {
                this.log.debug({
                    msg: "Received result callback",
                    status: j.callResult?.status,
                });
                if(j.callResult){
                    await res.setValue(j.callResult);
                } else {
                    res.setError(new Error("No receipt or call result in txn monitor result"));
                }
            },
            txn: request.txn,
            opts: {},
            attemptCount: 0,
            pollingStarted: new Date()
        };

        this.log.debug({
            msg: "Building pending result promise..."
        });
        const promise = res.buildWaitPromise();
        this.log.debug({
            msg: "Adding job to monitor loop..."
        });
        await this.loop.addJob(job);
        this.log.debug({
            msg: "Added job to monitor loop",
        });
        return promise;
    }
    
}