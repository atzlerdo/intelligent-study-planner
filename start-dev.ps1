# Intelligent Study Planner - Development Server Launcher
# This script starts both frontend and backend servers

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Intelligent Study Planner" -ForegroundColor Cyan
Write-Host "Development Server Launcher" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# Refresh PATH environment variable
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Check if Node.js is installed
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "✓ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "✓ npm: $npmVersion`n" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js or npm not found!" -ForegroundColor Red
    Write-Host "Please install Node.js from: https://nodejs.org/`n" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if dependencies are installed
Write-Host "Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
}
if (-not (Test-Path "server/node_modules")) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location server
    npm install
    Set-Location ..
}
Write-Host "✓ Dependencies installed`n" -ForegroundColor Green

# Check if .env.local files exist
Write-Host "Checking environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path ".env.local")) {
    Write-Host "⚠ Warning: .env.local not found!" -ForegroundColor Yellow
    Write-Host "Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env.local
    Write-Host "✓ Created .env.local - PLEASE EDIT WITH YOUR CREDENTIALS!" -ForegroundColor Green
}
if (-not (Test-Path "server/.env.local")) {
    Write-Host "⚠ Warning: server/.env.local not found!" -ForegroundColor Yellow
    Write-Host "Creating from server/.env.example..." -ForegroundColor Yellow
    Copy-Item server/.env.example server/.env.local
    Write-Host "✓ Created server/.env.local - PLEASE EDIT WITH YOUR CREDENTIALS!" -ForegroundColor Green
}
Write-Host "✓ Environment files present`n" -ForegroundColor Green

# Start backend server in background
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Starting Backend Server..." -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location server
    npm run dev
}

Start-Sleep -Seconds 3

# Start frontend server
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Starting Frontend Server..." -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

Write-Host "Backend running in background (Job ID: $($backendJob.Id))" -ForegroundColor Green
Write-Host "Frontend starting in foreground...`n" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both servers`n" -ForegroundColor Yellow

try {
    npm run dev
} finally {
    Write-Host "`nStopping backend server..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob
    Remove-Job -Job $backendJob
    Write-Host "✓ Servers stopped" -ForegroundColor Green
}
