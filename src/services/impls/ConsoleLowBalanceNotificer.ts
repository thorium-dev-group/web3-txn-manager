import { Injectable } from "@nestjs/common";
import { ALowBalanceNotifier } from "../interfaces";

@Injectable()
export class ConsoleLowBalanceNotifier extends ALowBalanceNotifier {
    async notify(address: string, balance: bigint): Promise<void> {
        console.log(`Low balance detected for ${address}. Current balance: ${balance}`);
    }
    
}