#!/usr/bin/env node
/**
 * @file Solana Wallet Transaction Tracker CLI
 * @description An advanced CLI tool for monitoring and analyzing Solana blockchain transactions using the Helius API.
 * @author BankkRoll
 * @version 2.0.0
 * @license MIT
 */

import { Connection, PublicKey } from "@solana/web3.js";

import { Command } from "commander";
import { DexParser } from "solana-dex-parser";
import NodeCache from "node-cache";
import WebSocket from "ws";
import boxen from "boxen";
import chalk from "chalk";
import dotenv from "dotenv";
import fetch from "node-fetch";
import figlet from "figlet";
import { promises as fs } from "fs";
import gradient from "gradient-string";
import ora from "ora";
import termImg from "term-img";
import terminalImage from "terminal-image";
import terminalLink from "terminal-link";

dotenv.config();
const imageCache = new NodeCache({ stdTTL: 3600 });

/**
 * @typedef {Object} Config
 * @property {string} HELIUS_API_KEY - Helius API key
 * @property {string} HELIUS_RPC_URL - Helius RPC URL
 * @property {string} HELIUS_WS_URL - Helius WebSocket URL
 * @property {number} MIN_SOL_AMOUNT - Minimum SOL amount for transaction consideration
 * @property {string} SOL_MINT - SOL token mint address
 * @property {string} CACHE_DIR - Directory for caching images
 * @property {string} DEFAULT_TOKEN_ICON - Default token icon URL
 * @property {Object} THEMES - Color themes for CLI output
 */

/** @type {Config} */
const CONFIG = {
  HELIUS_API_KEY: process.env.HELIUS_API_KEY,
  HELIUS_RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  HELIUS_WS_URL: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  MIN_SOL_AMOUNT: 0.001,
  SOL_MINT: "So11111111111111111111111111111111111111112",
  CACHE_DIR: "./.cache/images",
  DEFAULT_TOKEN_ICON: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  THEMES: {
    success: gradient(["#00ff00", "#00cc00", "#009900"]),
    error: gradient(["#ff0000", "#cc0000", "#990000"]),
    info: gradient(["#0000ff", "#0000cc", "#000099"]),
    warning: gradient(["#ffff00", "#cccc00", "#999900"]),
  },
};

const connection = new Connection(CONFIG.HELIUS_RPC_URL);
const dexParser = new DexParser(connection);

/**
 * Initializes the cache directory for storing images.
 * @async
 * @function initializeCache
 * @returns {Promise<void>}
 */
async function initializeCache() {
  try {
    await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to create cache directory:", error);
  }
}

/**
 * Formats a number for display, using appropriate suffixes and decimal places.
 * @function formatNumber
 * @param {number} num - The number to format
 * @returns {string} The formatted number as a string
 */
function formatNumber(num) {
  if (typeof num !== "number" || isNaN(num)) return "N/A";
  const formats = [
    { threshold: 1e9, suffix: "B", divisor: 1e9 },
    { threshold: 1e6, suffix: "M", divisor: 1e6 },
    { threshold: 1e3, suffix: "K", divisor: 1e3 },
  ];
  for (const { threshold, suffix, divisor } of formats) {
    if (num >= threshold) return `${(num / divisor).toFixed(2)}${suffix}`;
  }
  return num < 0.00001 ? num.toExponential(4) : num.toFixed(5);
}

/**
 * Fetches asset information for a given mint address.
 * @async
 * @function fetchAssetInfo
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
        params: { id: mint, displayOptions: { showFungible: true, showInscription: true, showCollectionMetadata: true } },
      }),
    });
    const { result } = await response.json();
    return result;
  } catch (error) {
    console.error(`Error fetching asset info for ${mint}:`, error);
    return null;
  }
}

/**
 * Downloads and caches an image from a given URL.
 * @async
 * @function downloadAndCacheImage
 * @param {string} url - The URL of the image to download
 * @returns {Promise<Buffer|null>} The image buffer or null if an error occurs
 */
async function downloadAndCacheImage(url) {
  const cacheKey = `img_${url}`;
  const cached = imageCache.get(cacheKey);
  if (cached) return cached;
  try {
    const response = await fetch(url);
    const buffer = await response.buffer();
    imageCache.set(cacheKey, buffer);
    return buffer;
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Renders a token image in the terminal.
 * @async
 * @function renderTokenImage
 * @param {Buffer} imageBuffer - The image buffer to render
 * @param {Object} options - Options for rendering the image
 * @param {number} options.width - The width of the rendered image
 * @param {number} options.height - The height of the rendered image
 * @returns {Promise<string>} The rendered image as a string
 */
async function renderTokenImage(imageBuffer, options = { width: 10, height: 10 }) {
  if (!imageBuffer) return "🪙";
  try {
    return await terminalImage.buffer(imageBuffer, options);
  } catch (error) {
    return termImg(imageBuffer, { fallback: () => "🪙", ...options });
  }
}

/**
 * Creates a compact transaction card for display in the terminal.
 * @function createTransactionCard
 * @param {Object} data - The transaction data
 * @returns {string} The formatted transaction card as a string
 */
function createTransactionCard(data) {
  const formatTokenInfo = (token, type) => {
    const name = token.name.length > 10 ? `${token.name.slice(0, 8)}..` : token.name;
    const amount = formatNumber(Number.parseFloat(token.amount)) || 'N/A';
    const price = formatNumber(Number.parseFloat(token.price)) || 'N/A';
    const mintShort = `${token.mint.slice(0, 4)}..${token.mint.slice(-4)}`;
    const arrow = type === 'IN ' ? '▼' : '▲';
    const color = type === 'IN ' ? chalk.green : chalk.red;
    return color(`${arrow} ${name} | ${amount} @ $${price} | ${terminalLink(mintShort, `https://solscan.io/token/${token.mint}`)}`);
  };

  const nonSolToken = data.type === "BUY" ? data.outputToken : data.inputToken;
  const solToken = data.type === "BUY" ? data.inputToken : data.outputToken;

  const tokenInfo = formatTokenInfo(nonSolToken, data.type === "BUY" ? 'IN ' : 'OUT');
  const solInfo = formatTokenInfo(solToken, data.type === "BUY" ? 'OUT' : 'IN ');
  const statusSymbol = data.status === 'success' ? '✅' : '❌';
  const typeColor = data.type === "BUY" ? chalk.green : chalk.red;

  return boxen(
    `
${typeColor.bold(data.type)} | ${chalk.blue(data.timestamp)}
${nonSolToken.image}
${tokenInfo}
${solInfo}
${statusSymbol} | ${chalk.yellow(`Fee: ${data.fee} SOL`)} | ${chalk.cyan(`Sig: ${terminalLink(data.signature.slice(0, 8) + '...', `https://solscan.io/tx/${data.signature}`)}`)}
`.trim(),
    {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: data.type === "BUY" ? "green" : "red",
    }
  );
}

/**
 * Parses a transaction and displays its details.
 * @async
 * @function parseTransaction
 * @param {string} signature - The transaction signature
 * @param {string} trackedWallet - The wallet address being tracked
 * @returns {Promise<void>}
 */
async function parseTransaction(signature, trackedWallet) {
  if (!signature) {
    console.error("Invalid signature received:", signature);
    return;
  }

  const spinner = ora({ text: "Parsing transaction...", spinner: "dots12", color: "yellow" }).start();

  try {
    const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
    if (!tx) {
      spinner.fail(chalk.red(`Transaction not found: ${signature}`));
      return;
    }

    if (tx.meta.fee / 1e9 < CONFIG.MIN_SOL_AMOUNT) {
      spinner.info(chalk.yellow(`Skipping low-value transaction: ${signature}`));
      return;
    }

    const trades = dexParser.parseTrades(tx);
    for (const trade of trades) {
      const [inputTokenInfo, outputTokenInfo] = await Promise.all([
        fetchAssetInfo(trade.inputToken.mint),
        fetchAssetInfo(trade.outputToken.mint)
      ]);

      const isBuy = trade.inputToken.mint === CONFIG.SOL_MINT;
      const transactionType = isBuy ? "BUY" : "SELL";

      const [inputTokenImage, outputTokenImage] = await Promise.all([
        downloadAndCacheImage(inputTokenInfo?.content?.links?.image || CONFIG.DEFAULT_TOKEN_ICON),
        downloadAndCacheImage(outputTokenInfo?.content?.links?.image || CONFIG.DEFAULT_TOKEN_ICON)
      ]);

      const transactionData = {
        type: transactionType,
        inputToken: {
          image: await renderTokenImage(inputTokenImage),
          name: inputTokenInfo?.content?.metadata?.name || "Unknown",
          mint: trade.inputToken.mint,
          amount: trade.inputToken.amount || 0,
          price: trade.inputToken.price || 0,
        },
        outputToken: {
          image: await renderTokenImage(outputTokenImage),
          name: outputTokenInfo?.content?.metadata?.name || "Unknown",
          mint: trade.outputToken.mint,
          amount: trade.outputToken.amount || 0,
          price: trade.outputToken.price || 0,
        },
        status: tx.meta.err ? "failed" : "success",
        fee: (tx.meta.fee / 1e9).toFixed(6),
        timestamp: new Date(tx.blockTime * 1000).toLocaleString(),
        signature,
      };

      console.log("\n" + createTransactionCard(transactionData));
    }

    spinner.succeed(chalk.green("Transaction parsed successfully"));
  } catch (error) {
    spinner.fail(chalk.red(`Error parsing transaction ${signature}:`));
    console.error(error);
  }
}

/**
 * Sets up a WebSocket connection to monitor wallet transactions.
 * @function setupWebSocket
 * @param {string} wallet - The wallet address to monitor
 * @param {Function} onTransaction - Callback function to handle new transactions
 */
function setupWebSocket(wallet, onTransaction) {
  const ws = new WebSocket(CONFIG.HELIUS_WS_URL);

  ws.on("open", () => {
    console.log(chalk.green("WebSocket connected - watching for new transactions..."));
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "accountSubscribe",
      params: [wallet, { encoding: "jsonParsed", commitment: "confirmed" }],
    }));
    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.ping() }, 30000);
  });

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === "accountNotification") {
        const recentSignatures = await fetchRecentTransactionSignatures(wallet);
        if (recentSignatures.length > 0) {
          const latestSignature = recentSignatures[0];
          console.log(`New transaction detected: ${latestSignature}`);
          await onTransaction(latestSignature);
        }
      }
    } catch (error) {
      console.error("WebSocket message processing error:", error);
    }
  });

  ws.on("error", (error) => console.error("WebSocket error:", error));
  ws.on("close", () => {
    console.log(chalk.red("WebSocket disconnected - attempting to reconnect..."));
    setTimeout(() => setupWebSocket(wallet, onTransaction), 5000);
  });
}

/**
 * Fetches recent transaction signatures for a given wallet.
 * @async
 * @function fetchRecentTransactionSignatures
 * @param {string} wallet - The wallet address
 * @returns {Promise<string[]>} An array of transaction signatures
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
    });
    const { result } = await response.json();
    return result.map((tx) => tx.signature);
  } catch (error) {
    console.error("Error fetching recent transaction signatures:", error);
    return [];
  }
}

/**
 * Fetches and parses transactions for a given wallet.
 * @async
 * @function fetchTransactions
 * @param {string} wallet - The wallet address
 * @param {number} limit - The number of transactions to fetch
 * @returns {Promise<void>}
 */
async function fetchTransactions(wallet, limit) {
  const spinner = ora("Fetching transactions...").start();
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
    });
    const { result: signatures } = await response.json();
    if (!signatures?.length) {
      spinner.fail(chalk.red("No transactions found"));
      return;
    }
    spinner.succeed(chalk.green(`Fetched ${signatures.length} transactions`));
    for (const tx of signatures) {
      await parseTransaction(tx.signature, wallet);
    }
  } catch (error) {
    spinner.fail(chalk.red("Error fetching transactions:"));
    console.error(error);
  }
}

/**
 * Tracks transactions for a given wallet in real-time.
 * @async
 * @function trackWallet
 * @param {string} wallet - The wallet address to track
 * @returns {Promise<void>}
 */
async function trackWallet(wallet) {
  setupWebSocket(wallet, async (signature) => {
    try {
      await parseTransaction(signature, wallet);
    } catch (error) {
      console.error(`Error processing transaction ${signature}:`, error);
    }
  });
}

const program = new Command();
program
  .name("solana-wallet-tracker")
  .version("2.0.0")
  .description(false)
  .helpOption(false)
  .addHelpCommand(false)
  .configureHelp({ sortSubcommands: true, sortOptions: true })
  .addHelpText("beforeAll", boxen(createHelpContent(), { padding: 1, margin: 1, borderStyle: "round", borderColor: "green", title: "📊 Solana Wallet Tracker", titleAlignment: "center" }));

program
  .command("fetch")
  .argument("<wallet>", "Wallet address to fetch transactions for")
  .option("-l, --limit <number>", "Number of transactions to fetch", Number.parseInt, 5)
  .action(async (wallet, options) => {
    try {
      await fetchTransactions(wallet, Math.min(options.limit, 100));
    } catch (error) {
      handleError("Fetch command failed", error);
    }
  });

program
  .command("track")
  .argument("<wallet>", "Wallet address to track transactions for")
  .action(async (wallet) => {
    try {
      await trackWallet(wallet);
    } catch (error) {
      handleError("Track command failed", error);
    }
  });

program.on("command:*", () => {
  console.error(boxen(chalk.red("Error: Invalid command\n\n") + chalk.yellow("Run npm start --help to see available commands"), { padding: 1, margin: 1, borderStyle: "round", borderColor: "red" }))
  process.exit(1)
})

/**
 * Handles errors by displaying them in a formatted box.
 * @function handleError
 * @param {string} context - The context in which the error occurred
 * @param {Error} error - The error object
 */
function handleError(context, error) {
  console.error(boxen(chalk.red(`${context}:\n${error.message}`), { padding: 1, margin: 1, borderStyle: "round", borderColor: "red", title: "❌ Error", titleAlignment: "center" }))
  if (process.env.DEBUG) {
    console.error(error)
  }
  process.exit(1)
}

/**
 * Creates the help content for the CLI.
 * @function createHelpContent
 * @returns {string} The formatted help content
 */
function createHelpContent() {
  return [
    chalk.bold.green("🌟 Solana Wallet Transaction Tracker"),
    "",
    chalk.dim("An advanced CLI tool for monitoring and analyzing Solana blockchain transactions."),
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

if (process.argv.length <= 2) {
  showSplashScreen().then(() => {
    program.outputHelp()
  })
} else {
  showSplashScreen().then(() => {
    program.parse(process.argv)
  })
}

await initializeCache()

/**
 * Displays a splash screen with the application name.
 * @async
 * @function showSplashScreen
 * @returns {Promise<void>}
 */
async function showSplashScreen() {
  console.clear()
  console.log(
    boxen(
      gradient.rainbow.multiline(
        figlet.textSync("Solana\nWallet\nTracker", {
          font: "Standard",
          horizontalLayout: "default",
          verticalLayout: "default",
        })
      ),
      { padding: 1, margin: 1, borderStyle: "round" }
    )
  )
  await new Promise((resolve) => setTimeout(resolve, 2000))
}