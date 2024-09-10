import { Mutex } from "async-mutex";


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const pollPeriod = 300; //ms
export class PendingAsyncValue<T> {

    private value?: T;
    private error?: any;
    private lock: Mutex = new Mutex();

    buildWaitPromise(): Promise<T> {
        return new Promise(async (resolve, reject) => {
            while(true) {
                await sleep(pollPeriod);
                    
                const rel = await this.lock.acquire();
                try {
                    if (this.value !== undefined) {
                        resolve(this.value);
                        break;
                    } else if(this.error !== undefined) {
                        reject(this.error);
                        break;
                    }
                } finally {
                    rel();
                }
            }
            console.log("Pending result finished");
        });
    }

    async setError(e: any) {
        const rel = await this.lock.acquire();
        
        try {
            if(this.error !== undefined) {
                throw new Error("Error already set");
            }
            this.error = e;
        } finally {
            rel();
        }
    }

    async setValue(value: T) {
        const rel = await this.lock.acquire();
        
        try {
            if(this.value !== undefined) {  
                throw new Error("Value already set");
            }
            this.value = value;
        } finally {
            rel();
        }
    }
}