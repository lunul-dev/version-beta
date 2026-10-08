const nacl = require('tweetnacl');
const bs58 = require('bs58');

/**
 * 1. Generate a Solana-style NullNet Wallet
 */
function generateWallet() {
    const keypair = nacl.sign.keyPair();
    return {
        publicKey: bs58.encode(keypair.publicKey),
        secretKey: bs58.encode(keypair.secretKey)
    };
}

/**
 * 2. Sign Transaction with Ed25519 Private Key
 */
function signTransaction(transaction, secretKeyBase58) {
    const messageBytes = Buffer.from(JSON.stringify(transaction));
    const secretKeyBytes = bs58.decode(secretKeyBase58);
    const signatureBytes = nacl.sign.detached(messageBytes, secretKeyBytes);
    return bs58.encode(signatureBytes);
}

async function runNullNetTest() {
    console.log("========================================");
    console.log("   NullNet Client Test (Lunul Labs)     ");
    console.log("========================================");

    // Generate wallet
    const wallet = generateWallet();
    console.log("🔑 Generated NullNet Wallet Address:");
    console.log(wallet.publicKey);
    console.log("\n⚠️ IMPORTANT: Copy this address and insert it into your SQLite 'accounts' table with a starting balance of '1000' LUN before testing!");

    // Construct a test transaction (Sending LUN and paying a validator fee)
    const transaction = {
        sender: wallet.publicKey,
        recipient: "NullNetRecipientDummyAddress111111111111",
        amount: "50",     // Amount of LUN being transferred
        token: "LUN",     // Native currency
        fee: "5",         // Mandatory fee paid to validators
        nonce: 0,
        timestamp: Date.now()
    };

    console.log("\n📦 Constructing Transaction payload...");
    const signature = signTransaction(transaction, wallet.secretKey);
    console.log("✍️ Transaction signed with Ed25519 signature.");

    // Submit to local NullNet Node API
    console.log("\n🚀 Submitting encrypted transaction to NullNet node (http://localhost:3000/transact)...");
    
    try {
        const response = await fetch('http://localhost:3000/transact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction, signature })
        });

        const result = await response.json();
        console.log("\n✅ Node Response Received:");
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error("\n❌ Connection Failed: Is your NullNet node running? Run `npm start` in another terminal.");
    }
}

runNullNetTest();