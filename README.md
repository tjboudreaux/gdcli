# gdcli

Minimal CLI for Google Drive, Docs, Sheets, and Slides.

## Install

```bash
npm install -g @tjboudreaux/gdcli
```

## Setup

Before using gdcli, you need OAuth2 credentials from Google Cloud Console:

1. [Create a new project](https://console.cloud.google.com/projectcreate) (or select existing)
2. Enable the following APIs:
   - [Google Drive API](https://console.cloud.google.com/apis/api/drive.googleapis.com)
   - [Google Docs API](https://console.cloud.google.com/apis/api/docs.googleapis.com)
   - [Google Sheets API](https://console.cloud.google.com/apis/api/sheets.googleapis.com)
   - [Google Slides API](https://console.cloud.google.com/apis/api/slides.googleapis.com)
3. [Set app name](https://console.cloud.google.com/auth/branding) in OAuth branding
4. [Add test users](https://console.cloud.google.com/auth/audience) (all Google accounts you want to use)
5. [Create OAuth client](https://console.cloud.google.com/auth/clients):
   - Click "Create Client"
   - Application type: "Desktop app"
   - Download the JSON file

Then configure gdcli:

```bash
gdcli accounts credentials ~/path/to/credentials.json
gdcli accounts add you@gmail.com
```

## Usage

```
gdcli accounts <action>                    Account management
gdcli <email> drive <command> [options]    Google Drive operations
gdcli <email> docs <command> [options]     Google Docs operations
gdcli <email> sheets <command> [options]   Google Sheets operations
gdcli <email> slides <command> [options]   Google Slides operations
```

## Commands

### accounts

```bash
gdcli accounts credentials <file.json>   # Set OAuth credentials (once)
gdcli accounts list                      # List configured accounts
gdcli accounts add <email>               # Add account (opens browser)
gdcli accounts add <email> --manual      # Add account (browserless, paste redirect URL)
gdcli accounts remove <email>            # Remove account
```

### drive

```bash
# List and search
gdcli <email> drive list [--query Q] [--max N] [--type TYPE]
gdcli <email> drive search <query>

# File operations
gdcli <email> drive get <fileId>
gdcli <email> drive download <fileId> [--out PATH]
gdcli <email> drive upload <file> [--parent ID] [--name NAME]
gdcli <email> drive delete <fileId>
gdcli <email> drive move <fileId> --to <folderId>
gdcli <email> drive copy <fileId> [--name NAME]

# Folder operations
gdcli <email> drive mkdir <name> [--parent ID]

# Sharing
gdcli <email> drive share <fileId> --email <email> --role <reader|writer>
gdcli <email> drive permissions <fileId>

# URLs
gdcli <email> drive url <fileIds...>
```

**Type filter options:** `document`, `spreadsheet`, `presentation`, `folder`, `pdf`

**Query syntax examples:**
- `name contains 'report'`
- `mimeType = 'application/pdf'`
- `modifiedTime > '2024-01-01'`
- `'folderId' in parents`

### docs

```bash
gdcli <email> docs get <documentId> [--format text|md|json]
gdcli <email> docs create <title>
gdcli <email> docs append <documentId> --text <text>
gdcli <email> docs replace <documentId> --find <text> --replace <text>
gdcli <email> docs url <documentIds...>
```

### sheets

```bash
gdcli <email> sheets get <spreadsheetId>
gdcli <email> sheets read <spreadsheetId> <range>
gdcli <email> sheets create <title>
gdcli <email> sheets write <spreadsheetId> <range> --values <csv>
gdcli <email> sheets append <spreadsheetId> <range> --values <csv>
gdcli <email> sheets clear <spreadsheetId> <range>
gdcli <email> sheets add-sheet <spreadsheetId> <name>
gdcli <email> sheets url <spreadsheetIds...>
```

**Range notation (A1):**
- `Sheet1!A1:B10` - Specific range
- `Sheet1!A:A` - Entire column
- `Sheet1` - Entire sheet

### slides

```bash
gdcli <email> slides get <presentationId>
gdcli <email> slides create <title>
gdcli <email> slides add-slide <presentationId> [--layout LAYOUT]
gdcli <email> slides delete-slide <presentationId> <pageId>
gdcli <email> slides replace <presentationId> --find <text> --replace <text>
gdcli <email> slides thumbnail <presentationId> <pageId> [--out PATH]
gdcli <email> slides url <presentationIds...>
```

**Layout options:** `BLANK`, `TITLE`, `TITLE_AND_BODY`, `TITLE_AND_TWO_COLUMNS`, `TITLE_ONLY`, `SECTION_HEADER`

## Examples

```bash
# List all documents
gdcli you@gmail.com drive list --type document

# Search for files
gdcli you@gmail.com drive search "name contains 'Q4 Report'"

# Download a file
gdcli you@gmail.com drive download 1abc123xyz --out ./report.pdf

# Upload a file to a folder
gdcli you@gmail.com drive upload ./data.csv --parent 1folderid123

# Get document as markdown
gdcli you@gmail.com docs get 1docid123 --format md

# Read spreadsheet range
gdcli you@gmail.com sheets read 1sheetid123 "Sheet1!A1:D10"

# Write to spreadsheet
gdcli you@gmail.com sheets write 1sheetid123 "A1:B2" --values "Name,Age
Alice,30"

# Create a presentation
gdcli you@gmail.com slides create "Q4 Review"

# Add a slide
gdcli you@gmail.com slides add-slide 1presid123 --layout TITLE_AND_BODY
```

## Data Storage

All data is stored in `~/.gdcli/`:

- `credentials.json` - OAuth client credentials
- `accounts.json` - Account tokens
- `downloads/` - Downloaded files

## Development

```bash
npm install
npm run build
npm run check
npm test
```

## License

MIT
