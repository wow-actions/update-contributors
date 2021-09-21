import * as core from '@actions/core'
import * as github from '@actions/github'

export namespace Util {
  export function getOctokit() {
    const token = core.getInput('GITHUB_TOKEN', { required: true })
    return github.getOctokit(token)
  }

  export function getInputs() {
    const count = parseInt(core.getInput('count'), 10)
    return {
      sort: core.getInput('sort') === 'true',
      count: Number.isNaN(count) ? null : count,
      includeCollaborators: core.getInput('includeCollaborators') === 'true',
      includeBots: core.getInput('includeBots') === 'true',
      affiliation: core.getInput('affiliation') as 'all' | 'direct' | 'outside',
      commitMessage: core.getInput('commitMessage'),
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

    core.debug(`Contributors: ${JSON.stringify(users, null, 2)}`)

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

    core.debug(`Collaborators: ${JSON.stringify(users, null, 2)}`)

    return users
  }

  export async function getUsers(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repo: string,
    options: ReturnType<typeof getInputs>,
  ) {
    const excludeUsers = (core.getInput('excludeUsers') || '')
      .split(/\s+/)
      .map((user) => user.trim())
      .filter((user) => user.length > 0)

    const users: { name: string; email: string }[] = []
    const push = (name?: string | null, email?: string | null) => {
      if (name && !excludeUsers.includes(name)) {
        users.push({ name, email: email || '' })
      }
    }

    const contributors = await getContributors(octokit, owner, repo)
    if (options.sort) {
      contributors.sort((a, b) => b.contributions - a.contributions)
    }

    if (options.includeBots) {
      contributors.forEach((user) => push(user.name, user.email))
    } else {
      contributors
        .filter((u) => u.type !== 'Bot')
        .forEach((u) => push(u.name, u.email))
    }

    if (options.includeCollaborators) {
      const collaborators = await getCollaborators(
        octokit,
        owner,
        repo,
        options.affiliation,
      )
      collaborators.forEach((u) => push(u.name, u.email))
    }

    return users
  }
}
