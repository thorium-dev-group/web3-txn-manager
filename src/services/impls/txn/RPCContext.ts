import { IRPCCallResult, IRPCContext, RPCCallStatus } from "../../interfaces/ARPCErrorInterceptor";

export class RPCContext implements IRPCContext {

    retries: number = 0;
    withRetries(retries: number): IRPCContext {
        this.retries = retries;
        return this;
    }
    
    async call<T>(fn:()=>Promise<T>): Promise<IRPCCallResult<T>> {
        try {
            console.log("RPCContext.call");
            const t = await fn();
            console.log("Result", t);
            return {
                status: RPCCallStatus.SUCCESS,
                result: t
            };
        } catch (e:any) {
            return this.interpretError(e);
        }
    }

    interpretError<T>(e:any): IRPCCallResult<T> {
        return this.checkCode(e) ||
                this.checkInfo(e) ||
                this.checkMessage(e) ||
                {
                    status: RPCCallStatus.RPC_ERROR,
                    error: e
                };
    }

    private checkCode<T>(e:any): IRPCCallResult<T> | undefined {
        if(e.code && e.code === 'NONCE_EXPIRED') {
            return {
                status: RPCCallStatus.NONCE_USED,
                error: e
            }
        }
    }

    private checkInfo<T>(e:any): IRPCCallResult<T> | undefined {
        if(!e.info || !e.info.error) {
            return this.checkMessage(e);
        }

        e = e.info.error;
        return this.checkCode(e) ||
                this.checkMessage(e) ||
                {
                    status: RPCCallStatus.RPC_ERROR,
                    error: e
                };
    }

    private checkMessage<T>(e:any): IRPCCallResult<T> | undefined {

        if(e.message.indexOf("nonce has already been used") >= 0 ||
                        e.message.indexOf("nonce too low") >= 0) {
            return {
                status: RPCCallStatus.NONCE_USED,
                error: e
            }
        } else if(e.message.indexOf("already known") >= 0) {
            //means it's waiting in the mempool but could have a nonce gap
            return {
                status: RPCCallStatus.TXN_SEEN,
                error: e
            }
        }
    }
    
}