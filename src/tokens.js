const db = require('./db');

/**
 * Initialize a new LPL Token Mint (Solana SPL style)
 */
function handleCreateMint(transaction) {
    const { mintAddress, authority, decimals, initialSupply } = transaction.payload;

    // Check if mint already exists
    const existing = db.prepare('SELECT * FROM lpl_mints WHERE mint_address = ?').get(mintAddress);
    if (existing) throw new Error("LPL Mint already exists.");

    // Insert Mint record
    db.prepare(`
        INSERT INTO lpl_mints (mint_address, authority, decimals, supply)
        VALUES (?, ?, ?, ?)
    `).run(mintAddress, authority, decimals, initialSupply);

    // Create a token account for the authority to hold the initial supply
    db.prepare(`
        INSERT INTO lpl_accounts (owner, mint_address, balance)
        VALUES (?, ?, ?)
    `).run(authority, mintAddress, initialSupply);
}

/**
 * Transfer LPL Tokens between accounts
 */
function handleTransferLPL(transaction) {
    const { sender, recipient, mintAddress, amount } = transaction.payload;

    // 1. Check sender's LPL token account balance
    const senderTokenAcc = db.prepare(`
        SELECT * FROM lpl_accounts WHERE owner = ? AND mint_address = ?
    `).get(sender, mintAddress);

    if (!senderTokenAcc || BigInt(senderTokenAcc.balance) < BigInt(amount)) {
        throw new Error("Insufficient LPL token balance.");
    }

    // 2. Ensure recipient has an LPL token account (auto-create if missing, like Solana ATAs)
    let recipientTokenAcc = db.prepare(`
        SELECT * FROM lpl_accounts WHERE owner = ? AND mint_address = ?
    `).get(recipient, mintAddress);

    if (!recipientTokenAcc) {
        db.prepare(`
            INSERT INTO lpl_accounts (owner, mint_address, balance)
            VALUES (?, ?, '0')
        `).run(recipient, mintAddress);
    }

    // 3. Execute balance updates
    const newSenderBalance = BigInt(senderTokenAcc.balance) - BigInt(amount);
    const updatedRecipientAcc = db.prepare(`
        SELECT balance FROM lpl_accounts WHERE owner = ? AND mint_address = ?
    `).get(recipient, mintAddress);
    const newRecipientBalance = BigInt(updatedRecipientAcc.balance) + BigInt(amount);

    db.prepare(`UPDATE lpl_accounts SET balance = ? WHERE owner = ? AND mint_address = ?`)
        .run(newSenderBalance.toString(), sender, mintAddress);

    db.prepare(`UPDATE lpl_accounts SET balance = ? WHERE owner = ? AND mint_address = ?`)
        .run(newRecipientBalance.toString(), recipient, mintAddress);
}

module.exports = { handleCreateMint, handleTransferLPL };