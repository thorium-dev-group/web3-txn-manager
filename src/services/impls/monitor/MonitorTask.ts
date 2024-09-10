import { Provider, TransactionReceipt } from "ethers";
import { IMonitorJob } from "./IMonitorJob";
import { IRPCCallResult, RPCCallStatus } from "../../interfaces/ARPCErrorInterceptor";


export type TaskCompleteHandler = (task: MonitorTask) => Promise<void>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Responsible for handling post-submit logic for transactions. This includes 
 * speeding it up or canceling it if it is taking too long to mine.
 */
let idCnt = 0;
export class MonitorTask {

    id = idCnt++;
    constructor(
        readonly provider: Provider,
        readonly completeHandler: TaskCompleteHandler
    ) {}

    async run(job: IMonitorJob): Promise<void> {
        try {
            ++job.attemptCount;
            console.log("Running monitor task to get receipt", job.txn.hash);
            let r = await this._getReceipt(job.txn.hash!);
            console.log("Result", r);
            while(!r) {
                //see if we need to speed up
                const now = Date.now();
                const diff = now - job.pollingStarted.getTime();
                if(job.opts && job.opts.resubmitAfterSeconds && diff > job.opts.resubmitAfterSeconds * 1000) {
                    if(job.callback) {
                        await job.callback({
                            ...job,
                            callResult: {
                               status: RPCCallStatus.TIMEOUT
                            } as IRPCCallResult<TransactionReceipt>
                        });
                    }
                    return;
                }
                await sleep(100);
                r = await this._getReceipt(job.txn.hash!);
            }

            if(job.callback) {
                await job.callback({
                    ...job,
                    callResult: {
                        status: RPCCallStatus.SUCCESS,
                        result: r
                    } as IRPCCallResult<TransactionReceipt>
                });
            }
        } catch (e) {
            console.log("Error in monitor task", e);
        } finally {
            await this.completeHandler(this);
        }
    }

    async _getReceipt(hash: string): Promise<TransactionReceipt | null> {
        try {
             return await this.provider.getTransactionReceipt(hash!);
        } catch (e) {
               console.log("Problem getting receipt", e);
               return null;
        }
     }
}