const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

// Network shared encryption key (in production, derived via asymmetric ECIES between user and validators)
// For NullNet, validators share this master viewing/execution key to process encrypted blocks.
const NULLNET_SECRET_KEY_HEX = process.env.NULLNET_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ENCRYPTION_KEY = Buffer.from(NULLNET_SECRET_KEY_HEX, 'hex');
const IV_LENGTH = 16; // AES block size

/**
 * Encrypt transaction payload so it looks like random noise publicly
 */
function encryptPayload(transactionObject) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(JSON.stringify(transactionObject), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Return combined payload string stored in SQLite block history
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt payload securely on validator nodes
 */
function decryptPayload(encryptedString) {
    const parts = encryptedString.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
}

/**
 * Verify Solana-style Ed25519 signature
 */
function verifySignature(transaction, signatureBase58, publicKeyBase58) {
    try {
        const messageBytes = Buffer.from(JSON.stringify(transaction));
        const signatureBytes = bs58.decode(signatureBase58);
        const publicKeyBytes = bs58.decode(publicKeyBase58);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        return false;
    }
}

/**
 * Sign transaction with a user wallet secret key
 */
function signTransaction(transaction, secretKeyBase58) {
    const messageBytes = Buffer.from(JSON.stringify(transaction));
    const secretKeyBytes = bs58.decode(secretKeyBase58);
    const signatureBytes = nacl.sign.detached(messageBytes, secretKeyBytes);
    return bs58.encode(signatureBytes);
}

module.exports = {
    encryptPayload,
    decryptPayload,
    verifySignature,
    signTransaction
};