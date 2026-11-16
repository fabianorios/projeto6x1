import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pathForShellMode, shellModeFromPath } from './shellMode'

describe('shellModeFromPath', () => {
  it('maps / and unknown paths to wizard', () => {
    assert.equal(shellModeFromPath('/'), 'wizard')
    assert.equal(shellModeFromPath(''), 'wizard')
    assert.equal(shellModeFromPath('/wizard'), 'wizard')
    assert.equal(shellModeFromPath('/foo'), 'wizard')
  })

  it('maps /studio (with optional trailing slash) to studio', () => {
    assert.equal(shellModeFromPath('/studio'), 'studio')
    assert.equal(shellModeFromPath('/studio/'), 'studio')
    assert.equal(shellModeFromPath('/studio?x=1'), 'studio')
  })
})

describe('pathForShellMode', () => {
  it('returns stable paths', () => {
    assert.equal(pathForShellMode('wizard'), '/')
    assert.equal(pathForShellMode('studio'), '/studio')
  })
})
