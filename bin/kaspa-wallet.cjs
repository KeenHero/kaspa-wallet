#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

function run() {
  const appRoot = path.resolve(__dirname, '..')
  const distEntry = path.join(appRoot, 'dist', 'index.html')

  if (!fs.existsSync(distEntry)) {
    console.error('Kaspa Wallet build assets are missing (dist/index.html not found).')
    console.error('Reinstall the package or republish with prebuilt assets.')
    process.exit(1)
    return
  }

  let electronBinary
  try {
    electronBinary = require('electron')
  } catch (error) {
    console.error('Electron runtime is not available for this package.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
    return
  }

  const child = spawn(electronBinary, [appRoot], {
    stdio: 'inherit',
    windowsHide: false,
  })

  child.on('error', (error) => {
    console.error('Failed to launch Kaspa Wallet.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })
}

run()
