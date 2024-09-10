import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { IMonitorJob } from "./IMonitorJob";
import { Mutex } from "async-mutex";
import { MonitorTask } from "./MonitorTask";
import { Provider } from "ethers";
import { ConfigService } from "@nestjs/config";
import { AWeb3Provider } from "../../interfaces";

@Injectable()
export class MonitorLoop {

    lock: Mutex = new Mutex();
    activeTasks: Map<number, MonitorTask> = new Map();
    idle: MonitorTask[] = [];
    pendingJobs: IMonitorJob[] = [];
    provider?: Provider;
    maxTasks = 5;
    log: Logger = new Logger(MonitorLoop.name);
    constructor(
        readonly web3Factory: AWeb3Provider,
    ) {
        
    }

    async addJob(job: IMonitorJob): Promise<void> {
        if(!this.provider) {
            this.provider = this.web3Factory.getProvider();
        }
        this.log.debug({
            msg: "Getting task for job",
        });
        const rel = await this.lock.acquire();
        try {
            const task = this._lockedGetWorker();
            if(task) {
                this.log.debug({
                    msg: "Running job on task",
                    taskId: task.id,
                });
                task.run(job).then(() => {
                    this.log.debug({
                        msg: "Async task run promise complete",
                        taskId: task.id,
                    });
                }); //no wait 
            } else {
                this.pendingJobs.push(job);
            }
        } finally {
            rel();
        }
    }

    async taskComplete(task: MonitorTask): Promise<void> {
        const rel = await this.lock.acquire();
        let j: IMonitorJob | undefined;
        try {
            j = this.pendingJobs.shift();
            if(!j){
                this.activeTasks.delete(task.id);
                this.idle.push(task);
            }
        } finally {
            rel();
        }
        if(j) {
            await task.run(j);
        }
    }

    async getWorker(): Promise<MonitorTask|undefined> {
        const rel = await this.lock.acquire();
        try {
            return this._lockedGetWorker();
        } finally {
            rel();
        }
    }

    _lockedGetWorker(): MonitorTask|undefined {
        const task = this.idle.shift();
        if(task) {
            this.activeTasks.set(task.id, task);
            return task;
        } else if(this.idle.length + this.activeTasks.size < this.maxTasks) {
            const task = new MonitorTask(this.provider!, this.taskComplete.bind(this));
            this.activeTasks.set(task.id, task);
            return task;
        }
    }
}
