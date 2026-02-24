import { Command } from 'commander'
import chalk from 'chalk'
import open from 'open'
import { createSpinner, success, info, error } from '../lib/ui.js'
import { createAPIClient } from '../lib/api.js'
import { setAccessToken, setRefreshToken, setUser, getApiUrl, setApiUrl } from '../lib/config.js'
import { hostname } from 'node:os'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 150 // 5 minutes

export const loginCommand = new Command('login')
  .description('Authenticate with ENV Connect')
  .option('--api-url <url>', 'API URL (default: http://localhost:3000)')
  .option('--no-browser', 'Do not automatically open the browser')
  .action(async (options) => {
    try {
      // Set API URL if provided
      if (options.apiUrl) {
        setApiUrl(options.apiUrl)
      }

      const api = createAPIClient()
      const deviceName = `CLI - ${hostname()}`

      info('Starting authentication flow...')

      // Initiate authentication
      const spinner = createSpinner('Generating authentication code...')
      spinner.start()

      const initResponse = await api.post<{
        code: string
        url: string
        expiresAt: number
      }>('/api/cli/auth?action=initiate', { deviceName })

      spinner.stop()

      console.log()
      console.log(chalk.bold('Your authentication code:'))
      console.log()
      console.log(chalk.cyan.bold(`    ${initResponse.code}`))
      console.log()
      console.log(`Open this URL to authenticate:`)
      console.log(chalk.dim(initResponse.url))
      console.log()

      // Open browser if not disabled
      if (options.browser !== false) {
        info('Opening browser...')
        await open(initResponse.url)
      }

      // Poll for authentication
      const pollSpinner = createSpinner('Waiting for authentication...')
      pollSpinner.start()

      let authenticated = false
      let attempts = 0

      while (!authenticated && attempts < MAX_POLL_ATTEMPTS) {
        await sleep(POLL_INTERVAL_MS)

        const pollResponse = await api.get<{
          status: 'pending' | 'authenticated' | 'expired' | 'not_found'
          accessToken?: string
          refreshToken?: string
          user?: {
            id: string
            email: string
            name?: string
          }
        }>('/api/cli/auth', { action: 'poll', code: initResponse.code })

        if (pollResponse.status === 'authenticated') {
          pollSpinner.stop()

          // Save tokens and user info
          if (pollResponse.accessToken) {
            setAccessToken(pollResponse.accessToken)
          }
          if (pollResponse.refreshToken) {
            setRefreshToken(pollResponse.refreshToken)
          }
          if (pollResponse.user) {
            setUser({
              id: pollResponse.user.id,
              email: pollResponse.user.email,
              name: pollResponse.user.name,
            })
          }

          authenticated = true
          console.log()
          success(`Logged in as ${chalk.bold(pollResponse.user?.email)}`)
          console.log()
          console.log('Next steps:')
          console.log(`  ${chalk.cyan('env-connect init')}     Initialize a project in the current directory`)
          console.log(`  ${chalk.cyan('env-connect list')}     List your projects and organizations`)
          console.log()
          break
        }

        if (pollResponse.status === 'expired' || pollResponse.status === 'not_found') {
          pollSpinner.stop()
          error('Authentication code expired. Please try again.')
          process.exit(1)
        }

        attempts++
      }

      if (!authenticated) {
        pollSpinner.stop()
        error('Authentication timed out. Please try again.')
        process.exit(1)
      }
    } catch (err) {
      error(err instanceof Error ? err.message : 'Authentication failed')
      process.exit(1)
    }
  })

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
