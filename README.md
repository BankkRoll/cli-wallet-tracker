<div align="center">

<h1>Solana Wallet Transaction Tracker</h1>

<img src="https://github.com/user-attachments/assets/92136b5b-e2b8-4292-9c10-9d49ccac9dc2" alt="CLI Screenshot" style="max-width: 100%;">

<h2>Introduction</h2>

<p style="max-width: 600px; margin: 0 auto;">
This tool leverages the Helius API to provide real-time transaction tracking and historical data retrieval for any Solana wallet address.
</p>

</div>

## Key Features

1. **Historical Transaction Fetching**: Retrieve and analyze past transactions for any Solana wallet address.
2. **Real-Time Transaction Tracking**: Set up a WebSocket connection to monitor live transactions as they occur.
3. **DEX Trade Parsing**: Automatically identify and parse decentralized exchange (DEX) trades within transactions.
4. **Token Transfer Analysis**: Detect and display detailed information about token transfers.
5. **Rich Console Output**: Enjoy a visually appealing and informative console display with color-coded transaction details.
6. **Flexible CLI Interface**: Easy-to-use command-line interface for both fetching historical data and tracking real-time transactions.

## Technical Stack

- **Runtime**: Node.js (v14 or later)
- **Package Manager**: npm
- **API Provider**: Helius API
- **Key Libraries**:
  - `@solana/web3.js`: For Solana blockchain interactions
  - `solana-dex-parser`: For parsing DEX transactions
  - `ws`: For WebSocket connections
  - `boxen` and `chalk`: For enhanced console output
  - `commander`: For building the CLI interface
  - `dotenv`: For environment variable management
  - `node-fetch`: For making HTTP requests
  - `ora`: For displaying loading spinners

## Prerequisites

Before you begin, ensure you have the following:

1. Node.js installed (version 14 or later)
2. npm (Node Package Manager)
3. A Helius API key (sign up at https://helius.dev/)
4. Basic familiarity with Solana blockchain concepts

## Installation Guide

1. **Clone the Repository**:
   ```
   git clone https://github.com/BankkRoll/solana-wallet-tracker.git
   cd solana-wallet-tracker
   ```

2. **Install Dependencies**:
   ```
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the project root and add your Helius API key:
   ```
   HELIUS_API_KEY=your_api_key_here
   ```

4. **Verify Installation**:
   Run `npm run start` to verify that the CLI is working correctly.

## Usage Instructions

The application provides two primary modes of operation: fetching historical transactions and tracking real-time transactions.

### Fetching Historical Transactions

Command:
```
npm run start fetch <wallet_address> -l <limit>
```

Parameters:
- `<wallet_address>`: The Solana wallet address to fetch transactions for.
- `-l <limit>`: (Optional) The number of transactions to fetch. Default is 5, maximum is 100.

Example:
```
npm run start fetch suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK -l 10
```

This command will retrieve the last 10 transactions for the specified wallet and display them in a formatted output.

### Tracking Real-Time Transactions

Command:
```
npm run start track <wallet_address>
```

Parameters:
- `<wallet_address>`: The Solana wallet address to track in real-time.

Example:
```
npm run start track suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK
```

This command will establish a WebSocket connection to monitor the specified wallet for new transactions. Each new transaction will be parsed and displayed in real-time.

## Understanding the Output

The application provides detailed, color-coded output for each transaction:

- **Transaction Type**: Buy (green) or Sell (red)
- **Signature**: Unique transaction identifier
- **Timestamp**: Date and time of the transaction
- **Status**: Success (green) or Failed (red)
- **Fee**: Transaction fee in SOL
- **DEX Trade Details**: Input and output token amounts, DEX name, and program ID
- **Token Transfer Details**: Transfer type (Received/Sent), token name, amount, sender, and recipient

![image](https://github.com/user-attachments/assets/f83bf447-7c95-4438-bc21-8f3f3650222d)

## Troubleshooting

Common issues and solutions:

1. **WebSocket Disconnections**: If you experience frequent disconnections, check your internet connection and Helius API rate limits.
2. **Missing Transactions**: Ensure your Helius API key has the necessary permissions and that you're not exceeding rate limits.
3. **Parsing Errors**: For transactions that fail to parse, check the console for error messages and consider updating the parsing logic for new transaction types.

## Contributing

Contributions to the Solana Wallet Transaction Tracker are welcome! Here's how you can contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please ensure your code adheres to the existing style and includes appropriate tests and documentation.

## License

This project is licensed under the MIT License. See the `LICENSE` file in the repository for full details.

## Disclaimer

This tool is provided for educational and research purposes only. Always verify transaction data independently and consult with financial and legal professionals before making any blockchain-related decisions.
