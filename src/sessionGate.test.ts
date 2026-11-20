import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CLOSED_CLIENT_SESSION,
  openSessionFromLogin,
  openSessionWithoutLogin,
} from './sessionGate'

describe('sessionGate', () => {
  it('starts closed (first paint can show login)', () => {
    assert.equal(CLOSED_CLIENT_SESSION.open, false)
    assert.equal(CLOSED_CLIENT_SESSION.via, null)
    assert.equal(CLOSED_CLIENT_SESSION.email, undefined)
  })

  it('opens from soft login with trimmed email (no server auth)', () => {
    const s = openSessionFromLogin('  consultor@empresa.com.br  ')
    assert.equal(s.open, true)
    assert.equal(s.via, 'login')
    assert.equal(s.email, 'consultor@empresa.com.br')
  })

  it('rejects empty email for soft login', () => {
    assert.deepEqual(openSessionFromLogin(''), CLOSED_CLIENT_SESSION)
    assert.deepEqual(openSessionFromLogin('   '), CLOSED_CLIENT_SESSION)
  })

  it('opens without login (sessão aberta, no email)', () => {
    const s = openSessionWithoutLogin()
    assert.equal(s.open, true)
    assert.equal(s.via, 'continue')
    assert.equal(s.email, undefined)
  })
})
