# Logs Directory

This directory is for storing development and debugging logs.

## Usage

Save your console logs, error logs, or debug outputs here:

```
logs/console-YYYYMMDD-HHMM.txt
logs/sync-errors.log
logs/debug-output.txt
```

## Git Behavior

- ✅ The `logs/` folder structure is tracked in git
- ❌ All `.log` and `.txt` files inside are **ignored** and won't be committed
- This keeps the repo clean while preserving the folder for team use

## Log Files

Common log files you might save here:
- Browser console exports
- Server error logs  
- Sync debugging outputs
- Network request/response logs
- Stack traces

**Note**: Files in this folder are automatically ignored by `.gitignore`
