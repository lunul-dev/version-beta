const db = require('./db');
const { encryptPayload } = require('./crypto');
const crypto = require('crypto');

function initializeGenesisBlock() {
    // Check if the genesis block already exists in SQLite
    const existingGenesis = db.prepare('SELECT * FROM blocks WHERE slot = 0').get();
    
    if (existingGenesis) {
        console.log("🟢 NullNet Genesis Block already exists. Skipping initialization.");
        return;
    }

    console.log("⚙️ Initializing NullNet Genesis Block (Lunul Labs)...");

    // Define the root genesis payload
    const genesisTransaction = {
        type: "GENESIS",
        network: "NullNet",
        organization: "Lunul Labs",
        nativeCurrency: "LUN",
        tokenStandard: "LPL",
        message: "NullNet operational. Privacy-first, validator-backed P2P state initialized.",
        timestamp: Date.now()
    };

    // Encrypt the genesis payload to maintain consistency with the privacy model
    const encryptedPayload = encryptPayload(genesisTransaction);
    
    // Generate fixed genesis hash
    const genesisHash = crypto.createHash('sha256')
        .update("NULLNET_GENESIS_ROOT_SEED_LUNUL_LABS" + encryptedPayload)
        .digest('hex');

    // Insert slot 0 into the blocks table
    const insertGenesis = db.prepare(`
        INSERT INTO blocks (slot, block_hash, prev_hash, encrypted_payload, validator) 
        VALUES (?, ?, ?, ?, ?)
    `);

    insertGenesis.run(
        0, 
        genesisHash, 
        "NULLNET_GENESIS_ROOT", 
        encryptedPayload, 
        "LunulLabs-Genesis-Authority"
    );

    console.log("✨ NullNet Genesis Block successfully written to SQLite state!");
    console.log(`📦 Genesis Hash: ${genesisHash}`);
}

// Execute if run directly via node
if (require.main === module) {
    initializeGenesisBlock();
}

module.exports = { initializeGenesisBlock };