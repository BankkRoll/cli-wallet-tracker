#!/usr/bin/env node

/**
 * @fileoverview Solana Wallet Transaction Tracker CLI
 * @description A powerful CLI tool for monitoring and analyzing Solana blockchain transactions
 * using the Helius API. Supports real-time tracking and historical data fetching.
 *
 * @author BankkRoll
 * @version 2.0.0
 * @license MIT
 *
 * @requires node-emoji
 * @requires @solana/web3.js
 * @requires solana-dex-parser
 * @requires ws
 * @requires boxen
 * @requires chalk
 * @requires dotenv
 * @requires node-fetch
 * @requires ora
 * @requires commander
 */

import * as emoji from "node-emoji"

import { Connection, PublicKey } from "@solana/web3.js"

import { Command } from "commander"
import { DexParser } from "solana-dex-parser"
import WebSocket from "ws"
import boxen from "boxen"
import chalk from "chalk"
import dotenv from "dotenv"
import fetch from "node-fetch"
import ora from "ora"

// Load environment variables
dotenv.config()

/**
 * @typedef {Object} Configuration
 * @property {string} HELIUS_API_KEY - Helius API key from environment variables
 * @property {string} HELIUS_RPC_URL - Helius RPC URL constructed with API key
 * @property {string} HELIUS_WS_URL - Helius WebSocket URL constructed with API key
 * @property {number} MIN_SOL_AMOUNT - Minimum SOL amount to consider for transactions
 * @property {string} SOL_MINT - Solana native token mint address
 */

/**
 * @type {Configuration}
 */
const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY,
  HELIUS_RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  HELIUS_WS_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  MIN_SOL_AMOUNT: 0.001,
  SOL_MINT: "So11111111111111111111111111111111111111112",
}

// Validate environment variables
if (!CONFIG.HELIUS_API_KEY) {
  console.error(
    boxen(
      chalk.red("Error: Missing HELIUS_API_KEY environment variable\n\n") +
      chalk.yellow("Please add your Helius API key to the .env file:") +
      chalk.dim("\nHELIUS_API_KEY=your_api_key_here"),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: "red",
      },
    ),
  )
  process.exit(1)
}

// Initialize Solana connection and DEX parser
const connection = new Connection(CONFIG.HELIUS_RPC_URL)
const dexParser = new DexParser(connection)

/**
 * Formats a number for display with appropriate suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 * @throws {TypeError} If input is not a number
 */
function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) {
    throw new TypeError("Input must be a valid number")
  }

  const formats = [
    { threshold: 1e9, suffix: "B", divisor: 1e9 },
    { threshold: 1e6, suffix: "M", divisor: 1e6 },
    { threshold: 1e3, suffix: "K", divisor: 1e3 },
  ]

  for (const { threshold, suffix, divisor } of formats) {
    if (num >= threshold) {
      return `${(num / divisor).toFixed(2)}${suffix}`
    }
  }

  return num < 0.00001 ? num.toExponential(4) : num.toFixed(5)
}

/**
 * Fetches asset information for a given mint address
 * @param {string} mint - The mint address of the asset
 * @returns {Promise<Object|null>} The asset information or null if an error occurs
 */
async function fetchAssetInfo(mint) {
  try {
    const response = await fetch(CONFIG.HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "my-id",
        method: "getAsset",
        params: {
          id: mint,
          displayOptions: {
            showFungible: true,
            showInscription: true,
            showCollectionMetadata: true
          }
        },
      }),
    })
    const { result } = await response.json()
    return result
  } catch (error) {
    console.error(`Error fetching asset info for ${mint}:`, error)
    return null
  }
}

/**
 * Extracts and formats token details from asset information
 * @param {Object} tokenInfo - The token information object
 * @returns {string[]} An array of formatted token details
 */
function getTokenDetails(tokenInfo) {
  if (!tokenInfo) return ["No token information available"]

  const details = []
  if (tokenInfo.content?.metadata?.name) details.push(`Name: ${tokenInfo.content.metadata.name}`)
  if (tokenInfo.content?.metadata?.symbol) details.push(`Symbol: ${tokenInfo.content.metadata.symbol}`)
  if (tokenInfo.id) details.push(`Mint: ${tokenInfo.id}`)
  if (tokenInfo.content?.links?.image) details.push(`Image: ${tokenInfo.content.links.image}`)
  if (tokenInfo.tokenInfo?.supply) details.push(`Supply: ${formatNumber(tokenInfo.tokenInfo.supply)}`)
  if (tokenInfo.tokenInfo?.decimals) details.push(`Decimals: ${tokenInfo.tokenInfo.decimals}`)

  return details.length > 0 ? details : ["No additional token details available"]
}

/**
 * Parses a transaction and displays its details
 * @param {string} signature - The transaction signature
 * @param {string} trackedWallet - The wallet address being tracked
 */
async function parseTransaction(signature, trackedWallet) {
  if (!signature) {
    console.error("Invalid signature received:", signature)
    return
  }

  const spinner = ora("Parsing transaction...").start()
  try {
    const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })
    if (!tx) {
      spinner.fail(chalk.red(`Transaction not found: ${signature}`))
      return
    }

    // Filter out spam transactions
    if (tx.meta.fee / 1e9 < CONFIG.MIN_SOL_AMOUNT) {
      spinner.info(chalk.yellow(`Skipping low-value transaction: ${signature}`))
      return
    }

    spinner.succeed(chalk.green("Transaction parsed successfully"))

    let transactionType = "Unknown"
    const transactionDetails = []

    // Parse DEX trades
    const trades = dexParser.parseTrades(tx)
    if (trades.length > 0) {
      for (const trade of trades) {
        const inputTokenInfo = await fetchAssetInfo(trade.inputToken.mint)
        const outputTokenInfo = await fetchAssetInfo(trade.outputToken.mint)

        // Determine if it's a buy or sell based on SOL as base currency
        const isBuy = trade.inputToken.mint === CONFIG.SOL_MINT
        transactionType = isBuy ? "Buy" : "Sell"

        const inputTokenDetails = getTokenDetails(inputTokenInfo)
        const outputTokenDetails = getTokenDetails(outputTokenInfo)

        transactionDetails.push(
          `${emoji.get("money_with_wings")} ${trade.amm || "Unknown"} Trade (${transactionType})`,
          `Input Token:`,
          ...inputTokenDetails.map(detail => `  ${detail}`),
          `  Amount: ${formatNumber(trade.inputToken.amount)} ${inputTokenInfo?.content?.metadata?.symbol || "Unknown"}`,
          ``,
          `Output Token:`,
          ...outputTokenDetails.map(detail => `  ${detail}`),
          `  Amount: ${formatNumber(trade.outputToken.amount)} ${outputTokenInfo?.content?.metadata?.symbol || "Unknown"}`,
          ``,
          trade.fee ? `Fee: ${formatNumber(trade.fee.amount)} ${trade.fee.mint}` : "",
        )
      }
    }

    const boxContent = [
      chalk.bold(`Transaction: ${transactionType}`),
      `Signature: ${signature}`,
      `Timestamp: ${new Date(tx.blockTime * 1000).toLocaleString()}`,
      `Status: ${tx.meta.err ? chalk.red("Failed") : chalk.green("Success")}`,
      `Fee: ${tx.meta.fee / 1e9} SOL`,
      "",
      ...transactionDetails,
    ].join("\n")

    console.log(
      boxen(boxContent, {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: transactionType === "Buy" || transactionType === "Receive" ? "green" : "red",
      }),
    )
  } catch (error) {
    spinner.fail(chalk.red(`Error parsing transaction ${signature}:`))
    console.error(error)
  }
}

/**
 * Sets up a WebSocket connection to track real-time transactions
 * @param {string} wallet - The wallet address to track
 * @param {Function} onTransaction - Callback function to handle new transactions
 */
function setupWebSocket(wallet, onTransaction) {
  const ws = new WebSocket(CONFIG.HELIUS_WS_URL)

  ws.on("open", () => {
    console.log(chalk.green("WebSocket connected - watching for new transactions..."))
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "accountSubscribe",
        params: [wallet, { encoding: "jsonParsed", commitment: "confirmed" }],
      }),
    )

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    }, 30000)
  })

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString())
      if (message.method === "accountNotification") {
        console.log("Account updated:", message.params.result.value)

        const recentSignatures = await fetchRecentTransactionSignatures(wallet)
        if (recentSignatures.length > 0) {
          const latestSignature = recentSignatures[0]
          console.log(`New transaction detected: ${latestSignature}`)
          await onTransaction(latestSignature)
        }
      }
    } catch (error) {
      console.error("WebSocket message processing error:", error)
    }
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
  })

  ws.on("close", () => {
    console.log(chalk.red("WebSocket disconnected - attempting to reconnect..."))
    setTimeout(() => setupWebSocket(wallet, onTransaction), 5000)
  })
}

/**
 * Fetches recent transaction signatures for a given wallet
 * @param {string} wallet - The wallet address
 * @returns {Promise<Array>} An array of recent transaction signatures
 */
async function fetchRecentTransactionSignatures(wallet) {
  try {
    const response = await fetch(CONFIG.HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-test",
        method: "getSignaturesForAddress",
        params: [new PublicKey(wallet), { limit: 1 }],
      }),
    })

    const { result } = await response.json()
    return result.map((tx) => tx.signature)
  } catch (error) {
    console.error("Error fetching recent transaction signatures:", error)
    return []
  }
}

/**
 * Fetches and parses transactions for a given wallet
 * @param {string} wallet - The wallet address
 * @param {number} limit - The number of transactions to fetch
 */
async function fetchTransactions(wallet, limit) {
  const spinner = ora("Fetching transactions...").start()
  try {
    const response = await fetch(CONFIG.HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "helius-test",
        method: "getSignaturesForAddress",
        params: [new PublicKey(wallet), { limit }],
      }),
    })

    const { result: signatures } = await response.json()
    if (!signatures?.length) {
      spinner.fail(chalk.red("No transactions found"))
      return
    }

    spinner.succeed(chalk.green(`Fetched ${signatures.length} transactions`))

    for (const tx of signatures) {
      await parseTransaction(tx.signature, wallet)
    }
  } catch (error) {
    spinner.fail(chalk.red("Error fetching transactions:"))
    console.error(error)
  }
}

/**
 * Tracks a wallet for new transactions in real-time
 * @param {string} wallet - The wallet address to track
 */
async function trackWallet(wallet) {
  setupWebSocket(wallet, async (signature) => {
    try {
      await parseTransaction(signature, wallet)
    } catch (error) {
      console.error(`Error processing transaction ${signature}:`, error)
    }
  })
}

/**
 * Creates the help content for the CLI
 * @returns {string} Formatted help content
 */
function createHelpContent() {
  return [
    chalk.bold.green("🌟 Solana Wallet Transaction Tracker"),
    "",
    chalk.dim("A powerful CLI tool for monitoring and analyzing Solana blockchain transactions."),
    "",
    chalk.yellow("Usage:"),
    "  $ npm start [command] [options]",
    "",
    chalk.yellow("Commands:"),
    `  ${chalk.green("fetch")} ${chalk.dim("<wallet>")}     Fetch and analyze historical transactions`,
    `  ${chalk.green("track")} ${chalk.dim("<wallet>")}     Monitor wallet transactions in real-time`,
    "",
    chalk.yellow("Options:"),
    `  ${chalk.green("-l, --limit")} ${chalk.dim("<number>")}    Number of transactions to fetch (default: 5, max: 100)`,
    `  ${chalk.green("-h, --help")}              Display this help message`,
    `  ${chalk.green("-v, --version")}           Output the version number`,
    "",
    chalk.yellow("Examples:"),
    chalk.dim("  # Fetch last 10 transactions for a wallet"),
    `  $ npm start fetch ${chalk.blue("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeGWh9r9xtHyhbEy")} -l 10`,
    "",
    chalk.dim("  # Track wallet transactions in real-time"),
    `  $ npm start track ${chalk.blue("5ZWj7a1f8tWkjBESHKgrLmXshuXxqeGWh9r9xtHyhbEy")}`,
    "",
    chalk.yellow("Environment Variables:"),
    `  ${chalk.green("HELIUS_API_KEY")}          Your Helius API key (required)`,
    "",
    chalk.dim("For more information, visit: https://github.com/BankkRoll/solana-wallet-tracker"),
  ].join("\n")
}

// Initialize CLI program
const program = new Command()

// Configure program with custom help
program
  .name("solana-wallet-tracker")
  .version("2.0.0")
  .description(false) // Hide default description - TODO: fix to actually hide as this don't work?
  .helpOption(false) // Disable default help option - TODO: fix to actually hide as this don't work?
  .addHelpCommand(false) // Disable default help command - TODO: fix to actually hide as this don't work?
  .configureHelp({
    sortSubcommands: true,
    sortOptions: true,
  })
  .addHelpText(
    "beforeAll",
    boxen(createHelpContent(), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "green",
      title: "📊 Solana Wallet Tracker",
      titleAlignment: "center",
    }),
  )

// Add commands
program
  .command("fetch")
  .argument("<wallet>", "Wallet address to fetch transactions for")
  .option("-l, --limit <number>", "Number of transactions to fetch", Number.parseInt, 5)
  .action(async (wallet, options) => {
    try {
      await fetchTransactions(wallet, Math.min(options.limit, 100))
    } catch (error) {
      handleError("Fetch command failed", error)
    }
  })

program
  .command("track")
  .argument("<wallet>", "Wallet address to track transactions for")
  .action(async (wallet) => {
    try {
      await trackWallet(wallet)
    } catch (error) {
      handleError("Track command failed", error)
    }
  })

// Error handler for invalid commands
program.on("command:*", () => {
  console.error(
    boxen(chalk.red("Error: Invalid command\n\n") + chalk.yellow("Run npm start --help to see available commands"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
    }),
  )
  process.exit(1)
})

/**
 * Global error handler
 * @param {string} context - Context where the error occurred
 * @param {Error} error - Error object
 */
function handleError(context, error) {
  console.error(
    boxen(chalk.red(`${context}:\n${error.message}`), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
      title: "❌ Error",
      titleAlignment: "center",
    }),
  )
  if (process.env.DEBUG) {
    console.error(error)
  }
  process.exit(1)
}

// Parse arguments or show help
if (process.argv.length <= 2) {
  program.outputHelp()
} else {
  program.parse(process.argv)
}