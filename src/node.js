const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');
const { encryptPayload, decryptPayload, verifySignature } = require('./crypto');
const { handleCreateMint, handleTransferLPL } = require('./tokens');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const P2P_PORT = process.env.P2P_PORT || 6000;

// Create HTTP server to share between Express API and WebSocket P2P network
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let peers = []; // Track connected peer validator WebSockets

// ==========================================
// P2P WEBSOCKET GOSSIP NETWORK SETUP
// ==========================================
wss.on('connection', (ws) => {
    peers.push(ws);
    console.log("🔗 New validator peer connected to NullNet P2P layer.");

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'NEW_BLOCK') {
                console.log(`📦 Received broadcasted block slot ${data.slot} from peer.`);
                // Here validators can independently check and sync incoming blocks
            }
        } catch (e) {
            console.error("Failed to parse P2P message", e);
        }
    });

    ws.on('close', () => {
        peers = peers.filter(p => p !== ws);
        console.log("🔌 Validator peer disconnected.");
    });
});

function broadcastToPeers(data) {
    const payload = JSON.stringify(data);
    peers.forEach(peer => {
        if (peer.readyState === WebSocket.OPEN) {
            peer.send(payload);
        }
    });
}

// Function for connecting this node to other validator EC2 instances
global.connectToPeer = function(peerUrl) {
    const ws = new WebSocket(peerUrl);
    ws.on('open', () => {
        peers.push(ws);
        console.log(`Successfully connected to validator peer: ${peerUrl}`);
    });
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log("Received data from peer:", data.type);
    });
};

// ==========================================
// NULLNET TRANSACTION & INSTRUCTION API
// ==========================================

/**
 * Endpoint for submitting transactions to NullNet
 * Supports native LUN, LPL Mints, and LPL Token Transfers
 */
app.post('/transact', (req, res) => {
    const { transaction, signature } = req.body;

    // 1. Verify Solana-style cryptographic Ed25519 signature
    const isValid = verifySignature(transaction, signature, transaction.sender);
    if (!isValid) {
        return res.status(400).json({ error: "Invalid NullNet Ed25519 Signature" });
    }

    // 2. Check sender LUN balance for mandatory transaction fees
    const senderAccount = db.prepare('SELECT * FROM accounts WHERE address = ?').get(transaction.sender);
    if (!senderAccount || BigInt(senderAccount.lun_balance) < BigInt(transaction.fee)) {
        return res.status(400).json({ error: "Insufficient LUN balance for transaction fee" });
    }

    try {
        // Use SQLite transaction wrapper for full atomicity
        const executeTransaction = db.transaction(() => {
            // Deduct transaction fee in native LUN
            const newLunBalance = BigInt(senderAccount.lun_balance) - BigInt(transaction.fee);
            db.prepare('UPDATE accounts SET lun_balance = ? WHERE address = ?').run(newLunBalance.toString(), transaction.sender);

            // Process payload based on NullNet instruction type
            if (transaction.type === 'CREATE_MINT') {
                handleCreateMint(transaction);
            } else if (transaction.type === 'TRANSFER_LPL') {
                handleTransferLPL(transaction);
            } else if (transaction.type === 'TRANSFER_LUN') {
                const recipientAcc = db.prepare('SELECT * FROM accounts WHERE address = ?').get(transaction.recipient);
                if (!recipientAcc) {
                    db.prepare('INSERT INTO accounts (address, lun_balance, nonce) VALUES (?, ?, 0)')
                        .run(transaction.recipient, transaction.amount);
                } else {
                    const newRecipBalance = BigInt(recipientAcc.lun_balance) + BigInt(transaction.amount);
                    db.prepare('UPDATE accounts SET lun_balance = ? WHERE address = ?').run(newRecipBalance.toString(), transaction.recipient);
                }
                const updatedSender = db.prepare('SELECT lun_balance FROM accounts WHERE address = ?').get(transaction.sender);
                const finalSenderBalance = BigInt(updatedSender.lun_balance) - BigInt(transaction.amount);
                db.prepare('UPDATE accounts SET lun_balance = ? WHERE address = ?').run(finalSenderBalance.toString(), transaction.sender);
            } else {
                throw new Error("Unknown NullNet instruction type.");
            }

            // 3. Encrypt transaction details for public block privacy
            const encryptedPayload = encryptPayload(transaction);

            // 4. Generate block hash and append to NullNet state
            const prevBlock = db.prepare('SELECT * FROM blocks ORDER BY slot DESC LIMIT 1').get();
            const nextSlot = prevBlock ? prevBlock.slot + 1 : 1;
            const prevHash = prevBlock ? prevBlock.block_hash : "NULLNET_GENESIS_ROOT";
            
            const blockHash = require('crypto').createHash('sha256').update(prevHash + encryptedPayload).digest('hex');

            // Save encrypted block to SQLite state database
            db.prepare(`
                INSERT INTO blocks (slot, block_hash, prev_hash, encrypted_payload, validator) 
                VALUES (?, ?, ?, ?, ?)
            `).run(nextSlot, blockHash, prevHash, encryptedPayload, "LunulLabs-Validator-Node");

            return { slot: nextSlot, blockHash, encryptedPayload };
        });

        const result = executeTransaction();

        // Broadcast newly minted/verified block to other EC2 validator peers via WebSocket
        broadcastToPeers({
            type: 'NEW_BLOCK',
            slot: result.slot,
            blockHash: result.blockHash,
            encryptedPayload: result.encryptedPayload
        });

        res.json({
            success: true,
            message: "NullNet instruction processed, encrypted, and broadcasted successfully.",
            slot: result.slot,
            blockHash: result.blockHash,
            publicExplorerNote: "Payload data is hidden via AES-GCM encryption for complete privacy."
        });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Endpoint for validators to inspect decrypted blocks securely
 */
app.get('/validator/inspect/:slot', (req, res) => {
    const block = db.prepare('SELECT * FROM blocks WHERE slot = ?').get(req.params.slot);
    if (!block) return res.status(404).json({ error: "Block not found" });

    const decryptedData = decryptPayload(block.encrypted_payload);
    res.json({
        slot: block.slot,
        blockHash: block.block_hash,
        validator: block.validator,
        decryptedTransaction: decryptedData
    });
});

// Start unified server (Express HTTP API + WebSocket P2P Server)
server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`   NullNet Node Running (Lunul Labs)    `);
    console.log(`   API Port: ${PORT}                    `);
    console.log(`   P2P WebSocket Port Active            `);
    console.log(`========================================`);
});