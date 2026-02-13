# Splitter - Expense Sharing Made Simple

A modern React-based expense splitting application that helps groups track and settle shared expenses.

## Features

- 👥 **Member Management**: Add and remove group members
- 📁 **Multiple Groups**: Create separate expense groups for different trips, events, or roommates
- ➕ **Flexible Expense Splitting**: Support for equal, percentage-based, and custom splits
- ⚖️ **Balance Tracking**: Real-time balance calculations for all members
- 💸 **Smart Settlements**: Minimizes transactions needed to settle up
- 💾 **GitHub Sync**: Optional GitHub integration for cloud backup and sync across devices
- 📊 **Excel Export**: Export all data to Excel spreadsheets
- 💳 **Payment Recording**: Track payments between members

## Tech Stack

- **React 18**: Modern React with hooks
- **Vite**: Fast build tool and dev server
- **XLSX**: Excel file generation
- **GitHub API**: Optional cloud storage and sync

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173` to see the app.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## How to Use

1. **Add Members**: Start by adding group members
2. **Add Expenses**: Record who paid and how the expense should be split
3. **View Balances**: See who owes whom
4. **Settle Up**: Record payments to balance accounts
5. **Sync (Optional)**: Connect to GitHub to sync across devices

### Split Types

- **Equal**: Divides expense equally among selected members
- **Percentage**: Split by custom percentages
- **Custom**: Specify exact amounts for each member

### GitHub Sync Setup

1. Create a GitHub personal access token with `repo` permissions
2. Click the settings (⚙️) button
3. Enter your token and repository (format: `username/repo-name`)
4. Save and connect

## Project Structure

```
src/
├── components/          # React components
│   ├── Header.jsx
│   ├── MembersList.jsx
│   ├── ExpenseForm.jsx
│   ├── ExpensesList.jsx
│   ├── BalancesTab.jsx
│   ├── SettlementsTab.jsx
│   ├── SettingsModal.jsx
│   ├── GroupModal.jsx
│   ├── PaymentModal.jsx
│   ├── EditExpenseModal.jsx
│   └── SyncIndicator.jsx
├── hooks/               # Custom React hooks
│   ├── useGitHubSync.js
│   └── useAppState.js
├── utils/               # Utility functions
│   ├── helpers.js
│   └── calculations.js
├── styles/              # CSS styles
│   └── App.css
├── App.jsx              # Main app component
└── main.jsx             # Entry point
```

## Migration from Vanilla JS

This project was migrated from vanilla JavaScript to React. The original vanilla JS version is preserved in the `legacy/` folder.

### Key Changes

- Converted imperative DOM manipulation to declarative React components
- Replaced global state with React hooks (`useState`, `useEffect`)
- Created custom hooks for GitHub sync and app state management
- Maintained all original functionality and features
- Improved code organization and maintainability

## License

MIT
