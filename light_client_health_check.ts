import dotenv from 'dotenv'; dotenv.config();
import axios from 'axios';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import * as fs from 'fs';
import * as path from 'path';
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from '@mysten/bcs';

// Telegram config
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;   

// Sui config
const LC_PACKAGE_ID = '0xc31478c4cc6cc146a7ecfc9cc5096d4421d675bdf5577cb7e550392a7cb93dc5';
const LC_OBJECT_ID = '0x4f989d395bb13b4913b483016641eb7c9cacfd88d2a1ba91523d0542a52af9e4'
const LC_MODULE = 'light_client';
const FUNCTION = 'head_height';

const STATE_FILE_PATH = path.join(__dirname, 'monitor_state.json');

const ALERT_THRESHOLDS_MINUTES = {
    min20: 20,
    min30: 30,
    min60: 60,
};

interface MonitorState {
    lastKnownHeight: number;
    lastUpdatedAt: number | null;
    alertsSent: {
        min20: boolean;
        min30: boolean;
        min60: boolean;
    };
}

async function sendTelegramMessage(text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        console.log(`Sending message to chat ID ${CHAT_ID}: "${text}"`);
        const response = await axios.post(url, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });

        if (response.data.ok) {
            console.log('Message sent successfully!');
        } else {
            console.error('Telegram API returned an error:', response.data);
        }
    } catch (error) {
            console.error('Error sending message to Telegram:', error);
    } 
}

function readState(): MonitorState {
    if (fs.existsSync(STATE_FILE_PATH)) {
        const fileContent = fs.readFileSync(STATE_FILE_PATH, 'utf-8');
        return JSON.parse(fileContent) as MonitorState;
    }
    return {
        lastKnownHeight: 0,
        lastUpdatedAt: null,
        alertsSent: { min20: false, min30: false, min60: false },
    };
}

function writeState(state: MonitorState): void {
    try {
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error writing state file:', error);
    }
}

async function getLastestHeight(): Promise<number | null> {
    try {
        const rpcUrl = getFullnodeUrl('testnet');
        const client = new SuiClient({ url: rpcUrl });
        const transaction = new Transaction();
        transaction.moveCall({
            target: `${LC_PACKAGE_ID}::${LC_MODULE}::${FUNCTION}`,
            arguments: [
                transaction.object(LC_OBJECT_ID)
            ],
        });
        const result = await client.devInspectTransactionBlock({
            sender: '0x0000000000000000000000000000000000000000000000000000000000000000', // Dummy sender
            transactionBlock: transaction,
        });

        if (result.effects?.status?.status === 'success' && result.results && result.results[0]?.returnValues?.[0]) {
           const returnValueEntry = result.results[0].returnValues[0]; 
           const bytesAsNumbers = returnValueEntry[0] as number[];
               try {
                   const bcsBytes = Uint8Array.from(bytesAsNumbers);
                   const BcsU64 = bcs.u64();
                   const deserializedHeightBigInt = BcsU64.parse(bcsBytes);
                   const height = Number(deserializedHeightBigInt);
                   return height;

               } catch (parseError) {
                   console.error('Error deserializing', parseError);
                   return null;
               }
       } else {
           console.error('Failed to devInspect head_height Effects status:', result.effects);
           return null;
       }
   } catch (error) {
       console.error('Exception during Sui contract call for head_height:', error);
       return null;
   }
}

async function main() {
    const state = readState();
    const currentTimeSeconds = Math.floor(Date.now() / 1000);
    const currentHeight = await getLastestHeight();

    if (currentHeight === null) {
        await sendTelegramMessage('SCRIPT ERROR: Could not fetch current head_height from light client.');
        return;
    }

    if (currentHeight > state.lastKnownHeight) {
        if (state.lastUpdatedAt !== null && state.alertsSent.min20) {
            await sendTelegramMessage(`RESOLVED: light client is updating again. Currently at: ${currentHeight}.`);
        }
        state.lastKnownHeight = currentHeight;
        state.lastUpdatedAt = currentTimeSeconds;
        state.alertsSent = { min20: false, min30: false, min60: false };
    } else { 
        if (state.lastUpdatedAt === null) {
            state.lastUpdatedAt = currentTimeSeconds;
        }

        const durationSinceLastUpdateSec = currentTimeSeconds - (state.lastUpdatedAt || currentTimeSeconds);
        const durationSinceLastUpdateMin = Math.floor(durationSinceLastUpdateSec / 60);
        console.log(`Height ${currentHeight} has been not updated for ${durationSinceLastUpdateMin} minutes.`);

        const thresholds = [
            { key: 'min20', limit: ALERT_THRESHOLDS_MINUTES.min20, msg: `WARNING: light client has not been updated for ~20 minutes. Currently at: ${currentHeight}.` },
            { key: 'min30', limit: ALERT_THRESHOLDS_MINUTES.min30, msg: `ALERT: light client has not been updated for ~30 minutes. Currently at: ${currentHeight}.` },
            { key: 'min60', limit: ALERT_THRESHOLDS_MINUTES.min60, msg: `CRITICAL: light client has not been updated for ~1 HOUR. Currently at: ${currentHeight}.` },
        ] as const;

        for (const threshold of thresholds) {
            if (durationSinceLastUpdateMin >= threshold.limit && !state.alertsSent[threshold.key]) {
                await sendTelegramMessage(threshold.msg);
                state.alertsSent[threshold.key] = true;
            }
        }
        state.lastKnownHeight = currentHeight;
    }

    writeState(state);
}

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("CRITICAL: Essential environment variables (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) are not set. Exiting.");
} else {
    main();
}