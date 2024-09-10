import { Injectable } from "@nestjs/common";
import { ARPCErrorInterceptor, IRPCContext } from "../../interfaces/ARPCErrorInterceptor";
import { RPCContext } from "./RPCContext";

@Injectable()
export class RPCErrorInterceptor extends ARPCErrorInterceptor {
    async newContext(): Promise<IRPCContext> {
        return new RPCContext();
    }
}