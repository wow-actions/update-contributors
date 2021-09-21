import * as core from '@actions/core'
import * as github from '@actions/github'
import { exec } from 'child_process'

export namespace Util {
  export function getOctokit() {
    const token = core.getInput('GITHUB_TOKEN', { required: true })
    return github.getOctokit(token)
  }

  export function getInputs() {
    return {
      sort: core.getInput('sort') !== 'false',
      shorten: core.getInput('shorten') !== 'true',
      includeCollaborators: core.getInput('include_collaborators') !== 'false',
      includeBots: core.getInput('include_bots') !== 'false',
      affiliation: core.getInput('affiliation') as 'all' | 'direct' | 'outside',
      commitMessage: core.getInput('commit_message'),
    }
  }

  async function getContributors(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repo: string,
  ) {
    const req = (page?: number) =>
      octokit.rest.repos.listContributors({
        owner,
        repo,
        page,
        per_page: 100,
      })

    const res = await req()
    const users = res.data || []
    const { link } = res.headers
    const matches = link ? link.match(/[&|?]page=\d+/gim) : null
    if (matches) {
      const nums = matches.map((item) => parseInt(item.split('=')[1], 10))
      const min = Math.min(...nums)
      const max = Math.max(...nums)
      for (let i = min; i <= max; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await req(i)
        if (data) {
          users.push(...data)
        }
      }
    }

    return users
  }

  async function getCollaborators(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repo: string,
    affiliation: 'all' | 'direct' | 'outside',
  ) {
    const req = (page?: number) =>
      octokit.rest.repos.listCollaborators({
        owner,
        repo,
        page,
        affiliation,
        per_page: 100,
      })
    const res = await req()
    const users = res.data || []
    const { link } = res.headers
    const matches = link ? link.match(/[&|?]page=\d+/gim) : null
    if (matches) {
      const nums = matches.map((item) => parseInt(item.split('=')[1], 10))
      const min = Math.min(...nums)
      const max = Math.max(...nums)
      for (let i = min; i <= max; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await req(i)
        if (data) {
          users.push(...data)
        }
      }
    }

    return users
  }

  function getUsersFromLog(): Promise<
    {
      commits: number
      name: string
      email: string
    }[]
  > {
    return new Promise((resolve) => {
      exec('git shortlog -se --all', (err, stdout) => {
        if (err) {
          resolve([])
        } else {
          const authors = stdout
            .split(/\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
              const parts = line.split(/[\t\s]+/)
              return {
                commits: parseInt(parts[0], 10),
                name: parts[1],
                email: parts[2].substr(1, parts[2].length - 2),
              }
            })
          resolve(authors)
        }
      })
    })
  }

  export async function getUsers(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repo: string,
    options: ReturnType<typeof getInputs>,
  ) {
    const excludeUsers = (core.getInput('exclude_users') || '')
      .split(/\s+/)
      .map((user) => user.trim())
      .filter((user) => user.length > 0)

    const logUsers = await getUsersFromLog()
    const emailMap: Record<string, string> = {}
    logUsers.forEach((user) => {
      emailMap[user.name] = user.email
    })

    core.debug(`ExcludeUsers: ${JSON.stringify(excludeUsers, null, 2)}`)

    const users: {
      name: string
      email: string
      url: string
    }[] = []

    const push = (user: {
      login?: string | null
      email?: string | null
      // eslint-disable-next-line camelcase
      html_url?: string | null
    }) => {
      if (user.login && !excludeUsers.includes(user.login)) {
        users.push({
          name: user.login,
          email: user.email || emailMap[user.login] || '',
          url: user.html_url || '',
        })
      }
    }

    const contributors = await getContributors(octokit, owner, repo)
    if (options.sort) {
      contributors.sort((a, b) => b.contributions - a.contributions)
    }
    core.debug(`Contributors: ${JSON.stringify(contributors, null, 2)}`)

    if (options.includeBots) {
      contributors.forEach((user) => push(user))
    } else {
      contributors
        .filter((user) => user.type !== 'Bot')
        .forEach((user) => push(user))
    }

    if (options.includeCollaborators) {
      const collaborators = await getCollaborators(
        octokit,
        owner,
        repo,
        options.affiliation,
      )
      core.debug(`Collaborators: ${JSON.stringify(collaborators, null, 2)}`)
      collaborators.forEach((user) => push(user))
    }

    return users
  }
}
