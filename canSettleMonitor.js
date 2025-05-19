import fs from 'fs'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { notifyDiscord } from './discord.js'

const DATA_FILE = './canSettle.json';
const DAVE_CONTRACT_ADDRESS = process.env.DAVE_CONTRACT_ADDRESS || '0x545E9Ad57e2108394857FbdB928F3B30f08843df';

const abi = [
    {
        name: 'canSettle',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [
            { name: 'isFinished', type: 'bool' },
            { name: 'epochNumber', type: 'uint256' },
            { name: 'winnerCommitment', type: 'bytes32' }
        ],
    },
]

const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
})

async function canSettle() {
    const result = await client.readContract({
        address: DAVE_CONTRACT_ADDRESS,
        abi: abi,
        functionName: 'canSettle',
    })
    return {
        isFinished: result[0],
        epochNumber: (result[1] || 0).toString(),
        winnerCommitment: result[2],
    }
}

async function checkCanSettle() {
    let data = {
        isFinished: false,
        epochNumber: '0',
        winnerCommitment: '0x',
        lastCanSettleTimestamp: null,
    }

    try {
        const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
        data = JSON.parse(raw);
    } catch (e) {
        console.error(e)
        process.exit(1)
    }

    const res = await canSettle();

    if (!data.isFinished && res.isFinished) {
        res.lastCanSettleTimestamp = Date.now();
    } else {
        res.lastCanSettleTimestamp = data.lastCanSettleTimestamp || null;
    }

    console.log(res)

    if (res.isFinished && res.lastCanSettleTimestamp) {
        const elapsed = Date.now() - res.lastCanSettleTimestamp;
        if (elapsed > 3600000) {
            const msg = `⚠️ Epoch ${res.epochNumber} has been open for settlement for over 1 hour.`;
            await notifyDiscord(msg);
        }
    }

    await fs.promises.writeFile(DATA_FILE, JSON.stringify(res, null, 4));
}

checkCanSettle();
