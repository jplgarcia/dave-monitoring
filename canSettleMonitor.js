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
    console.log(result)
    return {
        isFinished: result[0],
        epochNumber: (result[1] || 0).toString(),
        winnerCommitment: result[2],
    }
}

async function checkCanSettle() {
    const raw = await fs.promises.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const res = await canSettle();
    console.log(res)
    if (data.isFinished && res.isFinished) {
        const msg = `⚠️ The current epoch is ${res.epochNumber} and it is still open for settlement.`
        await notifyDiscord(msg)
    }
    await fs.promises.writeFile(DATA_FILE, JSON.stringify(res, null, 4))
}

checkCanSettle();
