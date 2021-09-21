import * as core from '@actions/core'
import * as github from '@actions/github'
import { Util } from './util'

export namespace Action {
  export async function run() {
    try {
      const { context } = github
      const octokit = Util.getOctokit()
      const options = Util.getInputs()

      core.debug(`inputs: \n ${JSON.stringify(options, null, 2)}`)

      const { repo, owner } = context.repo
      const users = await Util.getUsers(octokit, owner, repo, options)

      core.info(`users: ${users.length}, ${JSON.stringify(users, null, 2)}`)

      const path = 'package.json'
      const readfile = async () => {
        try {
          return await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
          })
        } catch (err) {
          return null
        }
      }

      const res = await readfile()
      if (res) {
        const raw = Buffer.from((res.data as any).content, 'base64').toString()
        const pkg = JSON.parse(raw)
        const contributors: { name: string; email?: string; url?: string }[] =
          Array.isArray(pkg.contributors) ? pkg.contributors : []

        const find = (name: string) => contributors.find((u) => u.name === name)
        let updated = false

        users.forEach((user) => {
          const found = find(user.name)
          if (found) {
            if (user.email !== found.email) {
              updated = true
              found.email = user.email
            }
            if (user.url !== found.url) {
              updated = true
              found.url = user.url
            }
          } else {
            updated = true
            contributors.push({
              name: user.name,
              email: user.email,
              url: user.url,
            })
          }
        })

        if (updated) {
          pkg.contributors = contributors
          const content = JSON.stringify(pkg, null, 2)
          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            content: Buffer.from(content).toString('base64'),
            message: options.commitMessage,
            sha: res ? (res.data as any).sha : undefined,
          })
          core.info(`Updated`)
        } else {
          core.info('No update needed')
        }
      } else {
        core.info('No package.json file found')
      }
    } catch (e) {
      core.setFailed(e)
    }
  }
}
