/**
 * $DSH_HOME 解析。算错就会把设置/群组写到另一个目录，用户看到的是「配置丢了」。
 */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { dshHomePath, resolveDshHome } from '../src/shared/dshHome.ts'

const CUSTOM = resolve(homedir(), 'custom-dsh-home')
const DEFAULT_HOME = join(homedir(), '.dsh')

afterEach(() => {
  delete process.env.DSH_HOME
})

describe('resolveDshHome', () => {
  it('honours an explicit DSH_HOME', () => {
    expect(resolveDshHome({ DSH_HOME: CUSTOM })).toBe(CUSTOM)
  })

  it('falls back to ~/.dsh when DSH_HOME is missing or blank', () => {
    expect(resolveDshHome({})).toBe(resolve(DEFAULT_HOME))
    expect(resolveDshHome({ DSH_HOME: '' })).toBe(resolve(DEFAULT_HOME))
    expect(resolveDshHome({ DSH_HOME: '   ' })).toBe(resolve(DEFAULT_HOME))
  })

  it('expands a leading ~', () => {
    expect(resolveDshHome({ DSH_HOME: '~' })).toBe(resolve(homedir()))
    expect(resolveDshHome({ DSH_HOME: '~/other' })).toBe(resolve(join(homedir(), 'other')))
  })

  it('resolves a relative DSH_HOME against the working directory', () => {
    expect(resolveDshHome({ DSH_HOME: join('rel', 'home') })).toBe(resolve(join('rel', 'home')))
  })

  it('reads process.env when no env is passed', () => {
    process.env.DSH_HOME = CUSTOM
    expect(resolveDshHome()).toBe(CUSTOM)
  })
})

describe('dshHomePath', () => {
  it('joins the home with the given segments', () => {
    process.env.DSH_HOME = CUSTOM
    expect(dshHomePath('plugins', 'width-slider.json')).toBe(join(CUSTOM, 'plugins', 'width-slider.json'))
  })

  it('is the home itself when no segment is given', () => {
    process.env.DSH_HOME = CUSTOM
    expect(dshHomePath()).toBe(CUSTOM)
  })
})
