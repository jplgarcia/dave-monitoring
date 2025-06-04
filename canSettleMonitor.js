import { readFile, writeFile } from 'node:fs/promises'
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { notifyDiscord } from './discord.js'

const DATA_FILE = './data.json';
const CAN_SETTLE_DATA_FILE = './canSettle.json';
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
    {
        inputs: [],
        name: "getCurrentSealedEpoch",
        outputs: [
            {
                internalType: "uint256",
                name: "epochNumber",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "inputIndexLowerBound",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "inputIndexUpperBound",
                type: "uint256"
            },
            {
                internalType: "contract ITournament",
                name: "tournament",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    }
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

async function getCurrentSealedEpoch() {
    const result = await client.readContract({
        address: DAVE_CONTRACT_ADDRESS,
        abi: abi,
        functionName: 'getCurrentSealedEpoch',
    })
    return {
        epochNumber: (result[0] || -1).toString(),
        inputIndexLowerBound: (result[1] ?? -1).toString(),
        inputIndexUpperBound: (result[2] ?? -1).toString(),
        tournament: result[3],
    }
}

async function checkCanSettle() {
    let canSettleData = {
        isFinished: false,
        epochNumber: '0',
        winnerCommitment: '0x',
        lastCanSettleTimestamp: null,
    };

    let data = {};

    try {
        const raw = await readFile(CAN_SETTLE_DATA_FILE, 'utf-8');
        canSettleData = JSON.parse(raw);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    try {
        const raw = await readFile(DATA_FILE, 'utf-8');
        data = JSON.parse(raw);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    const res = await canSettle();

    if (!canSettleData.isFinished && res.isFinished) {
        res.lastCanSettleTimestamp = Date.now();
    } else {
        res.lastCanSettleTimestamp = canSettleData.lastCanSettleTimestamp || null;
    }

    const currentSealedEpoch = await getCurrentSealedEpoch()

    if (currentSealedEpoch.epochNumber !== canSettleData.currentSealedEpoch?.epochNumber) {
        res.currentSealedEpoch = { ...currentSealedEpoch, createdAt: Date.now() }
    } else {
        res.currentSealedEpoch = canSettleData.currentSealedEpoch
    }

    console.log(res)

    const tournamentAddress = (res.currentSealedEpoch?.tournament || '').toLowerCase()
    if (tournamentAddress && !data.tournaments[tournamentAddress]) {
        const elapsed = Date.now() - (res.currentSealedEpoch?.createdAt || 0);
        if (elapsed > 3600000) {
            const msg = `⚠️ No claims for epoch ${res.epochNumber} in over an hour.`;
            await notifyDiscord(msg);
        }
    }

    if (res.isFinished && res.lastCanSettleTimestamp) {
        const elapsed = Date.now() - res.lastCanSettleTimestamp;
        if (elapsed > 3600000) {
            const msg = `⚠️ Epoch ${res.epochNumber} has been open for settlement for over 1 hour.`;
            await notifyDiscord(msg);
        }
    }

    await writeFile(CAN_SETTLE_DATA_FILE, JSON.stringify(res, null, 4));
}

checkCanSettle();
